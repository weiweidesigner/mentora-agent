import json
import hashlib
import threading
import time
from types import SimpleNamespace

import pytest
from app.day_tasks import DayTasks
from app.qq_channel import QQChannel
from app.character_settings import CharacterProfile


class Client:
    def __init__(self): self.sent=[]
    def credentials(self): return 'app','secret'
    def reply(self,*args,**kwargs): self.sent.append((args,kwargs))


def event(text='大肥鱼，这件事你怎么看？', mid='msg', group='room', sender='alice', mentioned=False):
    return {'op':0,'t':'GROUP_AT_MESSAGE_CREATE' if mentioned else 'GROUP_MESSAGE_CREATE',
            'd':{'id':mid,'group_openid':group,'content':text,'author':{'member_openid':sender}}}


def until(fn):
    end=time.monotonic()+3
    while time.monotonic()<end:
        if fn(): return
        time.sleep(.01)
    raise AssertionError('background work did not finish')


@pytest.fixture
def bot(tmp_path):
    tasks=DayTasks(tmp_path,lambda *a:{})
    client=Client();calls=[]
    channel=QQChannel(tasks,client=client,chat_runner=lambda *a:(calls.append(a) or {'interpretation':'这件事我觉得可以这样看。'}))
    channel.chat.expression.route=lambda *a,**k:{'mode':'text','confidence':None,'sticker':None,'source':'test'}
    yield channel,tasks,client,calls
    channel.chat.groups.pool.shutdown(wait=True)
    channel.chat.pool.shutdown(wait=True)
    for timer in channel.chat.notices.values():timer.cancel()


def state(tasks):
    with tasks.db() as db:return db.execute('SELECT state FROM qq_events ORDER BY updated DESC LIMIT 1').fetchone()['state']


def test_ordinary_group_callback_is_async_and_selected_reply_is_delivered_once(bot):
    channel,tasks,client,calls=bot;entered=threading.Event();release=threading.Event()
    def decide(*args):
        entered.set();release.wait(2);return True
    channel.chat.groups.should_reply=decide
    try:
        channel.dispatch(event())
        assert entered.wait(1) and not calls and not client.sent
        channel.dispatch(event())
    finally:release.set()
    until(lambda:len(client.sent)==1)
    assert len(calls)==1 and client.sent[0][0][:2]==('groups','room')
    channel.dispatch(event(mentioned=True));channel.dispatch(event())
    assert len(calls)==1


def test_quiet_message_does_not_generate_a_reply_and_later_at_can_upgrade_it(bot):
    channel,tasks,client,calls=bot;channel.chat.groups.should_reply=lambda *a:False
    channel.dispatch(event());until(lambda:state(tasks)=='ignored')
    assert not calls and not client.sent
    channel.dispatch(event());assert not calls
    channel.dispatch(event(mentioned=True));until(lambda:len(client.sent)==1)
    assert len(calls)==1


def test_at_arriving_during_screening_is_not_lost_or_duplicated(bot):
    channel,tasks,client,calls=bot;entered=threading.Event();release=threading.Event()
    def decide(*a):entered.set();release.wait(2);return False
    channel.chat.groups.should_reply=decide
    try:
        channel.dispatch(event());assert entered.wait(1)
        channel.dispatch(event(mentioned=True))
    finally:release.set()
    until(lambda:len(client.sent)==1)
    assert len(calls)==1


def test_ordinary_message_cannot_run_quick_setting_commands(bot):
    channel,tasks,client,calls=bot;channel.chat.groups.should_reply=lambda *a:True
    channel.content=lambda *a:pytest.fail('unmentioned group text must not execute a settings command')
    channel.dispatch(event('解绑角色'));until(lambda:len(client.sent)==1)
    assert calls[0][1]=='解绑角色'


def test_at_upgrade_preserves_explicit_commands_even_with_mention_markup(bot):
    channel,tasks,client,calls=bot;entered=threading.Event();release=threading.Event()
    def decide(*a):entered.set();release.wait(2);return False
    channel.chat.groups.should_reply=decide
    try:
        channel.dispatch(event('<@!bot> 新对话'));assert entered.wait(1)
        channel.dispatch(event('新对话',mentioned=True))
    finally:release.set()
    until(lambda:len(client.sent)==1)
    assert '已开启新对话' in client.sent[0][0][3] and not calls


def test_group_context_is_encrypted_room_and_bot_scoped_and_reaches_the_runner(bot):
    channel,tasks,client,calls=bot;groups=channel.chat.groups
    scope=lambda app,room,user:json.dumps([app,'groups',room,user])
    groups.record('a',scope('app','room','bob'),'刚才我们在讨论露营。')
    groups.record('b',scope('app','other','bob'),'其他群的机密背景')
    groups.record('c',scope('other-bot','room','bob'),'其他机器人的背景')
    with tasks.db() as db:
        assert '露营' not in db.execute("SELECT payload FROM qq_group_messages WHERE id='a'").fetchone()['payload']
    channel.chat.groups.should_reply=lambda *a:True
    channel.dispatch(event());until(lambda:len(client.sent)==1)
    history=json.dumps(calls[0][2],ensure_ascii=False)
    assert '露营' in history and '其他群的机密' not in history and '其他机器人的背景' not in history
    assert '不当作私聊记忆' in history


def test_semantic_decision_uses_context_and_only_mentions_mode_is_respected(bot,monkeypatch):
    channel,tasks,client,calls=bot;groups=channel.chat.groups
    captured=[]
    class Model:
        decision=True
        def __init__(self,**kwargs):self.chat=SimpleNamespace(completions=SimpleNamespace(create=self.create))
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def create(self,**kwargs):
            captured.append(kwargs)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({'reply':self.decision})))])
    groups.factory=Model
    scope=json.dumps(['app','groups','room','alice']);groups.record('one',scope,'刚才在讨论露营。')
    profile=CharacterProfile().model_dump()
    assert groups.should_reply('next',scope,'你觉得呢？',profile)
    assert json.loads(captured[-1]['messages'][1]['content'])['recent_group'][0]['text']=='刚才在讨论露营。'
    Model.decision=False
    assert not groups.should_reply('next',scope,'小王你来回答。',profile)
    Model.decision='true'
    assert not groups.should_reply('next',scope,'问题',profile)
    profile['groupReplyMode']='mentions';before=len(captured)
    assert not groups.should_reply('next',scope,'你好',profile) and len(captured)==before
    groups.record('at',scope,'你好',mentioned=True)
    assert groups.should_reply('at',scope,'你好',profile) and len(captured)==before


def test_bot_authors_and_non_text_full_events_are_ignored(bot):
    channel,tasks,client,calls=bot
    item=event();item['d']['author']['bot']=True;channel.dispatch(item)
    item=event();del item['d']['content'];channel.dispatch(item)
    assert not calls and not client.sent


def test_delayed_followup_keeps_question_and_delivered_answer_for_participation(bot):
    channel,tasks,client,calls=bot;groups=channel.chat.groups
    channel.dispatch(event('大肥鱼今天A股表现怎么样',mid='previous',mentioned=True))
    until(lambda:len(client.sent)==1)
    old=time.time()-25*60
    with tasks.db() as db:
        db.execute('UPDATE qq_group_messages SET created=?,replied_at=?',(old,old+120))
        db.execute('UPDATE qq_chat_jobs SET created=?',(old,))
        scope=db.execute('SELECT scope FROM qq_group_messages').fetchone()['scope']
    captured=[]
    class Model:
        def __init__(self,**kwargs):self.chat=SimpleNamespace(completions=SimpleNamespace(create=self.create))
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def create(self,**kwargs):
            captured.append(json.loads(kwargs['messages'][1]['content']))
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"reply":true}'))])
    groups.factory=Model
    assert groups.should_reply('next',scope,'那昨天美股表现呢',CharacterProfile().model_dump())
    recent=captured[-1]['recent_group']
    assert any(x['role']=='user' and 'A股' in x['text'] and x['speaker']==captured[-1]['current_speaker'] for x in recent)
    assert any(x['role']=='assistant' and '这样看' in x['text'] for x in recent)
    assert all(x['seconds_ago']>15*60 for x in recent)
    with tasks.db() as db:
        db.execute('INSERT INTO qq_chat_resets(scope,reset_at) VALUES(?,?)',(scope,time.time()))
    assert groups.should_reply('next',scope,'另一个话题',CharacterProfile().model_dump())
    assert captured[-1]['recent_group']==[]
    assert groups.context(scope,before=old+86401+120)==[]


def test_participation_retries_transient_provider_failure_without_forcing_a_reply(bot,monkeypatch):
    import httpx
    from openai import OpenAI
    channel,tasks,client,calls=bot
    attempts=[]
    def handle(request):
        attempts.append(request)
        if len(attempts)==1:
            return httpx.Response(503,json={'error':{'message':'temporarily unavailable'}})
        return httpx.Response(200,json={'id':'decision','object':'chat.completion','created':0,'model':'test',
            'choices':[{'index':0,'message':{'role':'assistant','content':'{"reply":false}'},'finish_reason':'stop'}]})
    settings=[]
    def factory(**kwargs):
        settings.append(kwargs)
        return OpenAI(**{**kwargs,'api_key':'test-key'},http_client=httpx.Client(transport=httpx.MockTransport(handle)))
    groups=channel.chat.groups;groups.factory=factory
    monkeypatch.setenv('DEEPSEEK_BASE_URL','')
    scope=json.dumps(['app','groups','room','alice'])
    assert not groups.should_reply('next',scope,'群员在和其他人聊天',CharacterProfile().model_dump())
    assert len(attempts)==2
    assert settings[0]['max_retries']==1
    assert settings[0]['base_url']=='https://api.deepseek.com'


def test_image_reaction_context_identifies_the_recipient_of_the_prior_bot_reply(bot):
    channel,tasks,client,calls=bot;groups=channel.chat.groups
    scope=json.dumps(['app','groups','room','alice']);event='prior-song'
    groups.record(event,scope,'唱首歌给我')
    ident=hashlib.sha256(event.encode()).hexdigest()
    with tasks.db() as db:
        db.execute("INSERT INTO qq_chat_jobs(id,scope,kind,target,message_id,question,state,created,answer,delivered) VALUES(?,?,'groups','room','mid','唱首歌给我','completed',?,?,1)",(ident,scope,time.time()-60,json.dumps({'interpretation':'唱给你听呀'})))
    seen=[]
    class Model:
        def __init__(self,**kw):self.chat=SimpleNamespace(completions=SimpleNamespace(create=self.create))
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def create(self,**kw):seen.append(kw);return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"reply":true}'))])
    groups.factory=Model
    image='[用户发来表情]\n[图片识别资料，仅供理解]\n柴犬表情\n[/图片识别资料]'
    assert groups.should_reply('image-reaction',scope,image,CharacterProfile().model_dump())
    state=json.loads(seen[-1]['messages'][1]['content'])
    assert state['has_image_observation'] and state['recent_bot_replied_to_current_speaker']
    assert any(x['role']=='assistant' and x['reply_to']==state['current_speaker'] for x in state['recent_group'])
    assert '不需要文字或问句' in seen[-1]['messages'][0]['content']
    with tasks.db() as db:
        row=db.execute('SELECT reply,source,reason FROM qq_group_decisions WHERE job_id=?',(hashlib.sha256(b'image-reaction').hexdigest(),)).fetchone()
    assert tuple(row)==(1,'model','reply')
