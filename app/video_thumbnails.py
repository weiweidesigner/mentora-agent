"""Bounded WebP thumbnails for the two established AInvest video-cover CDNs.

This is not a general URL proxy: no arbitrary hosts, redirects, credentials,
ports, or filesystem reads. Originals and video playback URLs stay unchanged.
"""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
from threading import Lock, Semaphore
from time import monotonic
from urllib.parse import urlsplit

import requests
from fastapi import APIRouter, HTTPException, Query, Request, Response
from PIL import Image, ImageOps, UnidentifiedImageError

router = APIRouter()
_PREFIXES = {
    "resources.ainvest.com": "/iwcprod-crawl-downloader-hub-pod.media/",
    "cdn.ainvest.com": "/discovery-video/",
}
_MAX_BYTES = 8 * 1024 * 1024
_CACHE: OrderedDict[tuple[str, int], tuple[float, "Thumbnail | None"]] = OrderedDict()
_CACHE_LOCK = Lock()
_WORKERS = Semaphore(4)


@dataclass(frozen=True)
class Thumbnail:
    body: bytes
    etag: str
    original_bytes: int


def validate_cover_url(url: str) -> str:
    try:
        parsed = urlsplit(url)
        valid = (len(url) <= 2048 and parsed.scheme == "https"
                 and parsed.hostname in _PREFIXES and parsed.port in (None, 443)
                 and not parsed.username and not parsed.password and not parsed.fragment
                 and parsed.path.startswith(_PREFIXES[parsed.hostname])
                 and not any(char.isspace() or ord(char) < 32 for char in url))
    except (ValueError, TypeError):
        valid = False
    if not valid:
        raise HTTPException(400, "Unsupported video cover URL")
    return url


def compress_cover(content: bytes, width: int) -> Thumbnail:
    if not content or len(content) > _MAX_BYTES:
        raise ValueError("Cover exceeds the byte limit")
    with Image.open(BytesIO(content)) as image:
        if image.width * image.height > 20_000_000:
            raise ValueError("Cover exceeds the pixel limit")
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((width, width), Image.Resampling.LANCZOS)
        output = BytesIO()
        image.save(output, format="WEBP", quality=72, method=4)
    body = output.getvalue()
    return Thumbnail(body, '"' + sha256(body).hexdigest() + '"', len(content))


def _download(url: str, width: int) -> Thumbnail:
    with requests.get(url, stream=True, allow_redirects=False, timeout=(3, 8),
                      headers={"Accept": "image/*", "User-Agent": "Mentora-Video-Thumbnail/1.0"}) as response:
        if response.status_code != 200:
            raise ValueError("Cover source unavailable")
        if int(response.headers.get("Content-Length", 0)) > _MAX_BYTES:
            raise ValueError("Cover exceeds the byte limit")
        content = bytearray()
        started = monotonic()
        for chunk in response.iter_content(64 * 1024):
            content.extend(chunk)
            if len(content) > _MAX_BYTES or monotonic() - started > 10:
                raise ValueError("Cover download limit exceeded")
    return compress_cover(bytes(content), width)


def get_thumbnail(url: str, width: int) -> Thumbnail:
    key = (validate_cover_url(url), width)
    if width not in (384, 768):
        raise HTTPException(400, "Unsupported thumbnail width")
    with _CACHE_LOCK:
        cached = _CACHE.get(key)
        if cached and cached[0] > monotonic():
            _CACHE.move_to_end(key)
            if cached[1] is None:
                raise HTTPException(404, "Video cover unavailable")
            return cached[1]
    # Limit concurrent upstream downloads and image decodes independently of
    # FastAPI's thread pool; bound both the positive and negative caches.
    with _WORKERS:
        try:
            thumbnail = _download(url, width)
        except (requests.RequestException, ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
            thumbnail = None
    with _CACHE_LOCK:
        _CACHE[key] = (monotonic() + (86400 if thumbnail else 60), thumbnail)
        _CACHE.move_to_end(key)
        while len(_CACHE) > 256:
            _CACHE.popitem(last=False)
    if thumbnail is None:
        raise HTTPException(404, "Video cover unavailable")
    return thumbnail


@router.get("/api/video-thumbnail")
def video_thumbnail(request: Request, url: str = Query(max_length=2048), width: int = 384) -> Response:
    thumbnail = get_thumbnail(url, width)
    headers = {"Cache-Control": "public, max-age=86400", "ETag": thumbnail.etag,
               "X-Content-Type-Options": "nosniff"}
    if request.headers.get("if-none-match") == thumbnail.etag:
        return Response(status_code=304, headers=headers)
    return Response(thumbnail.body, media_type="image/webp", headers=headers)
