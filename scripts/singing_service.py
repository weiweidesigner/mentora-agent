#!/usr/bin/env python3
"""Authenticated, loopback-only Seed-VC singing conversion worker for Apple Silicon."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import asyncio
import hashlib
import hmac
import shutil
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
CATALOG_LOCK = threading.Lock()
LEARNING_POOL = ThreadPoolExecutor(max_workers=1,thread_name_prefix='song-learning')
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
        resume_learning()
    except Exception as exc:
        LOAD_ERROR = type(exc).__name__
        import traceback
        traceback.print_exc()


@asynccontextmanager
async def lifespan(app):
    asyncio.get_running_loop().run_in_executor(POOL,load_engine)
    yield
    LEARNING_POOL.shutdown(wait=False,cancel_futures=True)
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
    owner=library_owner(request)
    entries=[s for s in entries if visible(s,owner)]
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


def locate(payload,owner='',allow_learning=False):
    entries,voices=catalog()
    song=next((s for s in entries if s['id']==payload.songId),None)
    voice=next((v for v in voices if v['id']==payload.voiceId),None)
    if not song or not voice or not visible(song,owner,allow_learning):raise HTTPException(404,'歌曲或声线未配置，请先查询曲库')
    vocal=checked_file(song['vocal']);reference=checked_file(voice['reference'])
    backing=checked_file(song['backing']) if song.get('backing') else None
    return song,voice,vocal,reference,backing


def cache_paths(payload,owner='',allow_learning=False):
    song,voice,vocal,reference,backing=locate(payload,owner,allow_learning)
    identity=json.dumps([REVISION,song,voice,[(p.stat().st_mtime_ns,p.stat().st_size) for p in [vocal,reference,*([backing] if backing else [])]]],sort_keys=True)
    key=hashlib.sha256(identity.encode()).hexdigest()
    cache=ROOT/'renders';cache.mkdir(mode=0o700,exist_ok=True)
    return cache/(key+'.silk'),cache/(key+'.json')


def generate(payload,owner='',allow_learning=False):
    song,voice,vocal,reference,backing=locate(payload,owner,allow_learning)
    seconds=min(30,max(3,float(song.get('seconds',20))))
    shift=int(voice.get('semitones',0))
    if not -12<=shift<=12:raise ValueError('Invalid transposition')
    target,meta=cache_paths(payload,owner,allow_learning)
    cache=target.parent;key=target.stem
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
    owner=library_owner(request)
    target,meta=cache_paths(payload,owner)
    if target.is_file() and meta.is_file():return audio_response(target.read_bytes(),json.loads(meta.read_text()))
    if ENGINE is None:raise HTTPException(503,'歌声模型尚未就绪')
    if not LOCK.acquire(blocking=False):raise HTTPException(409,'歌声服务正在处理另一首歌，请稍后再试')
    try:
        audio,meta=POOL.submit(generate,payload,owner).result()
        return audio_response(audio,meta)
    except HTTPException:raise
    except Exception:
        import traceback
        traceback.print_exc()
        raise HTTPException(503,'本次歌声转换未完成，请稍后重试') from None
    finally:LOCK.release()


def library_owner(request):
    value=request.headers.get('X-Singing-Library','')
    if not value:return ''
    parts=value.split('.')
    if len(parts)!=2 or not re.fullmatch(r'[a-f0-9]{64}',parts[0]):raise HTTPException(403,'曲库身份无效')
    expected=hmac.new(TOKEN.encode(),('song-library:'+parts[0]).encode(),hashlib.sha256).hexdigest()
    if not secrets.compare_digest(parts[1],expected):raise HTTPException(403,'曲库身份无效')
    return parts[0]


def visible(song,owner,allow_learning=False):
    if song.get('owner') and song['owner']!=owner:return False
    if song.get('learningJob') and not allow_learning:
        try:return json.loads(job_path(song['learningJob']).read_text())['state']=='ready'
        except (OSError,ValueError,KeyError):return False
    return True


def audio_response(audio,meta):
    return Response(audio,media_type='audio/silk',headers={'X-Audio-Duration':str(meta['duration']),
                    'X-Singing-Engine':'seed-vc-svc','X-Generation-Seconds':str(meta.get('generationSeconds',0))})


def job_path(ident):
    if not re.fullmatch(r'[a-f0-9]{32}',ident):raise HTTPException(404,'练习不存在')
    return ROOT/'learning'/ident/'job.json'


def write_job(data):
    path=job_path(data['id']);temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(data,ensure_ascii=False));temp.chmod(0o600);temp.replace(path)


def public_job(data):
    return {k:data[k] for k in ('id','state','songId','title','seconds','error') if k in data}


@app.post('/learn/{ident}')
async def learn(ident:str,request:Request,title:str,start:float=45):
    authorize(request);owner=library_owner(request)
    if not owner:raise HTTPException(403,'请从角色曲库发起练习')
    path=job_path(ident)
    if not title.strip() or len(title)>120 or not 0<=start<=3600:raise HTTPException(422,'歌曲参数无效')
    with CATALOG_LOCK:
        if path.exists():
            old=json.loads(path.read_text())
            if old['owner']!=owner:raise HTTPException(404,'练习不存在')
            if old['title']!=title or old['start']!=start:raise HTTPException(409,'请创建新的练习')
            if old['state'] in ('queued','practicing','ready'):return public_job(old)
            if old['state']=='uploading':raise HTTPException(409,'音频正在上传')
        path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        data={'id':ident,'owner':owner,'title':title,'start':start,'songId':'learn-'+ident,'state':'uploading','seconds':20,'error':''}
        write_job(data)
    source=path.parent/'input.mp3';part=path.parent/'input.part';size=0
    try:
        with part.open('wb') as out:
            async for chunk in request.stream():
                size+=len(chunk)
                if size>40*1024*1024:raise HTTPException(413,'MP3 最大 40MB')
                out.write(chunk)
        if size<128:raise HTTPException(422,'MP3 文件为空或无效')
        part.chmod(0o600);part.replace(source)
    except Exception:
        data.update(state='failed',error='MP3 上传未完成');write_job(data);part.unlink(missing_ok=True);raise
    data.update(state='queued');write_job(data);LEARNING_POOL.submit(learn_job,ident)
    return public_job(data)


@app.get('/learning/{ident}')
def learning(ident:str,request:Request):
    authorize(request);owner=library_owner(request)
    try:data=json.loads(job_path(ident).read_text())
    except FileNotFoundError:raise HTTPException(404,'练习不存在') from None
    if not owner or data['owner']!=owner:raise HTTPException(404,'练习不存在')
    return public_job(data)


def learn_job(ident):
    path=job_path(ident);data=json.loads(path.read_text());data.update(state='practicing',error='');write_job(data)
    try:
        staged=path.parent/'prepared';staged.mkdir(exist_ok=True)
        registry=staged/'catalog.json'
        if not registry.exists():registry.write_text(json.dumps({'songs':[],'voices':[]}))
        existing=json.loads(registry.read_text())['songs']
        if not any(s['id']==data['songId'] for s in existing):
            subprocess.run([sys.executable,str(ROOT/'register_singing_song.py'),'--root',str(staged),'--id',data['songId'],
                            '--title',data['title'],'--input',str(path.parent/'input.mp3'),'--start',str(data['start']),
                            '--seconds','20','--alias',data['title'],'--source','User-uploaded private MP3; excerpt and voice conversion.'],
                           check=True,timeout=600,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        song=next(s for s in json.loads(registry.read_text())['songs'] if s['id']==data['songId'])
        import soundfile as sf
        if sf.info(str(staged/song['vocal'])).duration<3:raise ValueError('Clip too short')
        song.update(owner=data['owner'],learningJob=ident)
        with CATALOG_LOCK:
            destination=ROOT/'songs'/song['id']
            if not destination.exists():shutil.copytree(staged/'songs'/song['id'],destination)
            catalog_path=ROOT/'catalog.json';catalog_data=json.loads(catalog_path.read_text())
            if not any(s['id']==song['id'] for s in catalog_data['songs']):
                catalog_data['songs'].append(song);temp=catalog_path.with_suffix('.tmp')
                temp.write_text(json.dumps(catalog_data,ensure_ascii=False,indent=2));temp.chmod(0o600);temp.replace(catalog_path)
        with LOCK:
            _,meta=POOL.submit(generate,Render(songId=song['id']),data['owner'],True).result()
        data.update(state='ready',seconds=meta['duration']);write_job(data)
    except Exception:
        import traceback
        traceback.print_exc()
        data.update(state='failed',error='练习未完成，请检查 MP3、片段起点或稍后重试');write_job(data)


def resume_learning():
    for path in (ROOT/'learning').glob('*/job.json'):
        try:
            data=json.loads(path.read_text())
            if data['state'] in ('queued','practicing'):LEARNING_POOL.submit(learn_job,data['id'])
            elif data['state']=='uploading':data.update(state='failed',error='上传被中断，请重新练习');write_job(data)
        except (OSError,ValueError,KeyError):continue


@app.get('/preview/{song_id}')
def preview(song_id:str,request:Request):
    authorize(request);owner=library_owner(request)
    target,meta=cache_paths(Render(songId=song_id),owner)
    wav=target.with_suffix('.wav')
    if not meta.is_file() or not wav.is_file():raise HTTPException(404,'歌曲尚未练习完成')
    from fastapi.responses import FileResponse
    return FileResponse(wav,media_type='audio/wav',headers={'Cache-Control':'no-store'})


if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=int(os.getenv('SINGING_PORT','8769')),access_log=False)
