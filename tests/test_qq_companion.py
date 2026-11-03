import json
import sys
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.day_tasks import DayTasks
from app.character_settings import CharacterStore, CharacterProfile, create_router
from app.qq_chat import QQChat
from app.qq_channel import QQClient
from app.qq_companion import CompanionMemory, QQCompanion, LocalProactiveDecision, TZ, scope_id


def stamp(day='2026-11-03',hour=1,minute=0):
    return datetime.fromisoformat(f'{day}T{hour:02}:{minute:02}:00').replace(tzinfo=TZ).timestamp()


@pytest.fixture
def env(tmp_path,monkeypatch):
    tasks=DayTasks(tmp_path,lambda *a:{})
    characters=CharacterStore(tasks)
    scope=json.dumps(['123456','users','alice','alice'])
    chat=QQChat(tasks,SimpleNamespace(),lambda *a:{})
    chat.pool.shutdown(wait=False)
    characters.save('owner',CharacterProfile(relationship='wife',proactivity=80))
    with tasks.db() as db:
        db.execute('INSERT INTO character_links VALUES(?,?)',(scope,'owner'))
        db.execute('INSERT INTO character_qq_connections VALUES(?,?,?,?,?)',('connection','owner','123456',tasks.cipher.encrypt(b'fake-secret').decode(),stamp()))
    now=[stamp()];sent=[]
    def runner(scope,prompt,history):
        return {'interpretation':'{"facts":[]}' if scope.endswith(':memory') else '今天也记得给自己留一点休息时间呀。'}
    service=QQCompanion(tasks,characters,runner,SimpleNamespace(decide=lambda *args:{'count':3,'slots':['morning','afternoon','night']}),clock=lambda:now[0])
    monkeypatch.setattr(QQClient,'proactive',lambda self,target,body:sent.append((target,body)))
    yield SimpleNamespace(tasks=tasks,characters=characters,scope=scope,service=service,now=now,sent=sent)
    service.close()


def add_chat(e,ident='turn',question='我每天喜欢喝咖啡',created=None,scope=None):
    with e.tasks.db() as db:
        db.execute("INSERT INTO qq_chat_jobs(id,scope,kind,target,message_id,question,state,created,answer,delivered) VALUES(?,?,'users','alice','mid',?,'completed',?,?,1)",
                   (ident,scope or e.scope,question,created or stamp(hour=0),json.dumps({'interpretation':'好的'})))


def outbox(e):
    with e.tasks.db() as db:return [dict(r) for r in db.execute('SELECT * FROM qq_companion_outbox ORDER BY due')]


def test_plan_is_idempotent_and_sent_only_once_inside_window(env):
    e=env;s=e.service
    s.plan(e.scope,e.characters.get('owner'),e.now[0]);s.plan(e.scope,e.characters.get('owner'),e.now[0])
    rows=outbox(e);assert len(rows)==3
    for row in rows:
        e.now[0]=row['due'];s.deliver(row,e.now[0]);s.deliver(row,e.now[0])
    assert len(e.sent)==3 and all(r['state']=='sent' for r in outbox(e))
    assert s.memory.snapshot('owner',e.now[0])['recipients'][0]['sentToday']==3
    assert s.memory.snapshot('someone-else',e.now[0])['recipients']==[]


def test_disabling_or_late_delivery_cancels_and_never_sends(env):
    e=env;s=e.service;s.plan(e.scope,e.characters.get('owner'),e.now[0]);rows=outbox(e)
    e.characters.save('owner',CharacterProfile(proactivity=0));e.now[0]=rows[0]['due'];s.deliver(rows[0],e.now[0])
    assert outbox(e)[0]['state']=='cancelled'
    e.characters.save('owner',CharacterProfile(proactivity=100));e.now[0]=stamp(hour=22)
    s.deliver(rows[1],e.now[0]);assert outbox(e)[1]['state']=='expired';assert not e.sent


def test_generation_crossing_cutoff_never_sends(env):
    e=env;s=e.service;s.plan(e.scope,e.characters.get('owner'),e.now[0]);row=outbox(e)[-1]
    e.now[0]=row['due']
    def slow(*args):e.now[0]=stamp(hour=21,minute=1);return {'interpretation':'你好呀'}
    s.runner=slow;s.deliver(row,row['due']);assert not e.sent;assert outbox(e)[-1]['state']=='cancelled'


def test_failure_cancels_other_planned_messages_and_no_retry(env,monkeypatch):
    e=env;s=e.service;s.plan(e.scope,e.characters.get('owner'),e.now[0]);row=outbox(e)[0];e.now[0]=row['due']
    def fail(*a):raise RuntimeError('QQ user disallowed proactive messages')
    monkeypatch.setattr(QQClient,'proactive',fail)
    s.deliver(row,e.now[0]);s.deliver(row,e.now[0])
    assert [r['state'] for r in outbox(e)]==['failed','cancelled','cancelled']


def test_first_install_waits_until_next_1am_and_offline_jev_retries(env):
    e=env;s=e.service
    with e.tasks.db() as db:db.execute("UPDATE qq_companion_meta SET value=? WHERE key='installed'",(str(stamp(hour=14)),))
    e.now[0]=stamp(hour=15);s.tick();assert outbox(e)==[]
    e.now[0]=stamp('2026-11-04')
    calls=[]
    def fail(*a):calls.append(1);raise RuntimeError('Mac offline')
    s.decider=SimpleNamespace(decide=fail)
    s.tick();s.tick();assert len(calls)==1 and outbox(e)==[]
    e.now[0]+=901;s.tick();assert len(calls)==2


def test_hard_daily_attempt_limit_even_for_extra_outbox_rows(env):
    e=env;s=e.service;s.plan(e.scope,e.characters.get('owner'),e.now[0]);rows=outbox(e)
    with e.tasks.db() as db:db.execute("UPDATE qq_companion_outbox SET attempted=1,state='sent'")
    extra={**rows[0],'id':'extra','due':stamp(hour=20)}
    with e.tasks.db() as db:db.execute("INSERT INTO qq_companion_outbox(id,scope,day,due,state) VALUES(?,?,?,?,'planned')",(extra['id'],extra['scope'],extra['day'],extra['due']))
    e.now[0]=extra['due'];s.deliver(extra,e.now[0]);assert not e.sent
    with e.tasks.db() as db:assert db.execute("SELECT state FROM qq_companion_outbox WHERE id='extra'").fetchone()[0]=='limited'


def test_restart_does_not_repeat_uncertain_delivery(env,monkeypatch):
    e=env;s=e.service;s.plan(e.scope,e.characters.get('owner'),e.now[0]);row=outbox(e)[0]
    with e.tasks.db() as db:db.execute("UPDATE qq_companion_outbox SET state='sending',attempted=? WHERE id=?",(row['due'],row['id']))
    monkeypatch.setattr(s,'loop',lambda:None);s.start();s.thread.join()
    assert outbox(e)[0]['state']=='unknown';e.now[0]=row['due'];s.deliver(row,e.now[0]);assert not e.sent


def test_memory_evidence_is_private_encrypted_and_clear_wins(env):
    e=env;m=e.service.memory;add_chat(e)
    facts=[{'text':'喜欢咖啡','label':'咖啡','sourceId':'turn','quote':'喜欢喝咖啡'},
           {'text':'喜欢旅行','label':'旅行','sourceId':'missing','quote':'喜欢旅行'},
           {'text':'密码123','label':'密码','sourceId':'turn','quote':'喜欢喝咖啡'}]
    runner=lambda *args:{'interpretation':json.dumps({'facts':facts},ensure_ascii=False)}
    assert m.update(e.scope,runner)
    assert [f['label'] for f in m.get(e.scope)['facts']]==['咖啡']
    assert '咖啡' in m.context(e.scope)
    with e.tasks.db() as db:assert '咖啡' not in db.execute('SELECT payload FROM qq_companion_memory').fetchone()[0]
    before=m.intimacy(e.scope)['score'];add_chat(e,'next',created=stamp(hour=0)+10)
    assert m.intimacy(e.scope)['score']>=before
    def concurrent_clear(*args):m.clear(e.scope);return runner()
    assert m.update(e.scope,concurrent_clear,force=True) is False
    assert m.get(e.scope)['facts']==[]


def test_owner_only_memory_api_and_no_group_aggregation(env):
    e=env;app=FastAPI();app.include_router(create_router(e.characters));a=TestClient(app);b=TestClient(app)
    a.get('/api/character/companion')
    # identity uses its established private namespace; obtain the persisted owner from a profile write.
    a.put('/api/character',json=CharacterProfile().model_dump(),headers={'X-Veya-Day':'1'})
    with e.tasks.db() as db:
        owner=db.execute("SELECT owner FROM character_profiles WHERE owner!='owner'").fetchone()[0]
        db.execute('UPDATE character_links SET owner=? WHERE scope=?',(owner,e.scope))
        db.execute('INSERT INTO character_links VALUES(?,?)',(json.dumps(['123456','groups','group','alice']),owner))
    assert len(a.get('/api/character/companion').json()['recipients'])==1
    assert b.get('/api/character/companion').json()['recipients']==[]
    path='/api/character/companion/'+scope_id(e.scope)+'/memory'
    assert a.delete(path).status_code==403
    assert b.delete(path,headers={'X-Veya-Day':'1'}).status_code==404
    assert a.delete(path,headers={'X-Veya-Day':'1'}).status_code==200


def test_local_decision_increases_count_probability_with_intimacy_and_proactivity(monkeypatch):
    class Client:
        def __init__(self,**kw):pass
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def system_one(self,**kw):return SimpleNamespace(answers={'fit':SimpleNamespace(probabilities={'match':.5})})
    monkeypatch.setitem(sys.modules,'app.laya_client',SimpleNamespace(LocalLayaClient=Client,Choice=lambda **kw:SimpleNamespace(**kw)))
    monkeypatch.setenv('LAYA_DECISION_URL','http://localhost/predict')
    d=LocalProactiveDecision(draw=lambda:.5);p=CharacterProfile(proactivity=10).model_dump()
    low=d.decide(p,{'score':0},{'facts':[]},{'morning':1,'afternoon':2,'night':3})
    p['proactivity']=90;high=d.decide(p,{'score':100},{'facts':[]},{'morning':1,'afternoon':2,'night':3})
    mean=lambda x:sum(n*v for n,v in x['probabilities'].items())
    assert mean(high)>mean(low) and high['count']<=3
    assert high['source']=='local-jev-laya'


def test_official_proactive_payload_omits_reply_ids(monkeypatch):
    calls=[]
    monkeypatch.setattr(QQClient,'token',lambda self:'fake')
    monkeypatch.setattr('app.qq_channel.requests.post',lambda *a,**kw:(calls.append((a,kw)) or SimpleNamespace(status_code=200,json=lambda:{'id':'sent'})))
    QQClient().proactive('alice','你好呀')
    assert calls[0][1]['json']=={'msg_type':0,'content':'你好呀'}
    assert calls[0][0][0].endswith('/v2/users/alice/messages')


def test_proactive_voice_respects_preference_without_text_supplement(env,monkeypatch):
    from app.qq_voice import QQVoice
    e=env;s=e.service;e.characters.save('owner',CharacterProfile(responseMode='voice',proactivity=80))
    voices=[]
    monkeypatch.setattr(QQVoice,'enabled',lambda *a:True)
    def send(self,job,text,**kwargs):
        assert kwargs['proactive'] and kwargs['before_send']()
        voices.append(text);return True
    monkeypatch.setattr(QQVoice,'send',send)
    s.plan(e.scope,e.characters.get('owner'),e.now[0]);row=outbox(e)[0];e.now[0]=row['due'];s.deliver(row,e.now[0])
    assert len(voices)==1 and not e.sent and outbox(e)[0]['state']=='sent'


def test_proactive_media_has_no_reply_or_wakeup_fields(monkeypatch):
    payloads=[]
    monkeypatch.setattr(QQClient,'token',lambda self:'fake')
    def post(url,**kwargs):
        payloads.append(kwargs['json'])
        return SimpleNamespace(status_code=200,json=lambda:{'file_info':'media','id':'sent'})
    monkeypatch.setattr('app.qq_channel.requests.post',post)
    QQClient().proactive_media('alice','https://example.com/voice.silk')
    assert payloads[-1]=={'msg_type':7,'content':' ','media':{'file_info':'media'}}


def test_unlink_or_memory_clear_during_generation_prevents_send(env):
    e=env;s=e.service;s.plan(e.scope,e.characters.get('owner'),e.now[0]);row=outbox(e)[0];e.now[0]=row['due']
    def clearing(*args):s.memory.clear(e.scope);return {'interpretation':'你好呀'}
    s.runner=clearing;s.deliver(row,e.now[0]);assert not e.sent


def test_group_chats_do_not_enter_private_memory_worker(env,monkeypatch):
    e=env;group=json.dumps(['123456','groups','group','alice'])
    with e.tasks.db() as db:db.execute('INSERT INTO character_links VALUES(?,?)',(group,'owner'))
    monkeypatch.setattr(e.service.pool,'submit',lambda *a:pytest.fail('group memory must remain separate from private user memory'))
    e.service.observe(group)


def test_existing_authenticated_private_chats_attach_to_configured_bot_only(env):
    e=env;add_chat(e)
    other=json.dumps(['999999','users','bob','bob']);add_chat(e,'other-bot',scope=other)
    group=json.dumps(['123456','groups','group','alice']);add_chat(e,'group',scope=group)
    with e.tasks.db() as db:db.execute('DELETE FROM character_links')
    e.characters.qq.attach_history('owner')
    assert e.characters.owner_for_scope(e.scope)=='owner'
    assert e.characters.owner_for_scope(other) is None
    assert e.characters.owner_for_scope(group) is None


def test_prepared_topics_are_private_encrypted_and_used_at_delivery(env):
    e=env;s=e.service;s.plan(e.scope,e.characters.get('owner'),e.now[0]);rows=outbox(e)
    questions={r['id']:{'id':r['id'],'topic':'休息安排','question':'今天想给自己留一点休息时间吗？'} for r in rows}
    calls=[]
    def runner(scope,prompt,history):
        calls.append(prompt)
        return {'interpretation':json.dumps({'plans':list(questions.values())},ensure_ascii=False)}
    s.runner=runner;s.prepare_drafts(e.scope,'2026-11-03')
    visible=s.memory.snapshot('owner',e.now[0])['recipients'][0]['today']
    assert len(visible)==3 and all(r['question']=='今天想给自己留一点休息时间吗？' for r in visible)
    assert all(r['topic']=='休息安排' for r in visible)
    assert s.memory.snapshot('other',e.now[0])['recipients']==[]
    with e.tasks.db() as db:
        assert '休息安排' not in db.execute('SELECT decision FROM qq_companion_plans').fetchone()[0]
    s.runner=lambda scope,prompt,history:(calls.append(prompt) or {'interpretation':'今天想歇一会儿吗？'})
    e.now[0]=rows[0]['due'];s.deliver(rows[0],e.now[0])
    assert '今天想给自己留一点休息时间吗？' in calls[-1]
    assert s.memory.snapshot('owner',e.now[0])['recipients'][0]['today'][0]['message']=='今天想歇一会儿吗？'


def test_clearing_memory_during_topic_generation_cannot_restore_private_drafts(env):
    e=env;s=e.service;s.plan(e.scope,e.characters.get('owner'),e.now[0]);rows=outbox(e)
    def runner(*args):
        s.memory.clear(e.scope)
        return {'interpretation':json.dumps({'plans':[{'id':r['id'],'topic':'私人偏好','question':'私人问题？'} for r in rows]})}
    s.runner=runner;s.prepare_drafts(e.scope,'2026-11-03')
    assert all(not r['question'] for r in s.memory.snapshot('owner',e.now[0])['recipients'][0]['today'])
    assert all(r['state']=='cancelled' for r in outbox(e))


def test_invalid_topic_plan_does_not_change_existing_schedule(env):
    e=env;s=e.service;s.plan(e.scope,e.characters.get('owner'),e.now[0]);before=outbox(e)
    s.runner=lambda *a:{'interpretation':'{"plans":[{"id":"unknown","topic":"x","question":"x"}]}'}
    with pytest.raises(ValueError):s.prepare_drafts(e.scope,'2026-11-03')
    assert outbox(e)==before
    assert all(not r['question'] for r in s.memory.snapshot('owner',e.now[0])['recipients'][0]['today'])
