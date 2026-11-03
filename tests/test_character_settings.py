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
def setup(tmp_path,monkeypatch):
    from app.qq_channel import QQClient
    monkeypatch.setattr('app.character_settings.normalize_character_prompt',lambda profile:profile.agentPrompt)
    monkeypatch.setattr(QQClient,'me',lambda self:{'name':'','avatar':''})
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
    profile.update(name='小蓝',age=25,personality='御姐',responseMode='voice',paragraph='long',stickerProbability=85)
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
    store.save('owner',CharacterProfile(name='小蓝',responseMode='text',stickerProbability=100,stickerIds=[asset]))
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
    assert [row['id'] for row in observed[0][0]]==[asset]


def test_qq_configuration_is_encrypted_owner_scoped_and_blank_preserves_secret(setup,monkeypatch):
    from app.qq_channel import QQClient,QQChannelError
    store,a,b=setup
    checked=[]
    def verify(client):
        checked.append(client.credentials())
        if client.credentials()[1]=='bad':raise QQChannelError('private upstream error')
        return 'test-token'
    monkeypatch.setattr(QQClient,'token',verify)
    a.get('/api/character');b.get('/api/character')
    headers={'X-Veya-Day':'1'}
    assert a.put('/api/character/qq',json={'appId':'123456','appSecret':'bad'},headers=headers).status_code==422
    result=a.put('/api/character/qq',json={'appId':'123456','appSecret':'private-secret'},headers=headers)
    assert result.status_code==200 and 'private-secret' not in result.text
    info=result.json();assert info['hasSecret'] and info['webhookUrl'].split('/')[-1]
    with store.tasks.db() as db:
        row=db.execute('SELECT * FROM character_qq_connections').fetchone()
        assert row['secret']!='private-secret' and 'private-secret' not in row['secret']
    assert a.put('/api/character/qq',json={'appId':'123456','appSecret':''},headers=headers).status_code==200
    assert checked[-1]==('123456','private-secret')
    assert b.get('/api/character').json()['qq']['configured'] is False
    assert b.put('/api/character/qq',json={'appId':'123456','appSecret':'private-secret'},headers=headers).status_code==409


def test_configured_robot_callback_uses_own_secret_and_auto_attaches_persona(setup,monkeypatch):
    import json
    from app.qq_channel import QQClient,create_router as qq_router,signing_key
    store,a,b=setup
    monkeypatch.setattr(QQClient,'token',lambda self:'token')
    a.get('/api/character');headers={'X-Veya-Day':'1'}
    profile=CharacterProfile(name='小蓝',stickerIds=[])
    a.put('/api/character',json=profile.model_dump(),headers=headers)
    configured=a.put('/api/character/qq',json={'appId':'123456','appSecret':'test-secret'},headers=headers).json()
    connection=configured['webhookUrl'].rsplit('/',1)[1]
    sent=[];monkeypatch.setattr(QQClient,'reply',lambda *args,**kw:sent.append(args))
    app=FastAPI();app.include_router(qq_router(store.tasks,chat_runner=lambda *a:{'interpretation':'你好'}))
    with TestClient(app) as client:
        path='/api/qq/webhook/'+connection
        response=client.post(path,json={'op':13,'d':{'event_ts':'123','plain_token':'challenge'}})
        assert response.status_code==200
        signing_key('test-secret').public_key().verify(bytes.fromhex(response.json()['signature']),b'123challenge')
        event={'op':0,'t':'C2C_MESSAGE_CREATE','d':{'id':'msg','author':{'user_openid':'alice'},'content':'帮助'}}
        raw=json.dumps(event).encode();ts=str(int(time.time()))
        assert client.post(path,content=raw).status_code==401
        signed={'X-Signature-Timestamp':ts,'X-Signature-Ed25519':signing_key('test-secret').sign(ts.encode()+raw).hex()}
        assert client.post(path,content=raw,headers=signed).status_code==200
        scope=json.dumps(['123456','users','alice','alice'])
        assert store.for_scope(scope)['name']=='小蓝' and store.for_scope(scope)['stickerIds']==[]
        assert sent


def test_public_pack_square_installs_full_pack_for_only_current_owner(setup):
    from app.sticker_marketplace import installed_stickers,catalog
    store,a,b=setup
    headers={'X-Veya-Day':'1'}
    initial=a.get('/api/character').json()
    assert len(initial['packs'])==8 and sum(p['count'] for p in initial['packs'])==90
    assert len(initial['builtins'])==12
    assert len({item['id'] for item in catalog()})==90
    profile={**initial['profile'],'name':'私人角色','stickerIds':['heart']}
    assert a.put('/api/character',json=profile,headers=headers).status_code==200
    detail=a.get('/api/character/sticker-packs/dafeiyu-reactions').json()
    assert len(detail['items'])==13 and detail['installed'] is False
    assert a.post('/api/character/sticker-packs/unknown',headers=headers).status_code==404
    assert a.post('/api/character/sticker-packs/dafeiyu-reactions').status_code==403
    for _ in range(2):assert a.post('/api/character/sticker-packs/dafeiyu-reactions',headers=headers).status_code==200
    added=a.get('/api/character').json()
    assert added['profile']['name']=='私人角色'
    assert added['profile']['stickerPacks'].count('dafeiyu-reactions')==1
    assert len(added['builtins'])==25 and len(added['profile']['stickerIds'])==14
    assert len(b.get('/api/character').json()['builtins'])==12
    with store.tasks.db() as db:row=db.execute('SELECT owner FROM character_profiles').fetchone()
    scope='qq-pack-test';store.bind(scope,store.code(row['owner'])['command'].split(' ',1)[1])
    assert len(installed_stickers(store.for_scope(scope)))==25
    assert a.delete('/api/character/sticker-packs/dafeiyu-reactions',headers=headers).status_code==200
    removed=a.get('/api/character').json()
    assert len(removed['builtins'])==12 and removed['profile']['stickerIds']==['heart']


@pytest.mark.parametrize('pack_id,count',[('naiwa-companion',17),('genshin-daily',12),('aqua-reactions',8),('kaguya-reactions',8)])
def test_new_character_packs_are_real_distinct_assets_and_installable(setup,pack_id,count):
    from app.sticker_marketplace import ROOT
    store,a,b=setup
    data=a.get('/api/character/sticker-packs/'+pack_id).json()
    assert data['count']==count and len(data['items'])==count
    for item in data['items']:
        assert (ROOT/item['file']).is_file()
        assert item['description'] and item['label']
    if pack_id=='naiwa-companion':
        assert any(item['id']=='naiwa-reference' for item in data['items'])
        assert any(item['file'].endswith('.gif') for item in data['items'])
    assert a.post('/api/character/sticker-packs/'+pack_id,headers={'X-Veya-Day':'1'}).status_code==200
    assert len(a.get('/api/character').json()['builtins'])==12+count


def test_managed_qq_one_confirmation_saves_profile_and_uses_existing_callback(setup,monkeypatch):
    import json
    from app.qq_channel import QQClient,QQChannelError,create_router as qq_router,signing_key
    store,a,b=setup
    monkeypatch.setenv('QQ_BOT_APP_ID','123456');monkeypatch.setenv('QQ_BOT_APP_SECRET','saved-secret')
    def token(client):
        if client.credentials()[1]!='saved-secret':raise QQChannelError('invalid secret')
        return 'token'
    monkeypatch.setattr(QQClient,'token',token)
    monkeypatch.setattr(QQClient,'reply',lambda *a,**kw:None)
    a.get('/api/character');headers={'X-Veya-Day':'1'}
    profile=CharacterProfile(name='一次确认角色',personality='甜妹',responseMode='text',paragraph='minimal',stickerProbability=85)
    response=a.put('/api/character/qq',json={'appId':'123456','appSecret':'saved-secret','profile':profile.model_dump()},headers=headers)
    assert response.status_code==200
    assert response.json()['ready'] is True and response.json()['requiresWebhookSetup'] is False
    assert response.json()['profile']==profile.model_dump()
    assert a.get('/api/character').json()['profile']==profile.model_dump()
    app=FastAPI();app.include_router(qq_router(store.tasks,chat_runner=lambda *a:{'interpretation':'你好'}))
    with TestClient(app) as client:
        event={'op':0,'t':'C2C_MESSAGE_CREATE','d':{'id':'existing-route','author':{'user_openid':'alice'},'content':'帮助'}}
        raw=json.dumps(event).encode();ts=str(int(time.time()))
        signed={'X-Signature-Timestamp':ts,'X-Signature-Ed25519':signing_key('saved-secret').sign(ts.encode()+raw).hex()}
        assert client.post('/api/qq/webhook',content=raw,headers=signed).status_code==200
    scope=json.dumps(['123456','users','alice','alice'])
    assert store.for_scope(scope)==profile.model_dump()
    bad=a.put('/api/character/qq',json={'appId':'123456','appSecret':'bad','profile':{**profile.model_dump(),'name':'不应保存'}},headers=headers)
    assert bad.status_code==422
    assert a.get('/api/character').json()['profile']['name']=='一次确认角色'


def test_qq_identity_syncs_on_confirm_refreshes_and_stays_owner_scoped(setup,monkeypatch):
    from app.qq_channel import QQClient,QQChannelError
    store,a,b=setup
    calls=[];version={'name':'QQ 机器人'}
    monkeypatch.setattr(QQClient,'token',lambda self:'token')
    def me(client):
        calls.append(client.credentials()[0])
        return {'name':version['name'],'avatar':'https://q.qlogo.cn/test-avatar.png'}
    monkeypatch.setattr(QQClient,'me',me)
    h={'X-Veya-Day':'1'};a.get('/api/character');b.get('/api/character')
    profile=CharacterProfile(name='临时名字',personality='甜妹')
    result=a.put('/api/character/qq',json={'appId':'123456','appSecret':'secret','profile':profile.model_dump()},headers=h).json()
    assert result['botName']=='QQ 机器人' and result['profile']['name']=='QQ 机器人'
    assert result['avatarUrl']=='https://q.qlogo.cn/test-avatar.png'
    assert a.get('/api/character').json()['profile']['name']=='QQ 机器人' and len(calls)==1
    assert b.get('/api/character').json()['qq']['botName']==''
    version['name']='QQ 新名字'
    with store.tasks.db() as db:db.execute('UPDATE character_qq_profiles SET fetched=0')
    refreshed=a.get('/api/character').json()
    assert refreshed['profile']['name']=='QQ 新名字' and refreshed['qq']['botName']=='QQ 新名字'
    assert len(calls)==2
    with store.tasks.db() as db:db.execute('UPDATE character_qq_profiles SET fetched=0')
    monkeypatch.setattr(QQClient,'me',lambda self:(_ for _ in ()).throw(QQChannelError('unavailable')))
    fallback=a.get('/api/character').json()
    assert fallback['qq']['botName']=='QQ 新名字' and fallback['qq']['avatarUrl']==refreshed['qq']['avatarUrl']


def test_qq_profile_api_uses_bot_token_and_rejects_unsafe_avatar(monkeypatch):
    from types import SimpleNamespace
    from app.qq_channel import QQClient
    import app.qq_channel as module
    monkeypatch.setattr(QQClient,'token',lambda self:'test-access-token')
    profile={'username':' QQ 名称 ','avatar':'https://q.qlogo.cn/profile.png'}
    def get(url,**kwargs):
        assert url=='https://api.sgroup.qq.com/users/@me'
        assert kwargs['headers']['Authorization']=='QQBot test-access-token' and kwargs['allow_redirects'] is False
        return SimpleNamespace(status_code=200,json=lambda:profile)
    monkeypatch.setattr(module.requests,'get',get)
    assert QQClient().me()=={'name':'QQ 名称','avatar':'https://q.qlogo.cn/profile.png'}
    profile['avatar']='http://thirdqq.qlogo.cn/profile.png'
    assert QQClient().me()['avatar']=='https://thirdqq.qlogo.cn/profile.png'
    profile['avatar']='http://untrusted.example/profile.png'
    assert QQClient().me()['avatar']==''
    profile['avatar']='javascript:alert(1)'
    assert QQClient().me()['avatar']==''


def test_saved_qq_secret_is_explicit_owner_only_and_never_cached(setup,monkeypatch):
    from app.qq_channel import QQClient
    store,a,b=setup
    monkeypatch.setattr(QQClient,'token',lambda self:'token')
    a.get('/api/character');b.get('/api/character')
    headers={'X-Veya-Day':'1'}
    a.put('/api/character/qq',json={'appId':'123456','appSecret':'private-owner-secret'},headers=headers)
    assert 'private-owner-secret' not in a.get('/api/character').text
    assert a.get('/api/character/qq/secret').status_code==403
    assert a.get('/api/character/qq/secret',headers={**headers,'Sec-Fetch-Site':'cross-site'}).status_code==403
    assert b.get('/api/character/qq/secret',headers=headers).status_code==404
    revealed=a.get('/api/character/qq/secret',headers=headers)
    assert revealed.json()=={'appSecret':'private-owner-secret'}
    assert revealed.headers['Cache-Control']=='no-store' and revealed.headers['Pragma']=='no-cache'


def test_legacy_random_delivery_is_normalized_to_smart_and_combined_personalities_are_kept():
    profile=CharacterProfile.model_validate({'responseMode':'random','personality':'甜妹、温柔知性、幽默风趣'})
    assert profile.responseMode=='auto'
    assert '甜妹、温柔知性、幽默风趣' in character_context(profile.model_dump())


def test_saved_identity_changes_reach_bound_scope_despite_older_agent_preferences(setup):
    store,a,_=setup
    a.get('/api/character')
    original=CharacterProfile(relationship='daughter',role='用户的女儿',agentPrompt='称呼用户爸爸，语气自然')
    assert a.put('/api/character',json=original.model_dump(),headers={'X-Veya-Day':'1'}).status_code==200
    code=a.post('/api/character/link-code',headers={'X-Veya-Day':'1'}).json()['command'].split(' ',1)[1]
    store.bind('qq-latest-persona',code)
    updated=original.model_copy(update={'relationship':'sidekick','role':'用户的跟班小弟，称呼用户老大'})
    assert a.put('/api/character',json=updated.model_dump(),headers={'X-Veya-Day':'1'}).status_code==200
    current=store.for_scope('qq-latest-persona')
    assert current['relationship']=='sidekick' and current['role']==updated.role
    assert current['agentPrompt']==original.agentPrompt
    prompt=character_context(current)
    assert '用户的跟班小弟，称呼用户老大' in prompt
    assert '优先于补充表达偏好中的旧身份或称呼' in prompt
    assert '不能恢复已被当前设定替换的身份、关系或称呼' in prompt


def test_qq_confirmation_uses_same_prompt_cleanup_and_saves_atomically(setup,monkeypatch):
    from fastapi import HTTPException
    from app.qq_channel import QQClient
    store,a,_=setup
    a.get('/api/character')
    monkeypatch.setattr(QQClient,'token',lambda self:'token')
    monkeypatch.setattr('app.character_settings.normalize_character_prompt',lambda profile:'语气自然，讨论正事时认真。')
    body={'appId':'123456','appSecret':'test-secret','profile':CharacterProfile(relationship='sidekick',role='跟班小弟',agentPrompt='我是女儿，叫爸爸，语气自然，讨论正事时认真。').model_dump()}
    response=a.put('/api/character/qq',json=body,headers={'X-Veya-Day':'1'})
    assert response.status_code==200
    assert response.json()['profile']['agentPrompt']=='语气自然，讨论正事时认真。'
    def fail(profile):raise HTTPException(503,'not saved')
    monkeypatch.setattr('app.character_settings.normalize_character_prompt',fail)
    body['appSecret']='replacement-secret';body['profile']['role']='另一个角色'
    assert a.put('/api/character/qq',json=body,headers={'X-Veya-Day':'1'}).status_code==503
    with store.tasks.db() as db:
        row=db.execute('SELECT id FROM character_qq_connections').fetchone()
    assert store.qq.credentials(row['id'])[1]=='test-secret'
