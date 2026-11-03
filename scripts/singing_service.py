#!/usr/bin/env python3
"""Authenticated, loopback-only Seed-VC singing conversion worker for Apple Silicon."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field

ROOT = Path(os.environ['SINGING_DATA_DIR']).expanduser().resolve()
CHECKOUT = Path(os.environ['SEED_VC_CHECKOUT']).expanduser().resolve()
TOKEN = Path(os.environ['SINGING_TOKEN_FILE']).read_text().strip()
POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix='seed-vc-metal')
LOCK = threading.Lock()
ENGINE = None
LOAD_ERROR = None
REVISION = '51383efd921027683c89e5348211d93ff12ac2a8'


def catalog():
    value = json.loads((ROOT/'catalog.json').read_text())
    return value['songs'], value['voices']


def checked_file(value):
    path = (ROOT/value).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise ValueError('Invalid catalog file')
    return path


def load_engine():
    global ENGINE, LOAD_ERROR
    try:
        actual=subprocess.check_output(['git','-C',str(CHECKOUT),'rev-parse','HEAD'],text=True).strip()
        if actual!=REVISION:raise RuntimeError('Seed-VC checkout does not match singing.lock.json')
        os.chdir(CHECKOUT)
        sys.path.insert(0,str(CHECKOUT))
        import inference
        from types import SimpleNamespace
        args = SimpleNamespace(f0_condition=True, checkpoint=None, config=None, fp16=False)
        bundle = list(inference.load_models(args))
        # RMVPE returns float64 numpy pitch; MPS tensors require float32.
        import numpy as np
        pitch = bundle[2]
        def pitch32(*a,**kw):return np.asarray(pitch(*a,**kw),dtype=np.float32)
        bundle[2] = pitch32
        if inference.device.type == 'mps':
            # BigVGAN's long grouped transposed convolutions exceed MPS limits.
            # Keep the singing transformer on MPS and decode with the same CPU vocoder.
            import torch
            torch.set_num_threads(min(8,os.cpu_count() or 4))
            vocoder = bundle[3].to('cpu')
            bundle[3] = lambda mel: vocoder(mel.to('cpu'))
            torch.mps.empty_cache()
        # Keep all model access on this one worker and reuse the official inference graph.
        inference.load_models = lambda _: bundle
        ENGINE = inference
    except Exception as exc:
        LOAD_ERROR = type(exc).__name__
        import traceback
        traceback.print_exc()


@asynccontextmanager
async def lifespan(app):
    asyncio.get_running_loop().run_in_executor(POOL,load_engine)
    yield
    POOL.shutdown(wait=False,cancel_futures=True)


app=FastAPI(lifespan=lifespan)


def authorize(request):
    if not TOKEN or not secrets.compare_digest(request.headers.get('Authorization',''),'Bearer '+TOKEN):
        raise HTTPException(401,'Unauthorized')


@app.get('/health')
def health():
    return {'ready':ENGINE is not None,'busy':LOCK.locked(),'engine':'seed-vc-svc','error':LOAD_ERROR}


@app.get('/songs')
def songs(request:Request):
    authorize(request)
    entries,voices=catalog()
    return {'songs':[{'id':s['id'],'title':s['title'],'aliases':s.get('aliases',[]),
                      'seconds':s.get('seconds',20),'source':s.get('source',''),
                      **({'attribution':s['attribution']} if s.get('attribution') else {})} for s in entries],
            'voices':[{'id':v['id'],'label':v['label']} for v in voices],
            'ready':ENGINE is not None}


class Render(BaseModel):
    songId:str=Field(pattern=r'^[a-z0-9_-]{1,64}$')
    voiceId:str=Field(default='companion',pattern=r'^[a-z0-9_-]{1,64}$')


def command(args,timeout=60):
    subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=timeout)


def generate(payload):
    entries,voices=catalog()
    song=next((s for s in entries if s['id']==payload.songId),None)
    voice=next((v for v in voices if v['id']==payload.voiceId),None)
    if not song or not voice:raise HTTPException(404,'歌曲或声线未配置，请先查询曲库')
    vocal=checked_file(song['vocal']);reference=checked_file(voice['reference'])
    backing=checked_file(song['backing']) if song.get('backing') else None
    seconds=min(30,max(3,float(song.get('seconds',20))))
    shift=int(voice.get('semitones',0))
    if not -12<=shift<=12:raise ValueError('Invalid transposition')
    identity=json.dumps([REVISION,song,voice,[(p.stat().st_mtime_ns,p.stat().st_size) for p in [vocal,reference,*([backing] if backing else [])]]],sort_keys=True)
    key=hashlib.sha256(identity.encode()).hexdigest()
    cache=ROOT/'renders';cache.mkdir(mode=0o700,exist_ok=True)
    target=cache/(key+'.silk');meta=cache/(key+'.json')
    if target.is_file() and meta.is_file():
        return target.read_bytes(),json.loads(meta.read_text())
    if ENGINE is None:raise HTTPException(503,'歌声模型正在加载或暂不可用')
    import soundfile as sf
    import pilk
    from types import SimpleNamespace
    started=time.monotonic()
    with tempfile.TemporaryDirectory(prefix='sing-',dir=ROOT) as tmp:
        folder=Path(tmp);source=folder/'source.wav';output=folder/'converted'
        command(['ffmpeg','-v','error','-y','-i',str(vocal),'-t',str(seconds),'-ac','1','-ar','44100',str(source)])
        args=SimpleNamespace(source=str(source),target=str(reference),output=str(output),
                             diffusion_steps=int(os.getenv('SINGING_DIFFUSION_STEPS','30')),
                             length_adjust=1.0,inference_cfg_rate=.7,f0_condition=True,
                             auto_f0_adjust=False,semi_tone_shift=shift,checkpoint=None,config=None,fp16=False)
        ENGINE.main(args)
        files=list(output.glob('*.wav'))
        if len(files)!=1:raise ValueError('Missing converted singing')
        mixed=folder/'mixed.wav'
        if backing:
            command(['ffmpeg','-v','error','-y','-i',str(files[0]),'-i',str(backing),'-filter_complex',
                     '[0:a]volume=0.85[v];[1:a]volume=0.3[b];[v][b]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.9:level=0[a]',
                     '-map','[a]','-t',str(seconds),'-ar','44100',str(mixed)])
        else:
            command(['ffmpeg','-v','error','-y','-i',str(files[0]),'-af','alimiter=limit=0.9:level=0','-t',str(seconds),str(mixed)])
        pcm=folder/'out.pcm';silk=folder/'out.silk'
        command(['ffmpeg','-v','error','-y','-i',str(mixed),'-f','s16le','-ar','24000','-ac','1',str(pcm)])
        pilk.encode(str(pcm),str(silk),pcm_rate=24000,tencent=True)
        audio=silk.read_bytes();duration=pcm.stat().st_size/48000
        if not audio.startswith(b'\x02#!SILK_V3') or len(audio)>2*1024*1024 or not 1<=duration<=30.1:
            raise ValueError('Invalid singing output')
        metadata={'songId':song['id'],'title':song['title'],'voiceId':voice['id'],'duration':round(duration,2),
                  'engine':'seed-vc-svc','revision':REVISION,'generationSeconds':round(time.monotonic()-started,2),
                  'source':song.get('source','')}
        import shutil
        shutil.copyfile(mixed,cache/(key+'.wav'))
        target.write_bytes(audio);target.chmod(0o600);meta.write_text(json.dumps(metadata,ensure_ascii=False));meta.chmod(0o600)
        return audio,metadata


@app.post('/render')
def render(payload:Render,request:Request):
    authorize(request)
    if ENGINE is None:raise HTTPException(503,'歌声模型尚未就绪')
    if not LOCK.acquire(blocking=False):raise HTTPException(409,'歌声服务正在处理另一首歌，请稍后再试')
    try:
        audio,meta=POOL.submit(generate,payload).result()
        return Response(audio,media_type='audio/silk',headers={'X-Audio-Duration':str(meta['duration']),
                        'X-Singing-Engine':'seed-vc-svc','X-Generation-Seconds':str(meta.get('generationSeconds',0))})
    except HTTPException:raise
    except Exception:
        import traceback
        traceback.print_exc()
        raise HTTPException(503,'本次歌声转换未完成，请稍后重试') from None
    finally:LOCK.release()


if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=int(os.getenv('SINGING_PORT','8769')),access_log=False)
