"""Bounded, on-demand thumbnails for public AInvest business-component icons."""
from io import BytesIO
import html
import re
from urllib.parse import parse_qs, unquote, urlencode, urlsplit, urlunsplit
import requests
from fastapi import APIRouter, HTTPException, Query, Response
from PIL import Image, ImageOps, UnidentifiedImageError

router = APIRouter()
MAX_BYTES = 3 * 1024 * 1024
SIZES = (48, 72, 112, 336)


def source_url(value):
    parts = urlsplit(value)
    if parts.scheme != 'https' or parts.hostname != 'cdn.ainvest.com' or parts.port not in (None,443) or parts.username or parts.password:
        raise ValueError('Unsupported image source')
    path = '/' + parts.path.lstrip('/')
    if not path.startswith('/icon/') or '..' in unquote(path).split('/') or parts.query or parts.fragment:
        raise ValueError('Unsupported image path')
    return urlunsplit(('https','cdn.ainvest.com',path,'',''))


def compress_image(content, size):
    if size not in SIZES or len(content)>MAX_BYTES: raise ValueError('Unsupported image size')
    with Image.open(BytesIO(content)) as image:
        if image.width*image.height>12_000_000: raise ValueError('Image is too large')
        image=ImageOps.exif_transpose(image).convert('RGBA')
        image.thumbnail((size,size),Image.Resampling.LANCZOS)
        output=BytesIO();image.save(output,format='WEBP',quality=90 if size==336 else 76,lossless=size==336,method=4)
        return output.getvalue()


@router.get('/api/business-image')
def business_image(url: str, size: int = Query(default=72)):
    try:
        source=source_url(url)
        if size not in SIZES: raise ValueError('Unsupported thumbnail size')
    except ValueError:
        raise HTTPException(400,'unsupported image request') from None
    try:
        with requests.get(source,stream=True,allow_redirects=False,timeout=(3,8)) as response:
            if response.status_code!=200: raise ValueError('Image source unavailable')
            chunks=[];length=0
            for chunk in response.iter_content(65536):
                length+=len(chunk)
                if length>MAX_BYTES: raise ValueError('Image is too large')
                chunks.append(chunk)
        content=compress_image(b''.join(chunks),size)
    except (requests.RequestException,ValueError,OSError,UnidentifiedImageError,Image.DecompressionBombError):
        raise HTTPException(502,'image unavailable') from None
    return Response(content,media_type='image/webp',headers={
        'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'})


def upgrade_business_images(artifact, depth=0):
    """Use public thumbnail URLs in known native cards, preserving source URLs/data."""
    if 'id="congress-recent-trades-data"' not in artifact and 'id="smart-money-meta"' not in artifact and 'id="politician-performance-meta"' not in artifact and 'id="politician-holdings-meta"' not in artifact and 'id="politician-trades-meta"' not in artifact:
        return artifact
    if depth > 4:return artifact
    def child(match):
        original=html.unescape(match[2]);updated=upgrade_business_images(original,depth+1)
        return match[0] if updated==original else match[1]+html.escape(updated,quote=True)+match[3]
    artifact=re.sub(r'(\bsrcdoc=")(.*?)(")',child,artifact,flags=re.S)
    portrait_size=336 if 'id="politician-holdings-meta"' in artifact or 'id="politician-trades-meta"' in artifact else 112 if 'id="politician-performance-meta"' in artifact else 72
    def update(match):
        tag=match[0]
        src=re.search(r'\bsrc="([^"]+)"',tag)
        if not src:return tag
        value=html.unescape(src[1]);parts=urlsplit(value)
        if parts.hostname is None and parts.path in ('../api/business-image','/api/business-image','/mentora/api/business-image'):
            value=parse_qs(parts.query).get('url',[''])[0]
        try:source=source_url(value)
        except ValueError:return tag
        size=48 if 'data-stock-logo' in tag else portrait_size
        thumbnail='../api/business-image?'+urlencode({'url':source,'size':size})
        return tag[:src.start(1)]+html.escape(thumbnail,quote=True)+tag[src.end(1):]
    return re.sub(r'<img\b[^>]*>',update,artifact,flags=re.I)
