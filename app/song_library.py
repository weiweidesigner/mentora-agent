"""Owner-scoped MP3 practice jobs and explicit QQ completion notifications."""
import json
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
MAX_UPLOAD=40*1024*1024


class PracticeInput(BaseModel):
    recipientId:str=Field(default='',max_length=24)
    notify:bool=False


class SongLibrary:
    def __init__(self,tasks,characters,client_factory=None,clock=None):
        self.tasks=tasks;self.characters=characters;self.memory=CompanionMemory(tasks)
        self.client_factory=client_factory;self.clock=clock or time.time
        self.root=tasks.directory/'song-library';self.root.mkdir(exist_ok=True,mode=0o700)
        self.stop_event=threading.Event();self.thread=None;self.lock=threading.Lock()
        with tasks.db() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS song_practice(
              id TEXT PRIMARY KEY,owner TEXT,title TEXT,start REAL,filename TEXT,state TEXT,created REAL,updated REAL,
              error TEXT DEFAULT '',recipient TEXT DEFAULT '',notification TEXT DEFAULT 'none',notice_error TEXT DEFAULT '',seconds REAL DEFAULT 20)''')

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

    def recipients(self,owner):
        return [{'id':scope_id(s),'label':'QQ 私聊 '+str(i+1)} for i,s in enumerate(self.memory.scopes(owner))]

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
        learned.extend(self.public_row(r) for r in rows if r['state']=='ready')
        return {'learned':learned,'practicing':[self.public_row(r) for r in rows if r['state']!='ready'],
                'recipients':self.recipients(owner),'online':online,'maxBytes':MAX_UPLOAD}

    def practice(self,owner,ident,payload):
        row=self.row(owner,ident)
        scope=''
        if payload.notify:
            scope=next((s for s in self.memory.scopes(owner) if scope_id(s)==payload.recipientId),'')
            if not scope:raise HTTPException(422,'请选择已连接的 QQ 私聊')
            connection=self.characters.qq.row(owner)
            if not connection or json.loads(scope)[0]!=connection['app_id']:raise HTTPException(422,'QQ 连接不匹配')
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            current=db.execute('SELECT state FROM song_practice WHERE id=? AND owner=?',(ident,owner)).fetchone()
            if current['state'] in ('queued','practicing','ready'):return self.public_row(self.row(owner,ident))
            db.execute("UPDATE song_practice SET state='queued',error='',recipient=?,notification=?,notice_error='',updated=? WHERE owner=? AND id=?",(scope,'pending' if scope else 'none',self.clock(),owner,ident))
        return self.public_row(self.row(owner,ident))

    def start(self):
        if self.thread:return
        with self.tasks.db() as db:
            interrupted=[r['id'] for r in db.execute("SELECT id FROM song_practice WHERE notification='sending'")]
            db.execute("UPDATE song_practice SET notification='unknown',notice_error='发送状态未确认，未自动重发' WHERE notification='sending'")
            for ident in interrupted:db.execute("UPDATE qq_extra_message_attempts SET state='unknown' WHERE key IN (?,?) AND state='reserved'",('song:'+ident+':text','song:'+ident+':audio'))
            db.execute("UPDATE song_practice SET state='failed',error='上传被中断，请重新上传' WHERE state='uploading'")
        self.thread=threading.Thread(target=self.loop,daemon=True,name='song-library');self.thread.start()

    def close(self):self.stop_event.set()

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
        if len(audio)>2*1024*1024 or not audio.startswith(b'\x02#!SILK_V3'):raise ValueError('Invalid singing output')
        preview=requests.get(endpoint+'/preview/learn-'+row['id'],headers=headers,timeout=(3,30),allow_redirects=False)
        preview.raise_for_status()
        if len(preview.content)>8*1024*1024 or not preview.content.startswith(b'RIFF'):raise ValueError('Invalid preview')
        for suffix,body in [('.silk',audio),('.wav',preview.content)]:
            p=self.root/(row['id']+suffix);temp=p.with_suffix(suffix+'.tmp');temp.write_bytes(body);temp.chmod(0o600);temp.replace(p)
        duration=float(response.headers['X-Audio-Duration'])
        if not 1<=duration<=30.1:raise ValueError('Invalid singing duration')
        self.update(row['id'],state='ready',seconds=duration,error='')

    def notify(self,row):
        now=self.clock();local=datetime.fromtimestamp(now,TZ)
        if not day_time(9)<=local.time()<=day_time(21):
            self.update(row['id'],notice_error='将在 09:00—21:00 通知');return
        owner=row['owner'];scope=row['recipient'];connection=self.characters.qq.row(owner)
        if not connection or scope not in self.memory.scopes(owner):
            self.update(row['id'],notification='cancelled',notice_error='QQ 会话已解除连接');return
        app_id,kind,target,_=json.loads(scope)
        if app_id!=connection['app_id'] or kind!='users':
            self.update(row['id'],notification='cancelled',notice_error='QQ 连接不匹配');return
        day=local_day(now);keys=['song:'+row['id']+':text','song:'+row['id']+':audio']
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            current=db.execute('SELECT notification FROM song_practice WHERE id=?',(row['id'],)).fetchone()
            if current['notification']!='pending':return
            scheduled=db.execute('SELECT count(*) FROM qq_companion_outbox WHERE scope=? AND day=? AND attempted IS NOT NULL',(scope,day)).fetchone()[0]
            extras=db.execute('SELECT count(*) FROM qq_extra_message_attempts WHERE scope=? AND day=?',(scope,day)).fetchone()[0]
            if scheduled+extras+2>3:
                db.execute("UPDATE song_practice SET notice_error='今日主动消息额度已用完，将等待次日额度' WHERE id=?",(row['id'],));return
            if db.execute('SELECT 1 FROM qq_extra_message_attempts WHERE key IN (?,?)',keys).fetchone():
                db.execute("UPDATE song_practice SET notification='unknown',notice_error='发送状态未确认，未自动重发' WHERE id=?",(row['id'],));return
            db.executemany("INSERT INTO qq_extra_message_attempts VALUES(?,?,?,'reserved')",[(k,scope,day) for k in keys])
            db.execute("UPDATE song_practice SET notification='sending',notice_error='' WHERE id=?",(row['id'],))
        try:
            from app.qq_channel import QQClient
            factory=self.client_factory or QQClient
            client=factory(credentials_provider=lambda:self.characters.qq.credentials(connection['id']))
            body='我学会《'+row['title']+'》啦，唱给你听。'
            client.proactive(target,body)
            with self.tasks.db() as db:db.execute("UPDATE qq_extra_message_attempts SET state='sent' WHERE key=?",(keys[0],))
            audio=(self.root/(row['id']+'.silk')).read_bytes()
            receipt=save(audio,delivery_key=secrets.token_hex(16),song={'id':'learn-'+row['id'],'title':row['title']},voice_id='companion',duration=row['seconds'],folder=self.tasks.directory/'qq-voice')
            base=os.getenv('VEYA_PUBLIC_URL','https://weiweidesigner.com/mentora/').rstrip('/')
            client.proactive_media(target,base+'/api/qq/voice/'+receipt['id']+'.silk',file_type=3)
            with self.tasks.db() as db:db.execute("UPDATE qq_extra_message_attempts SET state='sent' WHERE key=?",(keys[1],))
            self.update(row['id'],notification='sent',notice_error='')
        except Exception:
            with self.tasks.db() as db:db.execute("UPDATE qq_extra_message_attempts SET state='unknown' WHERE key IN (?,?) AND state='reserved'",keys)
            self.update(row['id'],notification='unknown',notice_error='QQ 通知或试唱未能确认送达，可在 QQ 直接点歌；未自动重发')


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
    async def upload(request:Request,response:Response,title:str,filename:str,start:float=45):
        user=owner(request,response,True)
        if not title.strip() or len(title)>120 or not filename.lower().endswith('.mp3') or len(filename)>200 or not 0<=start<=3600:raise HTTPException(422,'请填写歌名并选择 MP3，起点为 0—3600 秒')
        with service.tasks.db() as db:
            if db.execute("SELECT count(*) FROM song_practice WHERE owner=? AND state!='ready'",(user,)).fetchone()[0]>=30:raise HTTPException(409,'待练习歌曲较多，请先完成已有练习')
        ident=uuid.uuid4().hex;now=service.clock();path=service.root/(ident+'.mp3')
        with service.tasks.db() as db:db.execute('INSERT INTO song_practice(id,owner,title,start,filename,state,created,updated) VALUES(?,?,?,?,?,?,?,?)',(ident,user,title.strip(),start,Path(filename).name,'uploading',now,now))
        size=0
        try:
            with path.open('wb') as out:
                async for chunk in request.stream():
                    size+=len(chunk)
                    if size>MAX_UPLOAD:raise HTTPException(413,'MP3 最大 40MB')
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
    @router.delete('/{ident}/notification')
    def cancel_notice(ident:str,request:Request,response:Response):
        user=owner(request,response,True);service.row(user,ident)
        with service.tasks.db() as db:db.execute("UPDATE song_practice SET notification='cancelled',notice_error='' WHERE id=? AND owner=? AND notification='pending'",(ident,user))
        return {'ok':True}
    @router.get('/{song_id}/preview')
    def preview(song_id:str,request:Request,response:Response):
        user=owner(request,response)
        if not re.fullmatch(r'[a-z0-9_-]{1,64}',song_id):raise HTTPException(404,'歌曲不存在')
        if song_id.startswith('learn-'):
            row=service.row(user,song_id[6:]);path=service.root/(row['id']+'.wav')
            if row['state']!='ready' or not path.is_file():raise HTTPException(404,'歌曲尚未练习完成')
            return FileResponse(path,media_type='audio/wav',headers={'Cache-Control':'no-store'})
        try:
            result=requests.get(service.endpoint()+'/preview/'+song_id,headers=service.headers(user),timeout=(3,15),allow_redirects=False)
            if result.status_code!=200:raise HTTPException(404,'试听暂不可用')
            return Response(result.content,media_type='audio/wav',headers={'Cache-Control':'no-store'})
        except requests.RequestException:raise HTTPException(503,'本地歌声服务暂不可用') from None
    return router
