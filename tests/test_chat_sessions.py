import json
import threading

from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel
import pytest

from app.chat_sessions import ChatSessions,create_router


class Payload(BaseModel):
    question:str
    sessionId:str='session-example'
    history:list=[]


def test_session_created_immediately_and_disconnected_reader_does_not_stop_execution(tmp_path):
    store=ChatSessions(tmp_path);release=threading.Event();started=threading.Event()
    def execute(payload,owner):
        yield 'status',{'message':'working'}
        started.set();release.wait(3)
        yield 'final',{'interpretation':'finished','reportArtifacts':[{'url':'/generated/real-chart.html'}]}
    try:
        run=store.start('owner',Payload(question='first question'),execute,'request-one')
        assert started.wait(2)
        session=store.sessions('owner')[0]
        assert session['activeRunId']==run['runId'] and session['messages'][0]['text']=='first question'
        reader=store.events('owner',run['runId']);assert 'status' in next(reader)
        reader.close()
        release.set();store.pool.shutdown(wait=True)
        replay=''.join(store.events('owner',run['runId']))
        assert 'event: final' in replay and 'finished' in replay
        saved=store.sessions('owner')[0]
        assert saved['status']=='completed' and not saved['activeRunId']
        assert saved['reportArtifacts']==[{'url':'/generated/real-chart.html'}]
        assert saved['messages'][-1]['role']=='assistant'
    finally:release.set();store.pool.shutdown(wait=True)


def test_request_retry_is_idempotent_and_sessions_are_owner_scoped(tmp_path):
    store=ChatSessions(tmp_path);calls=[]
    def execute(payload,owner):
        calls.append(owner);yield 'final',{'interpretation':'answer'}
    first=store.start('a',Payload(question='test'),execute,'same-request')
    second=store.start('a',Payload(question='test'),execute,'same-request')
    store.pool.shutdown(wait=True)
    assert first['runId']==second['runId'] and calls==['a']
    assert store.sessions('b')==[]
    with pytest.raises(HTTPException) as error:store.run('b',first['runId'])
    assert error.value.status_code==404


def test_api_can_restore_session_and_replay_final_after_browser_returns(tmp_path):
    store=ChatSessions(tmp_path)
    def execute(payload,owner):
        yield 'status',{'message':'working'}
        yield 'final',{'interpretation':'saved result'}
    app=FastAPI();app.include_router(create_router(store,Payload,execute))
    with TestClient(app) as client:
        created=client.post('/api/chat/runs',json={'question':'new request','requestId':'one'}).json()
        store.pool.shutdown(wait=True)
        assert client.get('/api/chat/sessions').json()['sessions'][0]['status']=='completed'
        assert client.patch('/api/chat/sessions/session-example',json={'title':'renamed'}).status_code==200
        assert client.get('/api/chat/sessions').json()['sessions'][0]['title']=='renamed'
        replay=client.get(f'/api/chat/runs/{created["runId"]}/events?after=1')
        assert 'event: final' in replay.text and 'event: status' not in replay.text
        with TestClient(app) as stranger:assert stranger.get(f'/api/chat/runs/{created["runId"]}/events').status_code==404
        assert client.delete('/api/chat/sessions/session-example').status_code==200
        assert client.get('/api/chat/sessions').json()['sessions']==[]


def test_missing_final_is_a_persisted_failure_and_restart_does_not_reexecute(tmp_path):
    store=ChatSessions(tmp_path)
    run=store.start('owner',Payload(question='empty result'),lambda *_:iter(()),'request')
    store.pool.shutdown(wait=True)
    assert store.run('owner',run['runId'])['status']=='failed'
    with store.db() as db:db.execute("UPDATE chat_runs SET status='running' WHERE id=?",(run['runId'],))
    restarted=ChatSessions(tmp_path)
    assert restarted.run('owner',run['runId'])['status']=='interrupted'
    assert restarted.sessions('owner')[0]['status']=='interrupted'
    assert '服务重启' in ''.join(restarted.events('owner',run['runId']))
    restarted.pool.shutdown(wait=True)
