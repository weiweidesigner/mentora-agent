#!/usr/bin/env python3
"""Local Apple Silicon Breeze worker; loopback only, authenticated synthesis."""
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
import asyncio
import os
from pathlib import Path
import secrets
import re
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
    instruction: str | None = Field(default=None, max_length=300)


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
        return model_pool.submit(synthesize, payload.text, payload.instruction).result()
    except SpeechTooLong:
        raise HTTPException(413, 'Split speech into smaller complete segments') from None
    except Exception as exc:
        print('Breeze synthesis failed:', type(exc).__name__, flush=True)
        raise HTTPException(503, 'Speech synthesis failed') from None
    finally:
        lock.release()


class SpeechTooLong(ValueError):
    pass


def speech_segments(text, limit=45):
    """Use short complete sentences to reduce premature model EOS on long text."""
    segments = []
    for sentence in re.findall(r'[^。！？!?\n]+[。！？!?\n]*|[。！？!?]+', text):
        sentence = sentence.strip()
        while len(sentence) > limit:
            boundaries = list(re.finditer(r'[，,、：:；;\s]', sentence[:limit]))
            end = boundaries[-1].end() if boundaries else limit
            segments.append(sentence[:end].strip())
            sentence = sentence[end:].strip()
        if sentence:segments.append(sentence)
    return segments


def generate_segment(text, instruction, depth=0):
    import numpy as np
    chunks = []
    rate = None
    exhausted = False
    for chunk in model.generate(text=text, instruct=instruction or VOICE, cfg_scale=4, max_tokens=1800):
        exhausted |= getattr(chunk, 'token_count', 0) >= 1800
        current_rate = int(chunk.sample_rate)
        if rate is not None and rate != current_rate:
            raise RuntimeError('Inconsistent synthesis sample rates')
        rate = current_rate
        chunks.append(np.asarray(chunk.audio).reshape(-1))
    if not chunks or not rate:raise RuntimeError('empty audio')
    audio = np.concatenate(chunks)
    # Conservative sanity check, not an ASR claim of transcript equivalence.
    units = len(re.findall(r'[\u3400-\u9fff]|[A-Za-z0-9]+', text))
    suspicious = len(audio) < rate * max(.1, units / 12)
    if exhausted or suspicious:
        if depth >= 2 or len(text) < 8:
            raise SpeechTooLong('Speech completeness could not be confirmed')
        pieces = speech_segments(text, max(4, len(text)//2))
        if len(pieces) < 2:raise SpeechTooLong('Speech completeness could not be confirmed')
        outputs = [generate_segment(piece, instruction, depth+1) for piece in pieces]
        if any(sr != rate for _, sr in outputs):raise RuntimeError('Inconsistent synthesis sample rates')
        pause = np.zeros(round(rate*.12), dtype=np.float32)
        audio = np.concatenate([part for index, (a, _) in enumerate(outputs) for part in ((pause, a) if index else (a,))])
    return audio, rate


def synthesize(text, instruction=None):
    import numpy as np
    import pilk
    outputs = [generate_segment(part, instruction) for part in speech_segments(text)]
    if not outputs:raise RuntimeError('empty audio')
    rate = outputs[0][1]
    if any(sr != rate for _, sr in outputs):raise RuntimeError('Inconsistent synthesis sample rates')
    pause = np.zeros(round(rate*.12), dtype=np.float32)
    audio = np.concatenate([part for index, (a, _) in enumerate(outputs) for part in ((pause, a) if index else (a,))])
    if len(audio) > rate*55:
        raise SpeechTooLong('Segment exceeds safe voice duration')
    if len(audio) < rate // 10:
        raise RuntimeError('empty audio')
    # Preserve the final phoneme and provide a natural release into silence.
    # Round up to complete 20 ms SILK frames instead of dropping a partial tail.
    audio = np.concatenate((audio, np.zeros(round(rate*.25), dtype=np.float32)))
    frame = max(1, round(rate*.02))
    audio = np.pad(audio, (0, (-len(audio)) % frame))
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
