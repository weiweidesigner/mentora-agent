#!/usr/bin/env python3
"""Local Apple Silicon Breeze worker; loopback only, authenticated synthesis."""
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
import asyncio
import os
from pathlib import Path
import secrets
import tempfile
import threading

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field

lock = threading.Lock()
model = None
model_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="breeze-metal")
TOKEN = Path(os.environ['BREEZE_TOKEN_FILE']).read_text().strip() if os.getenv('BREEZE_TOKEN_FILE') else ''
VOICE = os.getenv('BREEZE_VOICE', '一位声音清晰自然的年轻女性，标准普通话，语气亲切，轻松聊天，语速适中。')


@asynccontextmanager
async def lifespan(app):
    def load_model():
        global model
        from mlx_audio.tts import load
        model = load(os.environ['BREEZE_MODEL_PATH'])
    await asyncio.get_running_loop().run_in_executor(model_pool, load_model)
    yield
    model_pool.shutdown(wait=False, cancel_futures=True)


app = FastAPI(lifespan=lifespan)


class Speech(BaseModel):
    text: str = Field(min_length=1, max_length=300)


@app.get('/health')
def health():
    return {'ready': model is not None, 'busy': lock.locked(), 'engine': 'Breeze TTS 2'}


@app.post('/speech')
def speech(payload: Speech, request: Request):
    if not TOKEN or not secrets.compare_digest(request.headers.get('Authorization', ''), 'Bearer ' + TOKEN):
        raise HTTPException(401, 'Unauthorized')
    if model is None:
        raise HTTPException(503, 'Model not ready')
    if not lock.acquire(blocking=False):
        raise HTTPException(409, 'Speech worker busy')
    try:
        return model_pool.submit(synthesize, payload.text).result()
    except Exception as exc:
        print('Breeze synthesis failed:', type(exc).__name__, flush=True)
        raise HTTPException(503, 'Speech synthesis failed') from None
    finally:
        lock.release()


def synthesize(text):
    import numpy as np
    import pilk
    chunks = []
    for chunk in model.generate(text=text, instruct=VOICE, cfg_scale=4, max_tokens=1800):
        audio = np.asarray(chunk.audio).reshape(-1)
        chunks.append(audio)
    if not chunks:
        raise RuntimeError('empty audio')
    audio = np.concatenate(chunks)
    rate = int(chunk.sample_rate)
    audio = audio[:rate*55]
    if len(audio) < rate // 10:
        raise RuntimeError('empty audio')
    pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()
    with tempfile.TemporaryDirectory(prefix='mentora-breeze-') as folder:
        source, target = Path(folder)/'voice.pcm', Path(folder)/'voice.silk'
        source.write_bytes(pcm)
        pilk.encode(str(source), str(target), pcm_rate=rate, tencent=True)
        silk = target.read_bytes()
    if not silk.startswith(b'\x02#!SILK_V3'):
        raise RuntimeError('invalid SILK')
    return Response(silk, media_type='audio/silk', headers={'X-Audio-Duration': str(round(len(audio)/rate,2))})


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=int(os.getenv('BREEZE_PORT', '8768')), access_log=False)
