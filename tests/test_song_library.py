import hashlib
import json
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.day_tasks import DayTasks
from app.character_settings import CharacterStore
from app.qq_chat import QQChat
from app.qq_companion import TZ,local_day,scope_id
from app.song_library import SongLibrary,PracticeInput,create_router
from app.chat_sessions import COOKIE
from app.browser_identity import owner_for_token

AUDIO=b'\x02#!SILK_V3'+b'voice'*100
MP3=b'ID3'+b'x'*200

@pytest.fixture
def env(tmp_path,monkeypatch):
    monkeypatch.setenv('QQ_SINGING_TOKEN','test-private-token')
    monkeypatch.setenv('QQ_SINGING_ENDPOINT','http://worker')
    tasks=DayTasks(tmp_path,lambda *a:{})
    characters=CharacterStore(tasks)
    chat=QQChat(tasks,SimpleNamespace(),lambda *a:{})
    chat.pool.shutdown(wait=False)
    sent=[]
    client=SimpleNamespace(proactive=lambda *a:sent.append(('text',a)),proactive_media=lambda *a,**k:sent.append(('audio',a)))
    now=[datetime(2026,11,3,12,tzinfo=TZ).timestamp()]
    service=SongLibrary(tasks,characters,client_factory=lambda **kw:client,clock=lambda:now[0])
    app=FastAPI();app.include_router(create_router(service))
    a=TestClient(app);b=TestClient(app)
    a.cookies.set(COOKIE,'a'*43);b.cookies.set(COOKIE,'b'*43)
    owner=owner_for_token('a'*43)
    scope=json.dumps(['123456','users','alice','alice'])
    with tasks.db() as db:
        db.execute('INSERT INTO character_links VALUES(?,?)',(scope,owner))
        db.execute('INSERT INTO character_qq_connections VALUES(?,?,?,?,?)',('connection',owner,'123456',tasks.cipher.encrypt(b'fake-secret').decode(),now[0]))
    yield SimpleNamespace(tasks=tasks,service=service,a=a,b=b,owner=owner,scope=scope,now=now,sent=sent,client=client)
    service.close()


def upload(e,title='我的歌'):
    response=e.a.post('/api/character/songs/upload',params={'title':title,'filename':'song.mp3','start':0},content=MP3,headers={'X-Veya-Day':'1'})
    assert response.status_code==200,response.text
    return response.json()['jobId']


def response(body=None,audio=None,status=200,headers=None):
    def check():
        if status>=400:
            import requests
            raise requests.HTTPError(response=SimpleNamespace(status_code=status))
    return SimpleNamespace(status_code=status,json=lambda:body,content=audio,headers=headers or {},raise_for_status=check)


def test_upload_requires_user_action_and_isolated_by_owner(env,monkeypatch):
    e=env
    monkeypatch.setattr('app.song_library.requests.get',lambda *a,**kw:response({'songs':[{'id':'twinkle','title':'小星星'}],'ready':True}))
    ident=upload(e)
    assert e.service.row(e.owner,ident)['state']=='uploaded'
    e.service.tick()
    assert e.service.row(e.owner,ident)['state']=='uploaded' and not e.sent
    a=e.a.get('/api/character/songs').json();b=e.b.get('/api/character/songs').json()
    assert len(a['learned'])==1 and a['practicing'][0]['jobId']==ident and not b['practicing']
    assert e.b.post(f'/api/character/songs/{ident}/practice',json={},headers={'X-Veya-Day':'1'}).status_code==404
    assert e.b.get(f'/api/character/songs/learn-{ident}/preview').status_code==404
    assert e.a.post(f'/api/character/songs/{ident}/practice',json={}).status_code==403
    assert e.a.post('/api/character/songs/upload',params={'title':'坏文件','filename':'song.mp3'},content=b'not mp3'*40,headers={'X-Veya-Day':'1'}).status_code==422
    with e.tasks.db() as db:assert db.execute('SELECT count(*) FROM song_practice').fetchone()[0]==1


def test_practice_failure_keeps_song_out_of_learned_and_retry_is_idempotent(env,monkeypatch):
    e=env;ident=upload(e)
    monkeypatch.setattr('app.song_library.requests.post',lambda *a,**kw:response({'state':'queued'}))
    monkeypatch.setattr('app.song_library.requests.get',lambda *a,**kw:response({'state':'failed','error':'片段太短'}))
    e.service.practice(e.owner,ident,PracticeInput())
    e.service.tick()
    assert e.service.row(e.owner,ident)['state']=='failed' and not e.sent
    e.service.practice(e.owner,ident,PracticeInput());e.service.practice(e.owner,ident,PracticeInput())
    assert e.service.row(e.owner,ident)['state']=='queued'


def test_completed_job_moves_tabs_caches_real_audio_and_notifies_once(env,monkeypatch):
    e=env;ident=upload(e)
    def post(url,**kwargs):
        assert kwargs['headers']['X-Singing-Library'].startswith(e.owner+'.')
        return response(audio=AUDIO,headers={'X-Audio-Duration':'7.5'}) if url.endswith('/render') else response({'state':'queued'})
    def get(url,**kwargs):
        if '/preview/' in url:return response(audio=b'RIFF'+b'wave'*100)
        if url.endswith('/songs'):return response({'songs':[],'ready':True})
        return response({'state':'ready'})
    monkeypatch.setattr('app.song_library.requests.post',post);monkeypatch.setattr('app.song_library.requests.get',get)
    e.service.practice(e.owner,ident,PracticeInput(notify=True,recipientId=scope_id(e.scope)))
    e.service.tick();e.service.tick()
    row=e.service.row(e.owner,ident)
    assert row['state']=='ready' and row['notification']=='sent' and row['seconds']==7.5
    assert [x[0] for x in e.sent]==['text','audio'] and '我的歌' in e.sent[0][1][1]
    assert e.a.get(f'/api/character/songs/learn-{ident}/preview').content.startswith(b'RIFF')
    result=e.a.get('/api/character/songs').json()
    assert not result['practicing'] and result['learned'][0]['seconds']==7.5
    with e.tasks.db() as db:assert db.execute("SELECT count(*) FROM song_notification_attempts WHERE state='sent'").fetchone()[0]==2
    assert e.service.memory.snapshot(e.owner,e.now[0])['recipients'][0]['sentToday']==0


def ready(e,ident):
    e.service.update(ident,state='ready',recipient=e.scope,notification='pending')
    (e.service.root/(ident+'.silk')).write_bytes(AUDIO)
    return e.service.row(e.owner,ident)


def test_completion_notifications_are_independent_of_daily_outreach_cap(env):
    e=env;ident=upload(e);row=ready(e,ident)
    e.now[0]=datetime(2026,11,3,22,tzinfo=TZ).timestamp();e.service.notify(row);assert not e.sent
    e.now[0]=datetime(2026,11,4,12,tzinfo=TZ).timestamp()
    with e.tasks.db() as db:
        for i in range(3):db.execute("INSERT INTO qq_companion_outbox(id,scope,day,due,state,attempted) VALUES(?,?,?,?,'sent',?)",(str(i),e.scope,local_day(e.now[0]),e.now[0],e.now[0]))
    e.service.notify(row)
    assert [x[0] for x in e.sent]==['text','audio']
    assert e.service.row(e.owner,ident)['notification']=='sent'
    assert e.service.memory.snapshot(e.owner,e.now[0])['recipients'][0]['sentToday']==3
    another=upload(e);pending=ready(e,another)
    assert e.a.delete(f'/api/character/songs/{another}/notification',headers={'X-Veya-Day':'1'}).status_code==200
    e.service.notify(pending);assert len(e.sent)==2


def test_uncertain_qq_failure_never_replays_or_exceeds_budget(env):
    e=env;ident=upload(e);row=ready(e,ident)
    def fail(*a,**kw):raise RuntimeError('connection lost after write')
    e.client.proactive_media=fail
    e.service.notify(row);e.service.notify(row)
    assert len(e.sent)==1 and e.service.row(e.owner,ident)['notification']=='unknown'
    with e.tasks.db() as db:assert db.execute('SELECT count(*) FROM song_notification_attempts').fetchone()[0]==2


def test_practice_rejects_unlinked_recipient_and_cross_site(env):
    e=env;ident=upload(e)
    with pytest.raises(Exception) as error:e.service.practice(e.owner,ident,PracticeInput(notify=True,recipientId='bad'))
    assert error.value.status_code==422
    assert e.a.post(f'/api/character/songs/{ident}/practice',json={},headers={'X-Veya-Day':'1','Sec-Fetch-Site':'cross-site'}).status_code==403


def test_filename_supplies_title_and_practice_defaults_to_notify_sole_linked_recipient(env):
    e=env
    r=e.a.post('/api/character/songs/upload',params={'filename':'我的新歌.mp3'},content=MP3,headers={'X-Veya-Day':'1'})
    assert r.status_code==200 and r.json()['title']=='我的新歌'
    result=e.a.post('/api/character/songs/'+r.json()['jobId']+'/practice',json={},headers={'X-Veya-Day':'1'})
    assert result.status_code==200 and result.json()['notification']=='pending'


def test_legacy_song_receipts_migrate_without_consuming_companion_quota(env):
    e=env;key='song:old:text';day=local_day(e.now[0])
    with e.tasks.db() as db:db.execute("INSERT INTO qq_extra_message_attempts VALUES(?,?,?,'sent')",(key,e.scope,day))
    migrated=SongLibrary(e.tasks,e.service.characters,clock=e.service.clock)
    with e.tasks.db() as db:
        assert db.execute('SELECT state FROM song_notification_attempts WHERE key=?',(key,)).fetchone()[0]=='sent'
        assert db.execute('SELECT 1 FROM qq_extra_message_attempts WHERE key=?',(key,)).fetchone() is None
    assert migrated.memory.extra_sent(e.scope,day)==0
    migrated.close()
