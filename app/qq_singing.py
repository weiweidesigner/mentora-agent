"""Verified singing-tool receipts, isolated from conversational text and user paths."""
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import time


def directory():
    return Path(os.getenv('VEYA_DAY_DATA_DIR',str(Path(__file__).resolve().parents[1]/'outputs/day-tasks')))/'qq-voice'


def signature(data):
    key=os.getenv('QQ_SINGING_TOKEN','').strip()
    if not key:raise ValueError('Singing service unavailable')
    body=json.dumps(data,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
    return hmac.new(key.encode(),body,hashlib.sha256).hexdigest()


def library_key(owner):
    if not re.fullmatch(r'[a-f0-9]{64}',owner or ''):raise ValueError('Invalid library owner')
    token=os.environ['QQ_SINGING_TOKEN'].strip()
    return owner+'.'+hmac.new(token.encode(),('song-library:'+owner).encode(),hashlib.sha256).hexdigest()


def edited_catalog(catalog,key):
    """Apply the same owner edits used by the website to QQ singing tools.

    The worker must have already authenticated this library key. The audio cache
    and source metadata remain unchanged when only its displayed name changes.
    """
    owner=key.split('.')[0]
    if not re.fullmatch(r'[a-f0-9]{64}',owner):return catalog
    path=directory().parent/'tasks.sqlite3'
    if not path.exists():return catalog
    with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True) as db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='song_library_edits'").fetchone():return catalog
        edits={row[0]:{'title':row[1],'deleted':row[2]} for row in db.execute('SELECT song_id,title,deleted FROM song_library_edits WHERE owner=?',(owner,))}
    return {**catalog,'songs':[{**song,**({'title':edits[song['id']]['title']} if edits.get(song['id'],{}).get('title') else {})}
            for song in catalog['songs'] if not edits.get(song['id'],{}).get('deleted')]}


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
        if data.get('engine')!='seed-vc-svc' or not math.isfinite(float(data['duration'])) or float(data['duration'])<=0:return None
        if not 0<=time.time()-float(data['created'])<=900:return None
        path=root/(ident+'.silk');audio=path.read_bytes()
        if not audio.startswith(b'\x02#!SILK_V3'):return None
        if hashlib.sha256(audio).hexdigest()!=data['sha256']:return None
        return data
    except (OSError,ValueError,TypeError,KeyError):return None


def save(audio,*,delivery_key,song,voice_id,duration,folder=None):
    if not re.fullmatch(r'[a-f0-9]{32}',delivery_key):raise ValueError('Invalid singing delivery key')
    if not audio.startswith(b'\x02#!SILK_V3'):raise ValueError('Invalid singing audio')
    if not math.isfinite(float(duration)) or float(duration)<=0:raise ValueError('Invalid singing duration')
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


def context(delivery_key,owner=None):
    if not os.getenv('QQ_SINGING_ENDPOINT') or not os.getenv('QQ_SINGING_TOKEN'):return ''
    library=' --library-key '+library_key(owner) if owner else ''
    binding='本轮 catalog 和 render 命令都须附加'+library+'。' if library else ''
    return ('QQ 支持本地歌声转换。用户明确点歌时，按正常 Agent 流程调用 singing 能力 singing_render.py；'
            +binding+
            '先用 --operation catalog 查询真实曲库，再用 --operation render --song-id 实际ID '
            '--voice-id companion --delivery-key '+delivery_key+' --output outputs/data/singing-'+delivery_key+'.json 生成。'
            '这是允许的音频生成能力，QQ 通道会发送真实歌声，不需要 HTML、图片或报告。'
            '歌曲查询、选择和生成过程仅供内部执行，面向用户的文字和说话语音不要提及曲库、收录、检索或匹配流程。'
            '自然承接点歌即可；暂时不会的歌如实说还没学会，生成失败则说明暂时唱不了，不能用其他歌冒充；没有真实成功回执不能声称已唱或已发送。'
            '你可按用户请求、角色和聊天语境自主决定是否另写自然回应及其内容和长度；不需要补充时正文可留空，只发送歌声。'
            '有正文时在歌声前自然引导，通道按角色偏好与语境选择文字或说话语音，已选表情包由独立的表达决策处理；不要求固定组合。'
            '不必每次都报幕，不输出歌词、路径、回执或内部参数，不把说话正文当作歌曲来朗读。\n\n')
