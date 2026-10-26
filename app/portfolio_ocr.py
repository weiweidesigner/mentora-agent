"""Local OCR for user-confirmed watchlist imports. No LLM or external upload."""
import base64
import binascii
import io
import os
import re
import shutil
import subprocess
import threading

from fastapi import APIRouter, HTTPException, Request, Response
from PIL import Image, ImageOps, ImageStat, UnidentifiedImageError
from pydantic import BaseModel, Field

router=APIRouter(prefix='/api/portfolio')
_slots=threading.BoundedSemaphore(2)
MAX_BYTES=8*1024*1024
MAX_PIXELS=12_000_000
IGNORED=set('USD HKD CNY RMB SYMBOL STOCKS NASDAQ NYSE AMEX NYSEARCA VOLUME'.split())


class ImageInput(BaseModel):
    image: str=Field(min_length=20,max_length=MAX_BYTES*4//3+256)


def extract_candidates(text):
    """Extract candidates, not investment conclusions or guessed OCR corrections."""
    found={}
    def add(symbol,raw,market):
        key=(market,symbol.split(':')[-1] if market=='us' else symbol)
        if key not in found and len(found)<50:found[key]=dict(symbol=symbol,evidence=raw,market=market,verified=False)
    pattern=r'(?<![A-Za-z0-9])(?:(NASDAQ|NYSEARCA|NYSE|AMEX|HKEX|SSE|SZSE|BSE)\s*:\s*([A-Z0-9]+(?:[.-][A-Z])?)|((?:SH|SZ|BJ)\s*\d{6})|(\d{4,6}\s*\.(?:SH|SZ|BJ|HK))|(\d{5,6})|([A-Z]{1,5}(?:[.-][A-Z])?))(?![A-Za-z0-9])'
    for match in re.finditer(pattern,text):
        exchange,code,prefixed,suffixed,numeric,ticker=match.groups();raw=match[0]
        if exchange:
            market='hk' if exchange=='HKEX' else 'cn' if exchange in {'SSE','SZSE','BSE'} else 'us'
            add(exchange+':'+code,raw,market)
        elif prefixed:
            value=re.sub(r'\s+','',prefixed);add(value[2:]+'.'+value[:2],raw,'cn')
        elif suffixed:
            value=re.sub(r'\s+','',suffixed);add(value,raw,'hk' if value.endswith('.HK') else 'cn')
        elif numeric:
            if len(numeric)==6 and numeric.startswith(('0','3','6','4','8','92')):
                suffix='SH' if numeric.startswith('6') else 'BJ' if numeric.startswith(('4','8','92')) else 'SZ'
                add(numeric+'.'+suffix,raw,'cn')
            elif len(numeric)==5 and numeric.startswith('0'):add(numeric+'.HK',raw,'hk')
        elif ticker and ticker not in IGNORED:add(ticker,raw,'us')
    return list(found.values())


def recognize_image(value):
    binary=shutil.which('tesseract')
    if not binary:raise HTTPException(503,'本机 OCR 引擎未安装，请联系管理员；不会改用大模型识别。')
    if not re.match(r'^data:image/(?:png|jpeg|webp);base64,',value):raise HTTPException(415,'请上传 PNG、JPEG 或 WebP 图片。')
    try:raw=base64.b64decode(value.split(',',1)[1],validate=True)
    except (ValueError,binascii.Error):raise HTTPException(400,'图片编码无效。')
    if len(raw)>MAX_BYTES:raise HTTPException(413,'图片不能超过 8 MB。')
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in {'PNG','JPEG','WEBP'}:raise HTTPException(415,'请上传 PNG、JPEG 或 WebP 图片。')
            if source.width*source.height>MAX_PIXELS:raise HTTPException(413,'图片像素过大，请裁剪到股票列表区域。')
            image=ImageOps.exif_transpose(source).convert('L')
            if ImageStat.Stat(image).mean[0]<127:image=ImageOps.invert(image)
            image=ImageOps.autocontrast(image)
            scale=min(2,2500/max(image.size))
            if scale!=1:image=image.resize((max(1,round(image.width*scale)),max(1,round(image.height*scale))),Image.Resampling.LANCZOS)
            data=io.BytesIO();image.save(data,format='PNG')
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError):raise HTTPException(400,'无法读取图片，请选择有效截图。')
    try:
        result=subprocess.run([binary,'stdin','stdout','-l','eng','--psm','11'],input=data.getvalue(),capture_output=True,timeout=15,env={**os.environ,'OMP_THREAD_LIMIT':'1'})
    except subprocess.TimeoutExpired:raise HTTPException(504,'OCR 识别超时，请裁剪图片后重试。')
    except OSError:raise HTTPException(503,'本机 OCR 暂不可用，请稍后重试；不会改用大模型。')
    if result.returncode:raise HTTPException(422,'OCR 无法识别这张图片，请使用清晰的股票代码截图。')
    text=result.stdout.decode('utf-8',errors='replace')[:20000]
    return dict(engine='tesseract',usesLLM=False,candidates=extract_candidates(text),text=text,requiresConfirmation=True)


@router.post('/favorites/ocr')
def recognize_favorites(payload:ImageInput,request:Request,response:Response):
    if request.headers.get('x-veya-portfolio')!='1' or request.headers.get('sec-fetch-site')=='cross-site':raise HTTPException(403,'请从自选股票图片导入入口操作。')
    response.headers['Cache-Control']='no-store'
    if not _slots.acquire(blocking=False):raise HTTPException(429,'OCR 正在处理其他图片，请稍后重试。')
    try:return recognize_image(payload.image)
    finally:_slots.release()
