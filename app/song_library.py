"""Owner-scoped MP3 practice jobs and explicit QQ completion notifications."""
import json
import hashlib
from concurrent.futures import ThreadPoolExecutor
import math
import logging
import os
from pathlib import Path
import re
import secrets
import threading
import time
import uuid
from datetime import datetime,time as day_time

import requests
from fastapi import APIRouter,HTTPException,Request,Response
from fastapi.responses import FileResponse
from pydantic import BaseModel,Field

from app.chat_sessions import identity
from app.qq_companion import CompanionMemory,scope_id,TZ,local_day
from app.qq_singing import library_key,save

log=logging.getLogger(__name__)
MAX_UPLOAD=30*1024*1024


class PracticeInput(BaseModel):
    recipientId:str=Field(default='',max_length=24)
    notify:bool=True


class SongTitleInput(BaseModel):
    title:str=Field(min_length=1,max_length=120)


class SongLibrary:
    def __init__(self,tasks,characters,client_factory=None,clock=None):
        self.tasks=tasks;self.characters=characters;self.memory=CompanionMemory(tasks)
        self.client_factory=client_factory;self.clock=clock or time.time
        self.root=tasks.directory/'song-library';self.root.mkdir(exist_ok=True,mode=0o700)
        self.stop_event=threading.Event();self.thread=None;self.lock=threading.Lock()
        self.preview_lock=threading.Lock();self.preview_jobs={}
        self.preview_pool=ThreadPoolExecutor(max_workers=1,thread_name_prefix='song-preview')
        with tasks.db() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS song_practice(
              id TEXT PRIMARY KEY,owner TEXT,title TEXT,start REAL,filename TEXT,state TEXT,created REAL,updated REAL,
              error TEXT DEFAULT '',recipient TEXT DEFAULT '',notification TEXT DEFAULT 'none',notice_error TEXT DEFAULT '',seconds REAL DEFAULT 0)''')
            db.execute("CREATE TABLE IF NOT EXISTS song_notification_attempts(key TEXT PRIMARY KEY,scope TEXT,day TEXT,state TEXT)")
            db.execute('CREATE TABLE IF NOT EXISTS song_library_edits(owner TEXT,song_id TEXT,title TEXT,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,song_id))')
            # Song completion is a user-requested task receipt, separate from
            # the daily companion outreach allowance. Preserve old dedup keys.
            db.execute("INSERT OR IGNORE INTO song_notification_attempts SELECT * FROM qq_extra_message_attempts WHERE key LIKE 'song:%'")
            db.execute("DELETE FROM qq_extra_message_attempts WHERE key LIKE 'song:%'")

    def headers(self,owner):
        return {'Authorization':'Bearer '+os.environ['QQ_SINGING_TOKEN'],'X-Singing-Library':library_key(owner)}

    def endpoint(self):
        value=os.getenv('QQ_SINGING_ENDPOINT','').rstrip('/')
        if not value:raise requests.ConnectionError('Singing unavailable')
        return value

    def row(self,owner,ident):
        with self.tasks.db() as db:r=db.execute('SELECT * FROM song_practice WHERE owner=? AND id=?',(owner,ident)).fetchone()
        if not r:raise HTTPException(404,'歌曲不存在')
        return dict(r)

    def notification_scopes(self,owner):
        from app.qq_destinations import enabled_for
        connection=self.characters.qq.row(owner)
        if not connection:return []
        profile=self.characters.get(owner)
        return [scope for scope in self.memory.outgoing_scopes(owner)
                if json.loads(scope)[0]==connection['app_id'] and enabled_for(profile,scope,self.tasks)]

    def recipients(self,owner):
        return [{'id':scope_id(s),'label':'QQ 群聊' if json.loads(s)[1]=='groups' else 'QQ 私聊'}
                for s in self.notification_scopes(owner)]

    def public_row(self,row):
        return {'jobId':row['id'],'id':'learn-'+row['id'],'title':row['title'],'seconds':row['seconds'],
                'state':row['state'],'error':row['error'],'notification':row['notification'],
                'notificationError':row['notice_error'],'uploaded':True,'start':row['start']}

    def listing(self,owner):
        cached=self.root/('catalog-'+owner+'.json');online=False;catalog=[]
        try:
            response=requests.get(self.endpoint()+'/songs',headers=self.headers(owner),timeout=(3,6),allow_redirects=False)
            response.raise_for_status();body=response.json();catalog=body['songs'];online=bool(body.get('ready'))
            temp=cached.with_suffix('.tmp');temp.write_text(json.dumps(catalog,ensure_ascii=False));temp.chmod(0o600);temp.replace(cached)
        except (requests.RequestException,ValueError,KeyError):
            try:catalog=json.loads(cached.read_text())
            except (OSError,ValueError):catalog=[]
        with self.tasks.db() as db:rows=[dict(r) for r in db.execute('SELECT * FROM song_practice WHERE owner=? ORDER BY created DESC',(owner,))]
        own={('learn-'+r['id']):r for r in rows}
        learned=[dict(s,state='ready',uploaded=False) for s in catalog if s['id'] not in own]
        available={s['id']:s for s in catalog}
        learned.extend({**self.public_row(r),**({'seconds':available['learn-'+r['id']]['seconds']}
                       if available.get('learn-'+r['id'],{}).get('seconds') else {})}
                       for r in rows if r['state']=='ready')
        with self.tasks.db() as db:
            edits={r['song_id']:dict(r) for r in db.execute('SELECT * FROM song_library_edits WHERE owner=?',(owner,))}
        learned=[{**s,**({'title':edits[s['id']]['title']} if edits.get(s['id'],{}).get('title') else {})}
                 for s in learned if not edits.get(s['id'],{}).get('deleted')]
        return {'learned':learned,'practicing':[self.public_row(r) for r in rows if r['state']!='ready'],
                'recipients':self.recipients(owner),'online':online,'maxBytes':MAX_UPLOAD}

    def edit(self,owner,song_id,title=None,deleted=False):
        if not re.fullmatch(r'[a-z0-9_-]{1,64}',song_id):raise HTTPException(404,'歌曲不存在')
        if title is not None:
            title=title.strip()
            if not title:raise HTTPException(422,'歌名不能为空')
        with self.lock:
            if not any(s['id']==song_id for s in self.listing(owner)['learned']):raise HTTPException(404,'歌曲不存在')
            with self.tasks.db() as db:
                db.execute('INSERT INTO song_library_edits(owner,song_id,title,deleted) VALUES(?,?,?,?) ON CONFLICT(owner,song_id) DO UPDATE SET title=COALESCE(excluded.title,song_library_edits.title),deleted=excluded.deleted',(owner,song_id,title,int(deleted)))
                if song_id.startswith('learn-'):
                    if deleted:
                        db.execute("UPDATE song_practice SET notification='cancelled',notice_error='' WHERE owner=? AND id=? AND notification='pending'",(owner,song_id[6:]))
                    else:db.execute('UPDATE song_practice SET title=? WHERE owner=? AND id=?',(title,owner,song_id[6:]))
        return {'ok':True}

    def practice(self,owner,ident,payload):
        row=self.row(owner,ident)
        scopes=self.notification_scopes(owner) if payload.notify else []
        if payload.notify and not scopes:raise HTTPException(422,'请先在“主动联系”中选择接收通知的会话')
        if payload.recipientId and payload.recipientId not in {scope_id(scope) for scope in scopes}:
            raise HTTPException(422,'该会话未在“主动联系”中启用')
        scope=scopes[0] if len(scopes)==1 else ''
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            current=db.execute('SELECT state FROM song_practice WHERE id=? AND owner=?',(ident,owner)).fetchone()
            if current['state'] in ('queued','practicing','ready'):return self.public_row(self.row(owner,ident))
            db.execute("UPDATE song_practice SET state='queued',error='',recipient=?,notification=?,notice_error='',updated=? WHERE owner=? AND id=?",(scope,'pending' if payload.notify else 'none',self.clock(),owner,ident))
        return self.public_row(self.row(owner,ident))

    def start(self):
        if self.thread:return
        with self.tasks.db() as db:
            interrupted=[r['id'] for r in db.execute("SELECT id FROM song_practice WHERE notification='sending'")]
            db.execute("UPDATE song_practice SET notification='unknown',notice_error='发送状态未确认，未自动重发' WHERE notification='sending'")
            for ident in interrupted:db.execute("UPDATE song_notification_attempts SET state='unknown' WHERE key LIKE ? AND state='reserved'",('song:'+ident+':%',))
            db.execute("UPDATE song_practice SET state='failed',error='上传被中断，请重新上传' WHERE state='uploading'")
        self.thread=threading.Thread(target=self.loop,daemon=True,name='song-library');self.thread.start()

    def close(self):
        self.stop_event.set();self.preview_pool.shutdown(wait=False,cancel_futures=True)

    def loop(self):
        while not self.stop_event.is_set():
            try:self.tick()
            except Exception:log.exception('Song library background iteration failed')
            self.stop_event.wait(4)

    def update(self,ident,**fields):
        fields['updated']=self.clock()
        with self.tasks.db() as db:db.execute('UPDATE song_practice SET '+','.join(k+'=?' for k in fields)+' WHERE id=?',(*fields.values(),ident))

    def tick(self):
        if not self.lock.acquire(blocking=False):return
        try:
            with self.tasks.db() as db:jobs=[dict(r) for r in db.execute("SELECT * FROM song_practice WHERE state IN ('queued','practicing') ORDER BY created")]
            for row in jobs:
                if self.stop_event.is_set():return
                try:
                    headers=self.headers(row['owner']);endpoint=self.endpoint()
                    if row['state']=='queued':
                        with (self.root/(row['id']+'.mp3')).open('rb') as source:
                            response=requests.post(endpoint+'/learn/'+row['id'],params={'title':row['title'],'start':row['start']},data=source,headers={**headers,'Content-Type':'audio/mpeg'},timeout=(5,120),allow_redirects=False)
                        response.raise_for_status();self.update(row['id'],state='practicing',error='')
                    response=requests.get(endpoint+'/learning/'+row['id'],headers=headers,timeout=(3,8),allow_redirects=False)
                    if response.status_code==404:
                        self.update(row['id'],state='queued',error='本地练习记录恢复中');continue
                    response.raise_for_status();result=response.json()
                    if result['state']=='failed':self.update(row['id'],state='failed',error=result.get('error') or '练习未完成，请重试')
                    elif result['state']=='ready':self.finish(row,headers,endpoint)
                except (requests.RequestException,KeyError,ValueError,OSError):
                    self.update(row['id'],error='正在等待本地歌声服务，恢复后会继续')
            with self.tasks.db() as db:pending=[dict(r) for r in db.execute("SELECT * FROM song_practice WHERE state='ready' AND notification='pending' ORDER BY created")]
            for row in pending:
                if self.stop_event.is_set():return
                self.notify(row)
        finally:self.lock.release()

    def finish(self,row,headers,endpoint):
        response=requests.post(endpoint+'/render',json={'songId':'learn-'+row['id'],'voiceId':'companion'},headers=headers,timeout=(3,15),allow_redirects=False)
        response.raise_for_status();audio=response.content
        if not audio.startswith(b'\x02#!SILK_V3'):raise ValueError('Invalid singing output')
        preview=requests.get(endpoint+'/preview/learn-'+row['id'],headers=headers,timeout=(3,30),allow_redirects=False)
        preview.raise_for_status()
        if not preview.content.startswith(b'RIFF'):raise ValueError('Invalid preview')
        for suffix,body in [('.silk',audio),('.wav',preview.content)]:
            p=self.root/(row['id']+suffix);temp=p.with_suffix(suffix+'.tmp');temp.write_bytes(body);temp.chmod(0o600);temp.replace(p)
        duration=float(response.headers['X-Audio-Duration'])
        if not math.isfinite(duration) or duration<=0:raise ValueError('Invalid singing duration')
        self.update(row['id'],state='ready',seconds=duration,error='')

    def notify(self,row):
        if self.row(row['owner'],row['id'])['notification']!='pending':return
        now=self.clock();local=datetime.fromtimestamp(now,TZ)
        if not day_time(9)<=local.time()<=day_time(21):
            self.update(row['id'],notice_error='将在 09:00—21:00 通知');return
        owner=row['owner'];connection=self.characters.qq.row(owner)
        scopes=self.notification_scopes(owner)
        if not connection or not scopes:
            self.update(row['id'],notification='cancelled',notice_error='当前没有启用的 QQ 通知会话');return
        day=local_day(now);prefix='song:'+row['id']+':'
        deliveries=[(scope,[prefix+scope_id(scope)+':text',prefix+scope_id(scope)+':audio']) for scope in scopes]
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            current=db.execute('SELECT notification FROM song_practice WHERE id=?',(row['id'],)).fetchone()
            if current['notification']!='pending':return
            # Include old private-only receipts: never replay a previously attempted job.
            if db.execute('SELECT 1 FROM song_notification_attempts WHERE key LIKE ?',(prefix+'%',)).fetchone():
                db.execute("UPDATE song_practice SET notification='unknown',notice_error='发送状态未确认，未自动重发' WHERE id=?",(row['id'],));return
            db.executemany("INSERT INTO song_notification_attempts VALUES(?,?,?,'reserved')",[(key,scope,day) for scope,keys in deliveries for key in keys])
            db.execute("UPDATE song_practice SET notification='sending',notice_error='' WHERE id=?",(row['id'],))

        def allowed(scope):
            current=self.characters.qq.row(owner)
            return (current and current['id']==connection['id'] and current['app_id']==connection['app_id']
                    and scope in self.notification_scopes(owner))

        def mark(keys,state):
            with self.tasks.db() as db:
                db.executemany("UPDATE song_notification_attempts SET state=? WHERE key=? AND state='reserved'",[(state,key) for key in keys])
        try:
            from app.qq_channel import QQClient
            client=(self.client_factory or QQClient)(credentials_provider=lambda:self.characters.qq.credentials(connection['id']))
            audio=(self.root/(row['id']+'.silk')).read_bytes()
            receipt=save(audio,delivery_key=secrets.token_hex(16),song={'id':'learn-'+row['id'],'title':row['title']},voice_id='companion',duration=row['seconds'],folder=self.tasks.directory/'qq-voice')
            base=os.getenv('VEYA_PUBLIC_URL','https://weiweidesigner.com/mentora/').rstrip('/')
            for scope,keys in deliveries:
                if not allowed(scope):mark(keys,'cancelled');continue
                _,kind,target,_=json.loads(scope)
                options={'kind':kind} if kind=='groups' else {}
                try:
                    client.proactive(target,'我学会《'+row['title']+'》啦，唱给你听。',**options)
                    mark(keys[:1],'sent')
                    if not allowed(scope):mark(keys[1:],'cancelled');continue
                    client.proactive_media(target,base+'/api/qq/voice/'+receipt['id']+'.silk',file_type=3,**options)
                    mark(keys[1:],'sent')
                except Exception:mark(keys,'unknown')
        except Exception:
            for _,keys in deliveries:mark(keys,'unknown')
        with self.tasks.db() as db:
            states={r['state'] for r in db.execute('SELECT state FROM song_notification_attempts WHERE key LIKE ?',(prefix+'%',))}
        state='unknown' if states & {'reserved','unknown'} else 'cancelled' if 'cancelled' in states else 'sent'
        error='QQ 通知或试唱未能确认送达，可在 QQ 直接点歌；未自动重发' if state=='unknown' else '通知会话已取消勾选' if state=='cancelled' else ''
        self.update(row['id'],notification=state,notice_error=error)


    def preview_path(self, owner, song_id):
        with self.tasks.db() as db:
            hidden=db.execute('SELECT deleted FROM song_library_edits WHERE owner=? AND song_id=?',(owner,song_id)).fetchone()
        if hidden and hidden['deleted']:raise HTTPException(404,'歌曲不存在')
        if song_id.startswith('learn-'):
            row=self.row(owner,song_id[6:])
            if row['state']!='ready':raise HTTPException(409,'歌曲尚未练习完成')
        try:
            entries=json.loads((self.root/('catalog-'+owner+'.json')).read_text())
            version=next((entry for entry in entries if entry.get('id')==song_id),{})
        except (OSError,ValueError,TypeError):version={}
        key=hashlib.sha256((owner+':'+song_id+':'+json.dumps(version,sort_keys=True)).encode()).hexdigest()
        return self.root/('preview-'+key+'.wav')

    def preview_status(self, owner, song_id):
        if not re.fullmatch(r'[a-z0-9_-]{1,64}',song_id):raise HTTPException(404,'歌曲不存在')
        path=self.preview_path(owner,song_id)
        if path.is_file():return {'state':'ready','error':''}
        with self.preview_lock:return dict(self.preview_jobs.get((owner,song_id),{'state':'idle','error':''}))

    def prepare_preview(self, owner, song_id):
        state=self.preview_status(owner,song_id)
        if state['state']=='ready':return state
        if self.stop_event.is_set():raise HTTPException(503,'试听服务正在重启，请稍后重试')
        listing=self.listing(owner)
        if not any(x['id']==song_id for x in listing['learned']):raise HTTPException(404,'歌曲不存在或尚未练习完成')
        key=(owner,song_id)
        with self.preview_lock:
            current=self.preview_jobs.get(key,{})
            if current.get('state') in ('queued','preparing'):return dict(current)
            self.preview_jobs[key]={'state':'queued','error':''}
        self.preview_pool.submit(self.build_preview,owner,song_id)
        return self.preview_status(owner,song_id)

    def build_preview(self, owner, song_id):
        key=(owner,song_id);path=self.preview_path(owner,song_id);temp=path.with_suffix('.wav.tmp')
        with self.preview_lock:self.preview_jobs[key]={'state':'preparing','error':''}
        try:
            headers=self.headers(owner);endpoint=self.endpoint()
            result=requests.get(endpoint+'/preview/'+song_id,headers=headers,timeout=(3,30),allow_redirects=False,stream=True)
            if result.status_code==404:
                result.close()
                # Conversion can take minutes for a full song. This runs in the
                # bounded background pool; the browser polls a fast status API.
                with requests.post(endpoint+'/render',json={'songId':song_id,'voiceId':'companion'},headers=headers,timeout=(3,None),allow_redirects=False,stream=True) as rendered:
                    rendered.raise_for_status()
                result=requests.get(endpoint+'/preview/'+song_id,headers=headers,timeout=(3,30),allow_redirects=False,stream=True)
            with result:
                result.raise_for_status();size=0
                with temp.open('wb') as out:
                    for chunk in result.iter_content(256*1024):
                        size+=len(chunk)
                        if size>512*1024*1024:raise ValueError('Preview too large')
                        out.write(chunk)
            with temp.open('rb') as source:header=source.read(12)
            if size<44 or header[:4]!=b'RIFF' or header[8:12]!=b'WAVE':raise ValueError('Invalid WAV preview')
            temp.chmod(0o600);temp.replace(path)
            with self.preview_lock:self.preview_jobs[key]={'state':'ready','error':''}
        except Exception:
            temp.unlink(missing_ok=True)
            with self.preview_lock:self.preview_jobs[key]={'state':'failed','error':'试听音频准备未完成，请点击试听重试'}
            log.warning('Song preview preparation failed for %s',song_id)


def create_router(service):
    router=APIRouter(prefix='/api/character/songs')
    router.add_event_handler('startup',service.start);router.add_event_handler('shutdown',service.close)
    def owner(request,response,write=False):
        if write and (request.headers.get('x-veya-day')!='1' or request.headers.get('sec-fetch-site')=='cross-site'):raise HTTPException(403,'请从角色曲库操作')
        response.headers['Cache-Control']='no-store'
        return identity(request,response)
    @router.get('')
    def listing(request:Request,response:Response):return service.listing(owner(request,response))
    @router.post('/upload')
    async def upload(request:Request,response:Response,filename:str,title:str="",start:float=0):
        user=owner(request,response,True)
        title=title.strip() or Path(filename).stem.strip()[:120]
        if not title or len(title)>120 or not filename.lower().endswith('.mp3') or len(filename)>200 or not 0<=start<=3600:raise HTTPException(422,'请选择有效的 MP3 文件')
        with service.tasks.db() as db:
            if db.execute("SELECT count(*) FROM song_practice WHERE owner=? AND state!='ready'",(user,)).fetchone()[0]>=30:raise HTTPException(409,'待练习歌曲较多，请先完成已有练习')
        ident=uuid.uuid4().hex;now=service.clock();path=service.root/(ident+'.mp3')
        with service.tasks.db() as db:db.execute('INSERT INTO song_practice(id,owner,title,start,filename,state,created,updated) VALUES(?,?,?,?,?,?,?,?)',(ident,user,title.strip(),start,Path(filename).name,'uploading',now,now))
        size=0
        try:
            with path.open('wb') as out:
                async for chunk in request.stream():
                    size+=len(chunk)
                    if size>MAX_UPLOAD:raise HTTPException(413,'MP3 最大 30MB')
                    out.write(chunk)
            if size<128:raise HTTPException(422,'MP3 文件为空或无效')
            with path.open('rb') as source:magic=source.read(3)
            if not (magic==b'ID3' or (magic[0]==255 and magic[1]&224==224)):raise HTTPException(422,'请选择有效的 MP3 文件')
            path.chmod(0o600);service.update(ident,state='uploaded')
        except Exception:
            path.unlink(missing_ok=True)
            with service.tasks.db() as db:db.execute('DELETE FROM song_practice WHERE id=?',(ident,))
            raise
        return service.public_row(service.row(user,ident))
    @router.post('/{ident}/practice')
    def practice(ident:str,payload:PracticeInput,request:Request,response:Response):return service.practice(owner(request,response,True),ident,payload)
    @router.patch('/{song_id}')
    def rename(song_id:str,payload:SongTitleInput,request:Request,response:Response):
        return service.edit(owner(request,response,True),song_id,title=payload.title)
    @router.delete('/{song_id}')
    def delete(song_id:str,request:Request,response:Response):
        return service.edit(owner(request,response,True),song_id,deleted=True)
    @router.delete('/{ident}/notification')
    def cancel_notice(ident:str,request:Request,response:Response):
        user=owner(request,response,True);service.row(user,ident)
        with service.tasks.db() as db:db.execute("UPDATE song_practice SET notification='cancelled',notice_error='' WHERE id=? AND owner=? AND notification='pending'",(ident,user))
        return {'ok':True}
    @router.post('/{song_id}/preview')
    def prepare_preview(song_id:str,request:Request,response:Response):
        return service.prepare_preview(owner(request,response,True),song_id)
    @router.get('/{song_id}/preview-status')
    def preview_status(song_id:str,request:Request,response:Response):
        return service.preview_status(owner(request,response),song_id)
    @router.get('/{song_id}/preview')
    def preview(song_id:str,request:Request,response:Response):
        user=owner(request,response)
        if not re.fullmatch(r'[a-z0-9_-]{1,64}',song_id):raise HTTPException(404,'歌曲不存在')
        with service.tasks.db() as db:
            hidden=db.execute('SELECT deleted FROM song_library_edits WHERE owner=? AND song_id=?',(user,song_id)).fetchone()
        if hidden and hidden['deleted']:raise HTTPException(404,'歌曲不存在')
        cached=service.preview_path(user,song_id)
        if cached.is_file():return FileResponse(cached,media_type='audio/wav',headers={'Cache-Control':'no-store'})
        fallback=service.root/(song_id[6:]+'.wav') if song_id.startswith('learn-') else None
        fallback=fallback if fallback and fallback.is_file() else None
        try:
            result=requests.get(service.endpoint()+'/preview/'+song_id,headers=service.headers(user),timeout=(3,15),allow_redirects=False)
            if result.status_code==200:return Response(result.content,media_type='audio/wav',headers={'Cache-Control':'no-store'})
            if fallback:return FileResponse(fallback,media_type='audio/wav',headers={'Cache-Control':'no-store'})
            raise HTTPException(404,'试听暂不可用')
        except requests.RequestException:
            if fallback:return FileResponse(fallback,media_type='audio/wav',headers={'Cache-Control':'no-store'})
            raise HTTPException(503,'本地歌声服务暂不可用') from None
    return router
