import base64
import hashlib
import io
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
import pytest

from app.day_tasks import DayTasks
from app.character_settings import CharacterStore, CharacterProfile, character_context, create_router


@pytest.fixture
def setup(tmp_path):
    tasks=DayTasks(tmp_path,lambda *a:{})
    store=CharacterStore(tasks)
    app=FastAPI();app.include_router(create_router(store))
    return store,TestClient(app),TestClient(app)


def picture():
    data=io.BytesIO();Image.new('RGB',(32,32),'blue').save(data,format='PNG')
    return base64.b64encode(data.getvalue()).decode()


def test_profiles_scoped_and_validated(setup):
    store,a,b=setup
    profile=a.get('/api/character').json()['profile']
    assert profile['name']=='Mentora'
    assert a.put('/api/character',json=profile).status_code==403
    profile.update(name='小蓝',age=25,personality='御姐',responseMode='random',paragraph='long',stickerProbability=85)
    assert a.put('/api/character',json=profile,headers={'X-Veya-Day':'1'}).status_code==200
    assert a.get('/api/character').json()['profile']==profile
    assert b.get('/api/character').json()['profile']['name']=='Mentora'
    assert a.put('/api/character',json={**profile,'stickerProbability':101},headers={'X-Veya-Day':'1'}).status_code==422
    assert a.put('/api/character',json=profile,headers={'X-Veya-Day':'1','Sec-Fetch-Site':'cross-site'}).status_code==403


def test_pairing_one_use_expiry_and_qq_scope_isolation(setup):
    store,a,b=setup
    a.get('/api/character')
    profile=CharacterProfile(name='小蓝',agentPrompt='语气温柔一点')
    a.put('/api/character',json=profile.model_dump(),headers={'X-Veya-Day':'1'})
    result=a.post('/api/character/link-code',headers={'X-Veya-Day':'1'}).json()
    code=result['command'].split(' ',1)[1]
    assert store.bind('qq-alice',code).startswith('角色已绑定')
    assert store.for_scope('qq-alice')['name']=='小蓝'
    assert store.for_scope('qq-bob')['name']=='Mentora'
    assert '无效' in store.bind('qq-bob',code)
    assert a.get('/api/character').json()['linkedCount']==1
    code2=a.post('/api/character/link-code',headers={'X-Veya-Day':'1'}).json()['command'].split(' ',1)[1]
    with store.tasks.db() as db:db.execute('UPDATE character_codes SET expires=?',(time.time()-1,))
    assert '过期' in store.bind('qq-bob',code2)
    store.unbind('qq-alice')
    assert store.for_scope('qq-alice')['name']=='Mentora'


def test_upload_reencoded_and_used_only_by_bound_owner(setup):
    store,a,b=setup
    a.get('/api/character');b.get('/api/character')
    response=a.post('/api/character/stickers',json={'label':'开心','description':'庆祝时开心','data':picture()},headers={'X-Veya-Day':'1'})
    assert response.status_code==200
    asset=response.json()['id']
    item=a.get('/api/character').json()['stickers'][0]
    assert item['id']==asset and item['label']=='开心'
    assert b.get('/api/character').json()['stickers']==[]
    assert a.get(item['url']).content.startswith(b'\x89PNG')
    assert b.delete('/api/character/stickers/'+asset,headers={'X-Veya-Day':'1'}).status_code==404
    assert a.post('/api/character/stickers',json={'label':'bad','description':'bad','data':base64.b64encode(b'<script>bad').decode()},headers={'X-Veya-Day':'1'}).status_code==422
    assert a.delete('/api/character/stickers/'+asset,headers={'X-Veya-Day':'1'}).status_code==200
    assert a.get(item['url']).status_code==404


def test_profile_context_and_voice_preference_reset(setup):
    store,a,b=setup
    with store.tasks.db() as db:
        db.execute('CREATE TABLE qq_voice_preferences(scope TEXT PRIMARY KEY,enabled INTEGER)')
        db.execute("INSERT INTO character_links VALUES('scope','owner')")
        db.execute("INSERT INTO qq_voice_preferences VALUES('scope',0)")
    store.save('owner',CharacterProfile(name='测试角色',paragraph='minimal',agentPrompt='不要长篇大论'))
    context=character_context(store.for_scope('scope'))
    assert '测试角色' in context and '30 至 100' in context and '不要长篇大论' in context
    with store.tasks.db() as db:assert db.execute('SELECT count(*) FROM qq_voice_preferences').fetchone()[0]==0


def test_qq_delivery_uses_bound_preferences_and_uploaded_stickers(setup,monkeypatch):
    from types import SimpleNamespace
    from app.qq_chat import QQChat
    store,a,b=setup
    store.save('owner',CharacterProfile(name='小蓝',responseMode='text',stickerProbability=100))
    asset=store.add('owner',__import__('app.character_settings',fromlist=['StickerInput']).StickerInput(label='庆祝',description='开心庆祝',data=picture()))['id']
    store.bind('scope',store.code('owner')['command'].split(' ',1)[1])
    texts,images,observed=[],[],[]
    client=SimpleNamespace(reply=lambda *args,**kw:texts.append(args[-1]),image_reply=lambda *args,**kw:images.append(args[-1]))
    chat=QQChat(store.tasks,client,lambda *args:{'interpretation':'好耶'})
    def route(q,answer,history,catalog,**kwargs):
        observed.append((catalog,kwargs))
        return {'mode':'voice','confidence':.99,'sticker':asset}
    monkeypatch.setattr(chat.expression,'route',route)
    monkeypatch.setattr(chat.voice,'send',lambda *a:pytest.fail('text preference must override voice'))
    chat.enqueue('event','scope','users','target','mid','庆祝一下')
    chat.pool.shutdown(wait=True)
    assert texts==['好耶'] and images[0].endswith('/api/character/stickers/'+asset+'.png')
    assert observed[0][1]['sticker_probability']==100
    assert any(row['id']==asset for row in observed[0][0])
