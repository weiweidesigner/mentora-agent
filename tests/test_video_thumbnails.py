from io import BytesIO
import ast
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from app import video_thumbnails as thumbnails

URL = 'https://resources.ainvest.com/iwcprod-crawl-downloader-hub-pod.media/minor-languages-youtube/sample.jpg'


@pytest.fixture(autouse=True)
def clear_cache():
    thumbnails._CACHE.clear()
    yield
    thumbnails._CACHE.clear()


def original_image():
    image = Image.effect_noise((1920, 1080), 60).convert('RGB')
    stream = BytesIO()
    image.save(stream, 'JPEG', quality=95)
    return stream.getvalue()


@pytest.mark.parametrize('width', [384, 768])
def test_cover_is_resized_webp_and_substantially_smaller(width):
    original = original_image()
    thumbnail = thumbnails.compress_cover(original, width)
    image = Image.open(BytesIO(thumbnail.body))
    assert image.format == 'WEBP'
    assert image.width == width
    assert image.height == width * 9 // 16
    assert len(thumbnail.body) < len(original) * .3
    assert thumbnail.original_bytes == len(original)
    assert not image.getexif()


def test_small_images_are_not_upscaled():
    stream = BytesIO()
    Image.new('RGB', (120, 80)).save(stream, 'PNG')
    result = thumbnails.compress_cover(stream.getvalue(), 384)
    assert Image.open(BytesIO(result.body)).size == (120, 80)


@pytest.mark.parametrize('url', [
    'http://resources.ainvest.com/iwcprod-crawl-downloader-hub-pod.media/a.jpg',
    'https://resources.ainvest.com.evil.test/iwcprod-crawl-downloader-hub-pod.media/a.jpg',
    'https://user:password@cdn.ainvest.com/discovery-video/a.jpg',
    'https://cdn.ainvest.com:8443/discovery-video/a.jpg',
    'https://127.0.0.1/discovery-video/a.jpg',
    'file:///etc/passwd',
    'https://cdn.ainvest.com/other-endpoint',
    'https://cdn.ainvest.com/discovery-video/a.jpg#fragment',
])
def test_untrusted_urls_are_rejected_without_network(url, monkeypatch):
    monkeypatch.setattr(thumbnails.requests, 'get', lambda *a, **kw: pytest.fail('No network'))
    with pytest.raises(HTTPException) as error:
        thumbnails.get_thumbnail(url, 384)
    assert error.value.status_code == 400


def test_endpoint_cache_etag_and_content_type(monkeypatch):
    result = thumbnails.compress_cover(original_image(), 384)
    calls = []
    monkeypatch.setattr(thumbnails, '_download', lambda url, width: calls.append((url, width)) or result)
    app = FastAPI()
    app.include_router(thumbnails.router)
    with TestClient(app) as client:
        first = client.get('/api/video-thumbnail', params={'url': URL})
        assert first.status_code == 200
        assert first.headers['content-type'] == 'image/webp'
        assert first.headers['cache-control'] == 'public, max-age=86400'
        assert first.headers['x-content-type-options'] == 'nosniff'
        second = client.get('/api/video-thumbnail', params={'url': URL}, headers={'If-None-Match': first.headers['etag']})
        assert second.status_code == 304
        assert second.content == b''
        assert calls == [(URL, 384)]
        assert client.get('/api/video-thumbnail', params={'url': URL, 'width': 4000}).status_code == 400


def test_failed_sources_are_short_cached(monkeypatch):
    calls = []
    def fail(*args):
        calls.append(args)
        raise ValueError('Source unavailable')
    monkeypatch.setattr(thumbnails, '_download', fail)
    for _ in range(2):
        with pytest.raises(HTTPException) as error:
            thumbnails.get_thumbnail(URL, 384)
        assert error.value.status_code == 404
    assert len(calls) == 1


def test_html_and_oversized_images_are_rejected():
    with pytest.raises(OSError):
        thumbnails.compress_cover(b'<html>blocked</html>', 384)
    with pytest.raises(ValueError):
        thumbnails.compress_cover(b'x' * (thumbnails._MAX_BYTES + 1), 384)


def test_source_redirects_are_not_followed(monkeypatch):
    class Redirect:
        status_code = 302
        def __enter__(self): return self
        def __exit__(self, *args): return False
    def get(url, **kwargs):
        assert kwargs['allow_redirects'] is False
        assert kwargs['stream'] is True
        return Redirect()
    monkeypatch.setattr(thumbnails.requests, 'get', get)
    with pytest.raises(HTTPException) as error:
        thumbnails.get_thumbnail(URL, 384)
    assert error.value.status_code == 404


@pytest.mark.parametrize('entrypoint', ['main.py', 'presentation.py'])
def test_each_deployed_entrypoint_mounts_the_thumbnail_router(entrypoint):
    tree = ast.parse((Path(__file__).resolve().parents[1] / 'app' / entrypoint).read_text())
    assert any(isinstance(node, ast.ImportFrom) and node.module == 'app.video_thumbnails'
               and any(alias.name == 'router' and alias.asname == 'video_thumbnail_router' for alias in node.names)
               for node in ast.walk(tree))
    assert any(isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
               and node.func.attr == 'include_router' and any(isinstance(arg, ast.Name) and arg.id == 'video_thumbnail_router' for arg in node.args)
               for node in ast.walk(tree))
