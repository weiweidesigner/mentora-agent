"""Durable chat sessions and replayable runs independent of browser connections."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

from fastapi import APIRouter,HTTPException,Request,Response
from fastapi.responses import StreamingResponse

COOKIE='veya_day_owner'
TERMINAL={'completed','failed','interrupted'}


class ChatSessions:
    def __init__(self,directory):
        self.directory=Path(directory);self.directory.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.path=self.directory/'sessions.sqlite3';self.condition=threading.Condition()
        self.cancelled=set()
        self.pool=ThreadPoolExecutor(max_workers=4,thread_name_prefix='mentora-chat')
        with self.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS sessions(owner TEXT,id TEXT,payload TEXT,updated REAL,PRIMARY KEY(owner,id));
            CREATE TABLE IF NOT EXISTS chat_runs(id TEXT PRIMARY KEY,owner TEXT,session_id TEXT,request_id TEXT,status TEXT,created REAL,UNIQUE(owner,request_id));
            CREATE TABLE IF NOT EXISTS chat_events(run_id TEXT,seq INTEGER,event TEXT,data TEXT,PRIMARY KEY(run_id,seq));
            ''')
        os.chmod(self.path,0o600)

    def recover_interrupted_runs(self):
        """Only actual server startup may recover workers from its old process."""
        with self.db() as db:
            pending=list(db.execute("SELECT id FROM chat_runs WHERE status IN ('queued','running')"))
        for row in pending:self.publish(row['id'],'error',{'detail':'服务重启中断了本轮执行，已保留会话与进度，请重新发起。','lang':'zh-CN'},status='interrupted')
        return len(pending)

    @contextmanager
    def db(self):
        db=sqlite3.connect(self.path,timeout=20);db.row_factory=sqlite3.Row
        try:
            with db:yield db
        finally:db.close()

    def start(self,owner,payload,event_factory,request_id=''):
        data=payload.model_dump() if hasattr(payload,'model_dump') else dict(payload)
        session_id=str(data.get('sessionId') or 'session-'+uuid.uuid4().hex)
        request_id=request_id or uuid.uuid4().hex
        if len(session_id)>128 or len(request_id)>128:raise HTTPException(400,'会话标识无效')
        run_id=uuid.uuid4().hex;moment=time.time()
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            previous=db.execute('SELECT * FROM chat_runs WHERE owner=? AND request_id=?',(owner,request_id)).fetchone()
            if previous:return dict(runId=previous['id'],sessionId=previous['session_id'],status=previous['status'],runStartedAt=previous['created']*1000)
            active=db.execute("SELECT id FROM chat_runs WHERE owner=? AND session_id=? AND status IN ('queued','running')",(owner,session_id)).fetchone()
            if active:raise HTTPException(409,'该会话仍有后台任务正在执行')
            row=db.execute('SELECT payload FROM sessions WHERE owner=? AND id=?',(owner,session_id)).fetchone()
            session=json.loads(row['payload']) if row else dict(id=session_id,title=(data.get('sessionTitle') or data.get('question') or '新建对话')[:28],question=data.get('question',''),messages=list(data.get('history') or []),createdAt=moment*1000)
            session['messages'].append(dict(role='user',text=data.get('question',''),images=data.get('images') or []))
            session['sessionScope']='widget' if session_id.startswith('widget-') or data.get('sessionScope')=='widget' or session.get('sessionScope')=='widget' else 'chat'
            session.update(status='queued',activeRunId=run_id,requestId=request_id,updatedAt=moment*1000,thinkingStartedAt=moment*1000,thinkingElapsed=0,error='',deleted=False)
            db.execute('INSERT OR REPLACE INTO sessions VALUES(?,?,?,?)',(owner,session_id,json.dumps(session,ensure_ascii=False),moment))
            db.execute('INSERT INTO chat_runs VALUES(?,?,?,?,?,?)',(run_id,owner,session_id,request_id,'queued',moment))
        self.pool.submit(self.execute,run_id,owner,payload,event_factory)
        return dict(runId=run_id,sessionId=session_id,status='queued',runStartedAt=moment*1000)

    def execute(self,run_id,owner,payload,event_factory):
        with self.db() as db:db.execute("UPDATE chat_runs SET status='running' WHERE id=?",(run_id,))
        try:
            ended=False
            for event,data in event_factory(payload,owner):
                if run_id in self.cancelled:break
                self.publish(run_id,event,data)
                if event in {'final','error'}:ended=True;break
            if not ended and run_id not in self.cancelled:self.publish(run_id,'error',dict(detail='本轮执行结束但未返回完整结果，进度已保存。',lang='zh-CN'))
        except Exception as exc:
            if run_id in self.cancelled:return
            import logging
            logging.getLogger(__name__).exception('Background chat failed: %s',run_id)
            # Only explicitly safe public errors may replace the generic message.
            detail=getattr(exc,'public_detail','') or '本轮执行异常，已保留会话及进度。'
            self.publish(run_id,'error',dict(detail=detail,code=getattr(exc,'error_code','execution_failed'),lang='zh-CN'))
        finally:
            self.cancelled.discard(run_id)

    def publish(self,run_id,event,data,status=None):
        from app.public_stream import reduce_stream_block
        data=dict(data) if isinstance(data,dict) else {'message':str(data)}
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            run=db.execute('SELECT * FROM chat_runs WHERE id=?',(run_id,)).fetchone()
            if run['status'] in TERMINAL:return
            seq=db.execute('SELECT COALESCE(MAX(seq),0)+1 FROM chat_events WHERE run_id=?',(run_id,)).fetchone()[0]
            data.update(chatRunId=run_id,chatSessionId=run['session_id'],runStartedAt=run['created']*1000)
            row=db.execute('SELECT payload FROM sessions WHERE owner=? AND id=?',(run['owner'],run['session_id'])).fetchone()
            session=json.loads(row['payload']);session.update(status='running',updatedAt=time.time()*1000)
            if event in {'final','error'}:
                blocks=[]
                for prior in db.execute('SELECT event,data FROM chat_events WHERE run_id=? ORDER BY seq',(run_id,)):
                    reduce_stream_block(blocks,prior['event'],json.loads(prior['data']))
                if event=='final':
                    shown={str(block.get('data',{}).get('htmlUrl') or block.get('data',{}).get('url') or '') for block in blocks if block['kind']=='visualization'}
                    artifacts=list(data.get('reportArtifacts') or [])
                    if not artifacts and data.get('reportUrl'):artifacts=[{'url':data['reportUrl']}]
                    for artifact in artifacts:
                        if artifact.get('url') and artifact['url'] not in shown:
                            reduce_stream_block(blocks,'module',artifact)
                            shown.add(artifact['url'])
                data['streamBlocks']=blocks
                status=status or ('completed' if event=='final' else 'failed')
                elapsed=max(0,(time.time()-run['created'])*1000)
                data['thinkingElapsed']=elapsed
                session.update(status=status,activeRunId='',lastRunId=run_id,thinkingStartedAt=run['created']*1000,thinkingElapsed=elapsed)
                if event=='final':
                    session.update({key:data[key] for key in ('streamBlocks','interpretation','reportArtifacts','fileArtifacts','reportUrl','code','agent','sources','videos','actionLinks','agentRunId','engineSessionId','reasoningFramework') if key in data})
                    session['messages'].append(dict(data,role='assistant'))
                    session['error']=''
                else:
                    session['error']=data.get('detail','执行失败')
                    session['messages'].append(dict(role='assistant',error=session['error'],errorCode=data.get('code',''),chatRunId=run_id,streamBlocks=blocks))
                db.execute('UPDATE chat_runs SET status=? WHERE id=?',(status,run_id))
            db.execute('INSERT INTO chat_events VALUES(?,?,?,?)',(run_id,seq,event,json.dumps(data,ensure_ascii=False)))
            db.execute('UPDATE sessions SET payload=?,updated=? WHERE owner=? AND id=?',(json.dumps(session,ensure_ascii=False),time.time(),run['owner'],run['session_id']))
        with self.condition:self.condition.notify_all()

    def sessions(self,owner):
        with self.db() as db:
            result=[json.loads(row[0]) for row in db.execute("SELECT payload FROM sessions WHERE owner=? AND COALESCE(json_extract(payload,'$.deleted'),0)=0 AND substr(id,1,7)!='widget-' AND COALESCE(json_extract(payload,'$.sessionScope'),'chat')!='widget' ORDER BY updated DESC LIMIT 20",(owner,))]
            for session in result:
                if session.get('activeRunId'):
                    run=db.execute('SELECT created FROM chat_runs WHERE id=? AND owner=?',(session['activeRunId'],owner)).fetchone()
                    if run:session['thinkingStartedAt']=run['created']*1000
            return result

    def update_session(self,owner,session_id,changes):
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT payload FROM sessions WHERE owner=? AND id=?',(owner,session_id)).fetchone()
            if not row:raise HTTPException(404,'会话不存在')
            data=json.loads(row[0]);data.update(changes,updatedAt=time.time()*1000)
            db.execute('UPDATE sessions SET payload=?,updated=? WHERE owner=? AND id=?',(json.dumps(data,ensure_ascii=False),time.time(),owner,session_id))
        return {'ok':True}

    def run(self,owner,run_id):
        with self.db() as db:row=db.execute('SELECT * FROM chat_runs WHERE id=? AND owner=?',(run_id,owner)).fetchone()
        if not row:raise HTTPException(404,'会话执行记录不存在')
        return dict(row)

    def events(self,owner,run_id,after=0):
        self.run(owner,run_id)
        while True:
            with self.db() as db:
                db.execute('BEGIN')
                rows=list(db.execute('SELECT * FROM chat_events WHERE run_id=? AND seq>? ORDER BY seq',(run_id,after)))
                status=db.execute('SELECT status FROM chat_runs WHERE id=?',(run_id,)).fetchone()[0]
            for row in rows:
                after=row['seq']
                yield f'id: {after}\nevent: {row["event"]}\ndata: {row["data"]}\n\n'
            if status in TERMINAL:return
            with self.condition:self.condition.wait(timeout=2)
            if not rows:yield ': keep-alive\n\n'

    def activity(self, owner, run_id):
        """Restore public execution events, not model-private reasoning or the answer stream."""
        self.run(owner, run_id)
        allowed = {'status', 'progress', 'agent_event', 'tool_step', 'module_error'}
        with self.db() as db:
            rows = db.execute('SELECT event,data FROM chat_events WHERE run_id=? ORDER BY seq', (run_id,))
            events = [dict(event=row['event'], data=json.loads(row['data'])) for row in rows if row['event'] in allowed]
        return dict(events=events)

    def cancel(self, owner, run_id):
        run=self.run(owner,run_id)
        if run['status'] in TERMINAL:return dict(ok=True,status=run['status'],sessionId=run['session_id'])
        self.cancelled.add(run_id)
        self.publish(run_id,'error',{
            'detail':'已停止本轮任务','code':'cancelled','lang':'zh-CN'
        },status='interrupted')
        return dict(ok=True,status=self.run(owner,run_id)['status'],sessionId=run['session_id'])


def identity(request,response):
    token=request.cookies.get(COOKIE,'')
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):token=secrets.token_urlsafe(32)
    response.set_cookie(COOKIE,token,max_age=31536000,httponly=True,secure=request.url.scheme=='https' or request.headers.get('x-forwarded-proto')=='https',samesite='strict',path='/')
    return hashlib.sha256(token.encode()).hexdigest()


def create_router(store,request_model,event_factory,cancel_factory=None):
    router=APIRouter(prefix='/api/chat')
    router.add_event_handler('startup',store.recover_interrupted_runs)
    @router.post('/runs')
    def start(payload:dict,request:Request,response:Response):
        parsed=request_model.model_validate(payload)
        if not str(parsed.question).strip() and not getattr(parsed,'images',[]):raise HTTPException(400,'问题不能为空')
        return store.start(identity(request,response),parsed,event_factory,str(payload.get('requestId') or ''))
    @router.get('/sessions')
    def sessions(request:Request,response:Response):return {'sessions':store.sessions(identity(request,response))}
    @router.patch('/sessions/{session_id}')
    def rename(session_id:str,payload:dict,request:Request,response:Response):
        return store.update_session(identity(request,response),session_id,{'title':str(payload.get('title') or '未命名对话')[:40],'customTitle':True})
    @router.delete('/sessions/{session_id}')
    def remove(session_id:str,request:Request,response:Response):
        return store.update_session(identity(request,response),session_id,{'deleted':True})
    @router.get('/runs/{run_id}/events')
    def events(run_id:str,request:Request,after:int=0):
        cookie_response=Response();owner=identity(request,cookie_response)
        store.run(owner,run_id)
        return StreamingResponse(store.events(owner,run_id,max(0,after)),media_type='text/event-stream',headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no'})
    @router.get('/runs/{run_id}/activity')
    def activity(run_id:str,request:Request,response:Response):
        response.headers['Cache-Control']='no-store'
        return store.activity(identity(request,response),run_id)
    @router.post('/runs/{run_id}/cancel')
    def cancel(run_id:str,request:Request,response:Response):
        result=store.cancel(identity(request,response),run_id)
        if result['status']=='interrupted' and cancel_factory:cancel_factory(result['sessionId'])
        return result
    return router
