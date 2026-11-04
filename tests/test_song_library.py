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


def test_full_song_preview_and_receipt_are_not_rejected_by_excerpt_limits(env,monkeypatch):
    e=env;ident=upload(e)
    audio=b'\x02#!SILK_V3'+b'a'*(2*1024*1024+1)
    preview=b'RIFF'+b'w'*(8*1024*1024+1)
    monkeypatch.setattr('app.song_library.requests.post',lambda *a,**kw:response(audio=audio,headers={'X-Audio-Duration':'242.4'}))
    monkeypatch.setattr('app.song_library.requests.get',lambda *a,**kw:response(audio=preview))
    e.service.finish(e.service.row(e.owner,ident),{},'http://worker')
    assert e.service.row(e.owner,ident)['seconds']==242.4
    assert (e.service.root/(ident+'.wav')).stat().st_size==len(preview)


def test_rebuilt_song_listing_and_preview_use_current_full_recording(env,monkeypatch):
    e=env;ident=upload(e);ready(e,ident)
    (e.service.root/(ident+'.wav')).write_bytes(b'RIFFold-excerpt')
    def get(url,**kwargs):
        if '/preview/' in url:return response(audio=b'RIFFfull-recording')
        return response({'songs':[{'id':'learn-'+ident,'seconds':254.59}],'ready':True})
    monkeypatch.setattr('app.song_library.requests.get',get)
    assert e.a.get('/api/character/songs').json()['learned'][0]['seconds']==254.59
    assert e.a.get('/api/character/songs/learn-'+ident+'/preview').content==b'RIFFfull-recording'


def test_song_rename_delete_persist_and_block_cached_previews_without_affecting_other_owners(env,monkeypatch):
    e=env;catalog={'songs':[{'id':'curated','title':'原歌名','seconds':120}],'ready':True}
    from app.qq_singing import edited_catalog
    monkeypatch.setenv('VEYA_DAY_DATA_DIR',str(e.tasks.directory))
    monkeypatch.setattr('app.song_library.requests.get',lambda *a,**kw:response(catalog))
    headers={'X-Veya-Day':'1'}
    assert e.a.patch('/api/character/songs/curated',json={'title':'新歌名'}).status_code==403
    assert e.a.patch('/api/character/songs/curated',json={'title':'  '},headers=headers).status_code==422
    assert e.a.patch('/api/character/songs/curated',json={'title':' 新歌名 '},headers=headers).status_code==200
    assert e.a.get('/api/character/songs').json()['learned'][0]['title']=='新歌名'
    assert e.b.get('/api/character/songs').json()['learned'][0]['title']=='原歌名'
    assert edited_catalog(catalog,e.owner+'.verified')['songs'][0]['title']=='新歌名'
    e.service.preview_path(e.owner,'curated').write_bytes(b'RIFFcached')
    assert e.a.delete('/api/character/songs/curated',headers=headers).status_code==200
    assert e.a.get('/api/character/songs').json()['learned']==[]
    assert e.b.get('/api/character/songs').json()['learned'][0]['id']=='curated'
    assert e.a.get('/api/character/songs/curated/preview').status_code==404
    assert e.a.get('/api/character/songs/curated/preview-status').status_code==404
    assert e.a.post('/api/character/songs/curated/preview',json={},headers=headers).status_code==404
    assert edited_catalog(catalog,e.owner+'.verified')['songs']==[]
    assert edited_catalog(catalog,'b'*64+'.verified')['songs'][0]['title']=='原歌名'


def test_offline_edits_persist_against_the_cached_catalog_without_a_model_restart(env,monkeypatch):
    import requests
    e=env
    monkeypatch.setattr('app.song_library.requests.get',lambda *a,**kw:response({'songs':[{'id':'song','title':'原名'}],'ready':True}))
    assert e.a.get('/api/character/songs').json()['learned'][0]['title']=='原名'
    monkeypatch.setattr('app.song_library.requests.get',lambda *a,**kw:(_ for _ in ()).throw(requests.ConnectionError()))
    assert e.a.patch('/api/character/songs/song',json={'title':'新名'},headers={'X-Veya-Day':'1'}).status_code==200
    assert e.a.get('/api/character/songs').json()['learned'][0]['title']=='新名'


def ready(e,ident):
    e.service.update(ident,state='ready',seconds=20,recipient=e.scope,notification='pending')
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


def test_preview_prepares_missing_builtin_audio_once_and_serves_seekable_wav(env,monkeypatch):
    import io,time,wave,threading
    e=env;buffer=io.BytesIO()
    with wave.open(buffer,'wb') as output:
        output.setnchannels(1);output.setsampwidth(2);output.setframerate(16000);output.writeframes(b'\0\0'*160)
    wav=buffer.getvalue();entered=threading.Event();release=threading.Event();calls=[];generated=[False]
    class PreviewResponse:
        def __init__(self,status=200,body=b''):self.status_code=status;self.body=body
        def __enter__(self):return self
        def __exit__(self,*a):self.close()
        def close(self):pass
        def raise_for_status(self):
            if self.status_code!=200:raise RuntimeError('bad response')
        def iter_content(self,size):yield self.body
    def get(url,**kwargs):
        if url.endswith('/songs'):return response({'songs':[{'id':'amazing-grace','title':'奇异恩典','seconds':173.973333}],'ready':True})
        return PreviewResponse(200,wav) if generated[0] else PreviewResponse(404)
    def post(url,**kwargs):
        calls.append(url);entered.set();assert release.wait(3);generated[0]=True;return PreviewResponse()
    monkeypatch.setattr('app.song_library.requests.get',get);monkeypatch.setattr('app.song_library.requests.post',post)
    try:
        assert e.a.post('/api/character/songs/amazing-grace/preview',json={},headers={'X-Veya-Day':'1'}).status_code==200
        assert entered.wait(1)
        assert e.a.post('/api/character/songs/amazing-grace/preview',json={},headers={'X-Veya-Day':'1'}).json()['state']=='preparing'
        release.set();deadline=time.monotonic()+2
        while e.a.get('/api/character/songs/amazing-grace/preview-status').json()['state']!='ready' and time.monotonic()<deadline:time.sleep(.01)
        assert len(calls)==1
        result=e.a.get('/api/character/songs/amazing-grace/preview',headers={'Range':'bytes=0-11'})
        assert result.status_code==206 and result.content==wav[:12]
        assert e.a.post('/api/character/songs/amazing-grace/preview',json={},headers={'X-Veya-Day':'1'}).json()['state']=='ready'
        assert len(calls)==1
    finally:release.set()


def select_groups(e,targets,private=False):
    from app.character_settings import CharacterProfile
    from app.qq_destinations import GroupDirectory,room_scope
    directory=GroupDirectory(e.tasks)
    scopes=[room_scope('123456',target) for target in targets]
    for target in targets:directory.note('123456',target,active=1,allowed=1)
    e.service.characters.save(e.owner,CharacterProfile(proactivePrivate=private,proactiveGroups=[scope_id(s) for s in scopes]))
    return scopes


def test_legacy_pending_private_notice_uses_current_selected_groups(env):
    e=env;ident=upload(e);row=ready(e,ident)
    select_groups(e,['room-one','room-two'])
    calls=[]
    e.client.proactive=lambda target,body,**kw:calls.append(('text',target,kw.get('kind','users')))
    e.client.proactive_media=lambda target,url,**kw:calls.append(('audio',target,kw.get('kind','users')))
    e.service.notify(row);e.service.notify(row)
    assert calls==[('text','room-one','groups'),('audio','room-one','groups'),('text','room-two','groups'),('audio','room-two','groups')]
    assert e.service.row(e.owner,ident)['notification']=='sent'
    with e.tasks.db() as db:
        assert db.execute('SELECT count(*) FROM song_notification_attempts').fetchone()[0]==4
        assert db.execute('SELECT count(*) FROM qq_extra_message_attempts').fetchone()[0]==0


def test_practice_cannot_override_group_only_settings_with_private_recipient(env):
    e=env;ident=upload(e);select_groups(e,['room-one'])
    with pytest.raises(Exception) as error:
        e.service.practice(e.owner,ident,PracticeInput(recipientId=scope_id(e.scope)))
    assert error.value.status_code==422
    e.service.practice(e.owner,ident,PracticeInput())
    assert json.loads(e.service.row(e.owner,ident)['recipient'])[1]=='groups'


def test_notification_stops_when_all_destinations_are_unchecked(env):
    e=env;ident=upload(e);row=ready(e,ident);select_groups(e,[])
    e.service.notify(row)
    assert not e.sent
    assert e.service.row(e.owner,ident)['notification']=='cancelled'


def test_group_notification_rechecks_settings_before_audio(env):
    e=env;ident=upload(e);row=ready(e,ident);select_groups(e,['room-one'])
    calls=[]
    def send(target,body,**kw):
        calls.append((target,kw['kind']));select_groups(e,[])
    e.client.proactive=send
    e.service.notify(row)
    assert calls==[('room-one','groups')] and not e.sent
    with e.tasks.db() as db:
        assert sorted(r['state'] for r in db.execute('SELECT state FROM song_notification_attempts'))==['cancelled','sent']


def test_group_permission_revocation_does_not_fall_back_to_private(env):
    from app.qq_destinations import GroupDirectory
    e=env;ident=upload(e);row=ready(e,ident);select_groups(e,['room-one'])
    GroupDirectory(e.tasks).note('123456','room-one',allowed=0)
    e.service.notify(row)
    assert not e.sent and e.service.row(e.owner,ident)['notification']=='cancelled'
