import hashlib
import hmac
import importlib.util
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def worker(tmp_path,monkeypatch):
    token=tmp_path/'token';token.write_text('worker-secret')
    monkeypatch.setenv('SINGING_DATA_DIR',str(tmp_path));monkeypatch.setenv('SEED_VC_CHECKOUT',str(tmp_path));monkeypatch.setenv('SINGING_TOKEN_FILE',str(token))
    spec=importlib.util.spec_from_file_location('worker_under_test','scripts/singing_service.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    for name in ['vocal.wav','ref.wav']:(tmp_path/name).write_bytes(b'fixture')
    data={'songs':[{'id':'twinkle','title':'小星星','vocal':'vocal.wav','seconds':20},{'id':'private','title':'私有歌','vocal':'vocal.wav','owner':'a'*64},{'id':'learning','title':'尚未学会','vocal':'vocal.wav','owner':'a'*64,'learningJob':'c'*32}], 'voices':[{'id':'companion','label':'声线','reference':'ref.wav'}]}
    (tmp_path/'catalog.json').write_text(json.dumps(data))
    def headers(owner=''):
        value={'Authorization':'Bearer worker-secret'}
        if owner:value['X-Singing-Library']=owner+'.'+hmac.new(b'worker-secret',('song-library:'+owner).encode(),hashlib.sha256).hexdigest()
        return value
    yield SimpleNamespace(m=m,root=tmp_path,client=TestClient(m.app),headers=headers)
    m.POOL.shutdown(wait=True);m.LEARNING_POOL.shutdown(wait=True)


def test_private_and_unfinished_songs_never_leak_through_catalog_render_or_preview(worker):
    e=worker;c=e.client
    assert c.get('/songs').status_code==401
    assert [s['id'] for s in c.get('/songs',headers=e.headers()).json()['songs']]==['twinkle']
    assert [s['id'] for s in c.get('/songs',headers=e.headers('a'*64)).json()['songs']]==['twinkle','private']
    for headers in [e.headers(),e.headers('b'*64)]:
        assert c.post('/render',json={'songId':'private'},headers=headers).status_code==404
        assert c.get('/preview/private',headers=headers).status_code==404
    assert c.post('/render',json={'songId':'learning'},headers=e.headers('a'*64)).status_code==404
    bad={**e.headers(),'X-Singing-Library':'a'*64+'.wrong'}
    assert c.get('/songs',headers=bad).status_code==403


def test_legacy_cached_singing_remains_available_while_learning_owns_gpu(worker):
    e=worker;m=e.m;target,meta=m.cache_paths(m.Render(songId='twinkle'))
    audio=b'\x02#!SILK_V3'+b'fixture';target.write_bytes(audio);meta.write_text(json.dumps({'duration':20}))
    target.with_suffix('.wav').write_bytes(b'RIFFfixture')
    m.LOCK.acquire()
    try:
        r=e.client.post('/render',json={'songId':'twinkle'},headers=e.headers())
        assert r.status_code==200 and r.content==audio
        assert e.client.get('/preview/twinkle',headers=e.headers()).content==b'RIFFfixture'
    finally:m.LOCK.release()


def test_upload_is_durable_idempotent_and_owner_scoped(worker,monkeypatch):
    e=worker;calls=[];monkeypatch.setattr(e.m.LEARNING_POOL,'submit',lambda *a:calls.append(a))
    ident='d'*32;url='/learn/'+ident+'?title=test&start=0';headers=e.headers('a'*64)
    assert e.client.post(url,headers=e.headers(),content=b'x'*200).status_code==403
    r=e.client.post(url,headers=headers,content=b'ID3'+b'x'*200)
    assert r.status_code==200 and r.json()['state']=='queued'
    assert e.client.post(url,headers=headers,content=b'ignored').status_code==200 and len(calls)==1
    assert e.client.get('/learning/'+ident,headers=e.headers('b'*64)).status_code==404
    assert e.client.post(url,headers=e.headers('b'*64),content=b'x'*200).status_code==404
    assert (e.root/'learning'/ident/'input.mp3').read_bytes().startswith(b'ID3')
    assert 'owner' not in r.json()


def test_failed_generation_keeps_registered_song_hidden_and_retry_can_finish(worker,monkeypatch):
    e=worker;m=e.m;ident='c'*32;path=m.job_path(ident);path.parent.mkdir(parents=True)
    data={'id':ident,'owner':'a'*64,'songId':'learning','title':'test','start':0,'state':'queued'};m.write_job(data)
    staged=path.parent/'prepared';(staged/'songs'/'learning').mkdir(parents=True)
    (staged/'songs'/'learning'/'vocal.wav').write_bytes(b'fixture')
    (staged/'catalog.json').write_text(json.dumps({'songs':[{'id':'learning','title':'test','vocal':'songs/learning/vocal.wav'}]}))
    import sys
    monkeypatch.setitem(sys.modules,'soundfile',SimpleNamespace(info=lambda _:SimpleNamespace(duration=8)))
    def fail(*a):raise RuntimeError('model down')
    monkeypatch.setattr(m,'generate',fail);m.learn_job(ident)
    assert json.loads(path.read_text())['state']=='failed'
    assert 'learning' not in [s['id'] for s in e.client.get('/songs',headers=e.headers('a'*64)).json()['songs']]
    monkeypatch.setattr(m,'generate',lambda *a:(b'voice',{'duration':8}));m.learn_job(ident)
    assert json.loads(path.read_text())['state']=='ready'
    assert 'learning' in [s['id'] for s in e.client.get('/songs',headers=e.headers('a'*64)).json()['songs']]
