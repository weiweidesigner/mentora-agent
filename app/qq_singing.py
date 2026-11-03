"""Verified singing-tool receipts, isolated from conversational text and user paths."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import time


def directory():
    return Path(os.getenv('VEYA_DAY_DATA_DIR',str(Path(__file__).resolve().parents[1]/'outputs/day-tasks')))/'qq-voice'


def signature(data):
    key=os.getenv('QQ_SINGING_TOKEN','').strip()
    if not key:raise ValueError('Singing service unavailable')
    body=json.dumps(data,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
    return hmac.new(key.encode(),body,hashlib.sha256).hexdigest()


def validate(receipt,delivery_key=None,folder=None):
    try:
        if not isinstance(receipt,dict):return None
        ident=receipt.get('id','')
        if not isinstance(ident,str) or not re.fullmatch(r'[A-Za-z0-9_-]{32}',ident):return None
        root=Path(folder) if folder is not None else directory()
        data=json.loads((root/(ident+'.song.json')).read_text())
        signed={k:v for k,v in data.items() if k!='signature'}
        if not hmac.compare_digest(str(data.get('signature','')),signature(signed)):return None
        if receipt!=data or (delivery_key is not None and data.get('deliveryKey')!=delivery_key):return None
        if data.get('engine')!='seed-vc-svc' or not 1<=float(data['duration'])<=30.1:return None
        if not 0<=time.time()-float(data['created'])<=900:return None
        path=root/(ident+'.silk');audio=path.read_bytes()
        if not audio.startswith(b'\x02#!SILK_V3') or len(audio)>2*1024*1024:return None
        if hashlib.sha256(audio).hexdigest()!=data['sha256']:return None
        return data
    except (OSError,ValueError,TypeError,KeyError):return None


def save(audio,*,delivery_key,song,voice_id,duration,folder=None):
    if not re.fullmatch(r'[a-f0-9]{32}',delivery_key):raise ValueError('Invalid singing delivery key')
    if not audio.startswith(b'\x02#!SILK_V3') or len(audio)>2*1024*1024:raise ValueError('Invalid singing audio')
    if not 1<=float(duration)<=30.1:raise ValueError('Invalid singing duration')
    root=Path(folder) if folder is not None else directory();root.mkdir(parents=True,exist_ok=True,mode=0o700)
    ident=hashlib.sha256((delivery_key+'|'+song['id']+'|'+voice_id).encode()).hexdigest()[:32]
    data={'id':ident,'songId':song['id'],'title':str(song['title'])[:120],'voiceId':voice_id,
          'duration':float(duration),'engine':'seed-vc-svc','deliveryKey':delivery_key,
          'created':time.time(),'sha256':hashlib.sha256(audio).hexdigest()}
    credit=song.get('attribution','')
    if credit:
        if not isinstance(credit,str) or len(credit)>700:raise ValueError('Invalid song attribution')
        data['attribution']=credit
    data['signature']=signature(data)
    for suffix,body in [('.silk',audio),('.song.json',json.dumps(data,ensure_ascii=False).encode())]:
        path=root/(ident+suffix);temp=root/(ident+suffix+'.tmp')
        temp.write_bytes(body);temp.chmod(0o600);temp.replace(path)
    return data


def receipt_from_event(event,delivery_key):
    """Only signed files from a completed real tool result can cause audio delivery."""
    if not isinstance(event,dict) or event.get('phase') not in ('completed','success') or event.get('error') or event.get('exitCode',0)!=0:return None
    def walk(value,depth=0):
        if depth>9:return None
        if isinstance(value,dict):
            if value.get('ok') is False:return None
            if 'qqSong' in value:
                found=validate(value['qqSong'],delivery_key)
                if found:return found
            for key in ('observation','output','result','content','text','data','summary','dataHandoffs'):
                if key in value:
                    found=walk(value[key],depth+1)
                    if found:return found
        elif isinstance(value,list):
            for item in value[:30]:
                found=walk(item,depth+1)
                if found:return found
        elif isinstance(value,str) and len(value)<=100000:
            start=value.find('{')
            if start>=0:
                try:parsed,_=json.JSONDecoder().raw_decode(value[start:])
                except ValueError:return None
                return walk(parsed,depth+1)
        return None
    return walk(event)


def context(delivery_key):
    if not os.getenv('QQ_SINGING_ENDPOINT') or not os.getenv('QQ_SINGING_TOKEN'):return ''
    return ('QQ 支持本地歌声转换。用户明确点歌时，按正常 Agent 流程调用 singing 能力 singing_render.py；'
            '先用 --operation catalog 查询真实曲库，再用 --operation render --song-id 实际ID '
            '--voice-id companion --delivery-key '+delivery_key+' --output outputs/data/singing-'+delivery_key+'.json 生成。'
            '这是允许的音频生成能力，QQ 通道会发送真实歌声，不需要 HTML、图片或报告。'
            '未收录的歌须明确说明，不能用其他歌冒充；没有真实成功回执不能声称已唱或已发送。'
            '只把生成结果写成一句自然的正文，不输出歌词、路径、回执或内部参数。\n\n')
