import json
from datetime import datetime
from types import SimpleNamespace

import pytest
from app.day_tasks import DayTasks
from app.character_settings import CharacterProfile,CharacterStore
from app.qq_chat import QQChat
from app.qq_companion import QQCompanion,TZ,scope_id
from app.qq_destinations import GroupDirectory,ProactiveTargets,enabled_for,room_scope
from app.qq_channel import QQChannel,QQClient

@pytest.fixture
def env(tmp_path):
    tasks=DayTasks(tmp_path,lambda *a:{})
    characters=CharacterStore(tasks)
    chat=QQChat(tasks,SimpleNamespace(),lambda *a:{})
    chat.pool.shutdown(wait=False);chat.groups.pool.shutdown(wait=False)
    now=datetime(2026,11,3,1,tzinfo=TZ).timestamp()
    private=json.dumps(['123456','users','alice','alice']);member=json.dumps(['123456','groups','room','alice'])
    with tasks.db() as db:
        db.executemany('INSERT INTO character_links VALUES(?,?)',[(s,'owner') for s in [private,member]])
        db.execute('INSERT INTO character_qq_connections VALUES(?,?,?,?,?)',('connection','owner','123456',tasks.cipher.encrypt(b'secret').decode(),now))
    directory=GroupDirectory(tasks);directory.note('123456','room',allowed=1,name='测试群')
    return SimpleNamespace(tasks=tasks,characters=characters,private=private,member=member,room=room_scope('123456','room'),directory=directory,now=now)


def test_only_selected_private_and_rooms_are_eligible_and_revocation_wins(env):
    e=env;p=CharacterProfile(proactivePrivate=False,proactiveGroups=[scope_id(e.room)]).model_dump()
    assert not enabled_for(p,e.private,e.tasks) and enabled_for(p,e.room,e.tasks)
    assert not enabled_for(p,e.member,e.tasks)
    assert not enabled_for(p,room_scope('123456','other'),e.tasks)
    e.directory.observe('123456','GROUP_MSG_REJECT',{'group_openid':'room'})
    assert not enabled_for(p,e.room,e.tasks)
    e.directory.observe('123456','GROUP_MSG_RECEIVE',{'group_openid':'room'})
    assert enabled_for(p,e.room,e.tasks)
    e.directory.observe('123456','GROUP_DEL_ROBOT',{'group_openid':'room'})
    assert not enabled_for(p,e.room,e.tasks)


def test_names_permissions_are_synced_and_owner_isolated(env,monkeypatch):
    e=env;calls=[]
    def details(target,part):
        calls.append((target,part));return {'group_name':'一起摸鱼群'} if part=='info' else {'allow_proactive_msg':True}
    service=ProactiveTargets(e.tasks,e.characters,client_factory=lambda **k:SimpleNamespace(group_details=details))
    monkeypatch.setattr(service.stop,'wait',lambda _:False)
    try:
        service.refresh('owner');data=service.listing('owner')
        assert data['groups'][0]['name']=='一起摸鱼群' and data['groups'][0]['permission']=='allowed'
        assert data['groups'][0]['id']==scope_id(e.room)
        assert service.listing('someone-else')['groups']==[]
        assert calls==[('room','info'),('room','bot_state')]
    finally:service.close()


def test_metadata_permission_failure_does_not_invent_name_or_permission(env,monkeypatch):
    e=env;e.directory.note('123456','room',name='',allowed=None)
    def fail(*a):raise RuntimeError('not whitelisted')
    service=ProactiveTargets(e.tasks,e.characters,client_factory=lambda **k:SimpleNamespace(group_details=fail))
    monkeypatch.setattr(service.stop,'wait',lambda _:False)
    try:
        service.refresh('owner');row=service.listing('owner')['groups'][0]
        assert not row['nameSynced'] and '待同步' in row['name'] and row['permission']=='unknown'
    finally:service.close()


def test_membership_events_discover_rooms_before_first_chat_without_cross_bot_leaks(env):
    e=env;e.directory.observe('123456','GROUP_ADD_ROBOT',{'group_openid':'new-room','group_name':'新群'})
    assert e.characters.owner_for_scope(room_scope('123456','new-room'))=='owner'
    assert e.characters.owner_for_scope(room_scope('999999','new-room')) is None
    service=ProactiveTargets(e.tasks,e.characters)
    try:assert len(service.listing('owner')['groups'])==2
    finally:service.close()


def test_planner_and_delivery_use_selected_destination_and_latest_setting(env,monkeypatch):
    e=env;sent=[];now=[e.now]
    profile=CharacterProfile(proactivity=90,proactivePrivate=False,proactiveGroups=[scope_id(e.room)])
    e.characters.save('owner',profile)
    service=QQCompanion(e.tasks,e.characters,lambda *a:{'interpretation':'大家好呀'},SimpleNamespace(decide=lambda *a:{'count':1,'slots':['morning']}),clock=lambda:now[0])
    monkeypatch.setattr(service.memory,'update',lambda *a,**kw:True)
    monkeypatch.setattr(service,'schedule_drafts',lambda *a:None)
    monkeypatch.setattr(QQClient,'proactive',lambda self,*a,**kw:sent.append(kw.get('kind','users')))
    try:
        service.plan(e.private,e.characters.get('owner'),now[0]);service.plan(e.room,e.characters.get('owner'),now[0])
        with e.tasks.db() as db:rows=[dict(r) for r in db.execute('SELECT * FROM qq_companion_outbox')]
        assert len(rows)==1 and rows[0]['scope']==e.room
        now[0]=rows[0]['due'];service.deliver(rows[0],now[0]);assert sent==['groups']
        # A change while the model is generating must cancel before posting.
        with e.tasks.db() as db:db.execute("INSERT INTO qq_companion_outbox(id,scope,day,due,state) VALUES('second',?,?,?,'planned')",(e.room,rows[0]['day'],now[0]))
        row={**rows[0],'id':'second'}
        def disable(*args):e.characters.save('owner',CharacterProfile(proactivity=90,proactivePrivate=False,proactiveGroups=[]));return {'interpretation':'大家好呀'}
        service.runner=disable;service.deliver(row,now[0]);assert sent==['groups']
    finally:service.close()


def test_read_metadata_and_group_proactive_use_official_paths_without_passive_reply_id(monkeypatch):
    calls=[];monkeypatch.setattr(QQClient,'token',lambda _:'fake')
    monkeypatch.setattr('app.qq_channel.requests.get',lambda url,**kw:(calls.append((url,kw)) or SimpleNamespace(status_code=200,json=lambda:{'group_name':'群'})))
    monkeypatch.setattr('app.qq_channel.requests.post',lambda url,**kw:(calls.append((url,kw)) or SimpleNamespace(status_code=200,json=lambda:{'id':'sent'})))
    c=QQClient();c.group_details('room','info');c.proactive('room','大家好',kind='groups')
    assert calls[0][0].endswith('/v2/groups/room/info')
    assert calls[1][1]['json']=={'msg_type':0,'content':'大家好'}
    assert calls[1][0].endswith('/v2/groups/room/messages')


def test_old_clients_do_not_silently_restore_disabled_destinations(env):
    e=env;e.characters.save('owner',CharacterProfile(proactivePrivate=False,proactiveGroups=[scope_id(e.room)]))
    saved=e.characters.save('owner',CharacterProfile(name='新名字'))
    assert saved['proactivePrivate'] is False and saved['proactiveGroups']==[scope_id(e.room)]


def test_group_metadata_refresh_cannot_override_a_newer_revoke_event(env,monkeypatch):
    e=env
    def details(target,part):
        if part=='bot_state':e.directory.observe('123456','GROUP_MSG_REJECT',{'group_openid':'room'})
        return {'group_name':'群'} if part=='info' else {'allow_proactive_msg':True}
    service=ProactiveTargets(e.tasks,e.characters,client_factory=lambda **k:SimpleNamespace(group_details=details))
    monkeypatch.setattr(service.stop,'wait',lambda _:False)
    try:
        service.refresh('owner');assert service.listing('owner')['groups'][0]['permission']=='denied'
    finally:service.close()
