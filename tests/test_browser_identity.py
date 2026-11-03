import hashlib
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.browser_identity import owner_for_token
from app.chat_sessions import ChatSessions, create_router


def test_verified_browser_recovers_original_history_and_run_without_reassigning_data(tmp_path,monkeypatch):
    original,recovered,stranger='o'*43,'r'*43,'s'*43
    old_owner=owner_for_token(original)
    store=ChatSessions(tmp_path)
    class Payload(BaseModel):
        question:str
        sessionId:str='original-session'
    def execute(payload,owner):
        yield 'final',{'interpretation':'original private answer'}
    run=store.start(old_owner,Payload(question='original question'),execute)
    store.pool.shutdown(wait=True)
    monkeypatch.setenv('VEYA_BROWSER_OWNER_ALIASES',json.dumps({owner_for_token(recovered):old_owner}))
    app=FastAPI();app.include_router(create_router(store,Payload,execute))
    with TestClient(app) as client:
        client.cookies.set('veya_day_owner',recovered)
        data=client.get('/api/chat/sessions').json()['sessions']
        assert data[0]['interpretation']=='original private answer'
        assert client.get('/api/chat/runs/'+run['runId']+'/activity').status_code==200
    for token in [stranger,None]:
        with TestClient(app) as client:
            if token:client.cookies.set('veya_day_owner',token)
            assert client.get('/api/chat/sessions').json()['sessions']==[]
            assert client.get('/api/chat/runs/'+run['runId']+'/activity').status_code==404
    assert store.sessions(old_owner)[0]['id']=='original-session'
    assert owner_for_token(original)==old_owner
    assert owner_for_token(stranger)!=old_owner


def test_invalid_mapping_cannot_redirect_visitors_or_create_alias_chains(monkeypatch):
    token='r'*43;raw=hashlib.sha256(token.encode()).hexdigest()
    for value in ['not json','[]',json.dumps({raw:'not-an-owner'})]:
        monkeypatch.setenv('VEYA_BROWSER_OWNER_ALIASES',value)
        assert owner_for_token(token)==raw
    anonymous=hashlib.sha256(b'').hexdigest()
    monkeypatch.setenv('VEYA_BROWSER_OWNER_ALIASES',json.dumps({raw:'a'*64,'a'*64:'b'*64,anonymous:'a'*64}))
    assert owner_for_token(token)=='a'*64
    assert owner_for_token('')==anonymous
