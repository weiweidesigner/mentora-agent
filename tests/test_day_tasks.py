from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.day_tasks import DayTasks, TaskInput, create_router, market_state, next_occurrence

UTC = dt.timezone.utc

def moment(value):
    return dt.datetime.fromisoformat(value).astimezone(UTC)


def config(**changes):
    return TaskInput(title='每日研究', question='分析{{market}}', **changes).model_dump()


@pytest.fixture
def service(tmp_path):
    return DayTasks(tmp_path, lambda c, r: {'interpretation': '真实数据应由既有研究引擎提供', 'reportArtifacts': []})


@pytest.fixture
def client(service):
    app = FastAPI()
    app.include_router(create_router(service))
    return TestClient(app)


def create(client, **changes):
    client.get('/api/day/tasks')
    return client.post('/api/day/tasks', json=config(**changes), headers={'X-Veya-Day':'1'})


def test_execution_preferences_validated_and_durable(client, service):
    assert client.get('/api/day/execution-preferences').json() == {'reasoningEffort': None}
    assert client.put('/api/day/execution-preferences', json={'reasoningEffort':'ultra'}).status_code == 403
    assert client.put('/api/day/execution-preferences', json={'reasoningEffort':'invalid'}, headers={'X-Veya-Day':'1'}).status_code == 422
    response = client.put('/api/day/execution-preferences', json={'reasoningEffort':'ultra'}, headers={'X-Veya-Day':'1'})
    assert response.status_code == 200
    reopened = DayTasks(service.directory, service.runner)
    assert reopened.execution_preferences() == {'reasoningEffort':'ultra'}


def test_existing_tasks_use_latest_effort_at_execution_and_snapshot_it(client, service):
    from app.day_presets import SCENE_OWNER
    captured = []
    service.runner = lambda values, run_id: (captured.append(values) or {'interpretation':'done'})
    for owner in ('alice', SCENE_OWNER):
        task = service.save(owner, TaskInput(**config(enabled=False)))
        with service.db() as db:
            service.enqueue(db, service.owned(db, owner, task['id']))
        run = service.claim()
        client.put('/api/day/execution-preferences', json={'reasoningEffort':'ultra'}, headers={'X-Veya-Day':'1'})
        service.execute(run)
        assert captured[-1]['reasoningEffort'] == 'ultra'
        client.put('/api/day/execution-preferences', json={'reasoningEffort':'low'}, headers={'X-Veya-Day':'1'})
        with service.db() as db:
            snapshot = db.execute('SELECT config FROM runs WHERE id=?', (run['id'],)).fetchone()
        assert service.unpack(snapshot['config'])['reasoningEffort'] == 'ultra'


def test_cn_holiday_is_skipped():
    value = next_occurrence(config(), moment('2026-09-30T02:00:00+00:00'))
    assert value.startswith('2026-10-08T01:00:00')


@pytest.mark.parametrize('handled', [False, True])
def test_run_handlers_dispatch_in_order_and_fall_back_only_if_unhandled(service, handled):
    calls = []
    task = service.save('alice', TaskInput(**config(enabled=False)))
    with service.db() as db:
        service.enqueue(db, service.owned(db, 'alice', task['id']))
    run = service.claim()
    service.runner = lambda values, run_id: (calls.append('runner') or {'interpretation': 'fallback'})
    def first(actual_run, values):
        assert actual_run['id'] == run['id']
        assert values['_owner'] == 'alice'
        assert callable(values['_emit_event'])
        calls.append('first')
    def second(actual_run, values):
        calls.append('second')
        return {'interpretation': 'handled'} if handled else None
    service.run_handlers.extend([first, second, lambda *args: calls.append('third')])
    service.execute(run)
    assert calls == (['first', 'second'] if handled else ['first', 'second', 'third', 'runner'])
    with service.db() as db:
        saved = db.execute('SELECT status,answer FROM runs WHERE id=?', (run['id'],)).fetchone()
    assert saved['status'] == 'success'
    assert json.loads(saved['answer'])['interpretation'] == ('handled' if handled else 'fallback')


@pytest.mark.parametrize('invalid_result', [False, True])
def test_handler_failure_does_not_run_fallback_or_save_success(service, invalid_result):
    task = service.save('alice', TaskInput(**config(enabled=False)))
    with service.db() as db:
        service.enqueue(db, service.owned(db, 'alice', task['id']))
    run = service.claim()
    def fail(*args):
        if invalid_result:
            return {}
        raise RuntimeError('handler failed')
    service.run_handlers.append(fail)
    service.runner = lambda *args: pytest.fail('A handled failure must not run generic research')
    service.execute(run)
    with service.db() as db:
        saved = db.execute('SELECT status FROM runs WHERE id=?', (run['id'],)).fetchone()
        pending = db.execute('SELECT active_run FROM tasks WHERE id=?', (task['id'],)).fetchone()
    assert saved['status'] == 'failed'
    assert pending['active_run'] is None


def test_run_handler_registry_is_instance_local(service, tmp_path):
    service.run_handlers.append(lambda *args: None)
    other = DayTasks(tmp_path / 'other', service.runner)
    assert other.run_handlers == []


def test_replayed_task_events_carry_original_start_and_final_elapsed(client,service):
    task=create(client,enabled=False).json()
    run=client.post('/api/day/tasks/'+task['id']+'/run',headers={'X-Veya-Day':'1'}).json()['runId']
    service.record_event(run,'status',{'message':'working'})
    service.record_event(run,'final',{'interpretation':'done'})
    with service.db() as db:
        db.execute("UPDATE runs SET status='success',created=?,finished=? WHERE id=?",('2026-10-21T03:00:00+00:00','2026-10-21T03:20:00+00:00',run))
    response=client.get('/api/day/tasks/'+task['id']+'/runs/'+run+'/events')
    events=[json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    assert events[0]['runStartedAt']=='2026-10-21T03:00:00+00:00'
    assert events[1]['thinkingElapsed']==20*60*1000


def test_us_fixed_market_time_follows_dst():
    c = config(market='US', time='09:00')
    assert next_occurrence(c, moment('2026-03-06T15:00:00Z')).startswith('2026-03-09T13:00:00')
    assert next_occurrence(c, moment('2026-10-30T15:00:00Z')).startswith('2026-11-02T14:00:00')


def test_us_early_close_relative_time():
    c = {**config(market='US'), 'timeMode':'close', 'offset':15}  # Legacy stored schedule
    assert next_occurrence(c, moment('2026-11-27T10:00:00Z')).startswith('2026-11-27T18:15:00')


def test_beijing_time_checks_us_exchange_date():
    c = config(market='US', timezone='Asia/Shanghai', time='05:00')
    # Saturday Beijing 05:00 is still the Friday US session.
    assert next_occurrence(c, moment('2026-10-16T12:00:00Z')).startswith('2026-10-16T21:00:00')


@pytest.mark.parametrize('market,value,status',[
    ('CN','2026-10-15T04:00:00Z','午间休市'),
    ('HK','2026-10-15T04:30:00Z','午间休市'),
    ('CN','2026-10-01T02:00:00Z','今日休市'),
    ('US','2026-11-27T18:30:00Z','已收盘'),
])
def test_market_phase(market, value, status):
    assert market_state(market, moment(value))['status'] == status


def test_once_and_paused():
    c = config(cadence='once', date='2026-10-15')
    assert next_occurrence(c, moment('2026-10-15T02:00:00Z')) is None
    assert next_occurrence(config(enabled=False), moment('2026-10-15T02:00:00Z')) is None


def test_owner_isolation_and_write_header(client, service):
    task = create(client).json()
    assert client.put('/api/day/tasks/' + task['id'], json=config()).status_code == 403
    other = TestClient(client.app)
    assert other.get('/api/day/tasks').json()['tasks'] == []
    assert other.post('/api/day/tasks/' + task['id'] + '/run', headers={'X-Veya-Day':'1'}).status_code == 404
    assert other.get('/api/day/tasks/' + task['id'] + '/result').status_code == 404


def test_webhook_secrets_are_encrypted_and_not_returned(client, service):
    task = create(client, feishu=True, feishuUrl='https://open.feishu.cn/open-apis/bot/v2/hook/secret-url',feishuSecret='sign-secret').json()
    assert task['feishuUrlConfigured'] is True
    assert 'feishuUrl' not in task and 'sign-secret' not in json.dumps(task)
    assert b'secret-url' not in service.db_path.read_bytes()
    updated = client.put('/api/day/tasks/' + task['id'], json={**task,'title':'new'},headers={'X-Veya-Day':'1'}).json()
    assert updated['feishuUrlConfigured'] is True
    assert client.put('/api/day/tasks/' + task['id'], json={**updated,'feishu':False},headers={'X-Veya-Day':'1'}).json()['feishuUrlConfigured'] is False


@pytest.mark.parametrize('changes',[
    {'feishu':True},
    {'feishuUrl':'https://127.0.0.1/x'},
    {'feishuUrl':'https://open.feishu.cn:444/open-apis/bot/v2/hook/test'},
    {'wecomUrl':'https://qyapi.weixin.qq.com:443/cgi-bin/webhook/send?key=x'},
    {'time':'25:00'},
    {'wecomUrl':'https://qyapi.weixin.qq.com/cgi-bin/webhook/send'},
    {'browser':True},
    {'serverchan':True},
    {'serverchanKey':'https://evil.example/key'},
    {'title':' '},
])
def test_invalid_configuration_rejected(client, changes):
    response=client.post('/api/day/tasks',json={**config(),**changes},headers={'X-Veya-Day':'1'})
    assert response.status_code in (400,422)


def test_task_agent_defaults_validates_and_reaches_execution(service):
    assert TaskInput(**config()).agent == 'mentora'
    with pytest.raises(ValueError):
        TaskInput(**config(agent='unknown-agent'))
    captured=[]
    service.runner=lambda values,run_id:(captured.append(values) or {'interpretation':'agent routed'})
    task=service.save('alice',TaskInput(**config(agent='mentora-deal',enabled=False)))
    with service.db() as db:
        service.enqueue(db,service.owned(db,'alice',task['id']))
    service.execute(service.claim())
    assert captured[0]['agent']=='mentora-deal'
    assert captured[0]['_owner']=='alice'
    assert service.list('alice')[0]['agent']=='mentora-deal'


def test_concurrent_claim_only_one_worker_executes(service):
    t = service.save('alice', TaskInput(**config(enabled=False)))
    with service.db() as db:
        service.enqueue(db, service.owned(db,'alice',t['id']))
    with ThreadPoolExecutor(max_workers=4) as pool:
        claims=list(pool.map(lambda _: service.claim(),range(4)))
    assert len([r for r in claims if r]) == 1


def test_failure_preserves_latest_result_and_replacement_survives_restart(service):
    t = service.save('alice', TaskInput(**config(enabled=False)))
    def run():
        with service.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row=service.owned(db,'alice',t['id'])
            service.enqueue(db,row,automatic=True)
        service.execute(service.claim())
    run()
    first = service.list('alice')[0]
    service.runner=lambda c,r: (_ for _ in ()).throw(RuntimeError('private credential error'))
    run()
    second=service.list('alice')[0]
    assert second['resultVersion'] == first['resultVersion']
    assert second['lastRun']['status'] == 'failed'
    assert 'credential' not in json.dumps(second)
    service.runner=lambda c,r: {'interpretation':'new answer'}
    run()
    restarted=DayTasks(service.directory,service.runner)
    assert restarted.list('alice')[0]['summary'] == 'new answer'
    assert restarted.list('alice')[0]['resultVersion'] != first['resultVersion']


def test_tick_deduplicates_occurrence_and_skips_old_backlog(service):
    t=service.save('alice',TaskInput(**config()))
    with service.db() as db:
        db.execute('UPDATE tasks SET next_at=? WHERE id=?',('2026-10-15T01:00:00+00:00',t['id']))
    service.tick(moment('2026-10-15T01:00:15Z'))
    service.tick(moment('2026-10-15T01:00:25Z'))
    with service.db() as db:
        assert db.execute('SELECT count(*) FROM runs').fetchone()[0] == 1
        assert service.owned(db,'alice',t['id'])['next_at'].startswith('2026-10-16')
    old=service.save('bob',TaskInput(**config()))
    with service.db() as db:
        db.execute('UPDATE tasks SET next_at=? WHERE id=?',('2026-10-14T01:00:00+00:00',old['id']))
    service.tick(moment('2026-10-15T02:00:00Z'))
    assert service.list('bob')[0]['activeRun'] is None


def test_one_time_is_disabled_only_after_automatic_execution(service):
    t=service.save('alice',TaskInput(**config(cadence='once',date='2099-01-01')))
    with service.db() as db:
        service.enqueue(db,service.owned(db,'alice',t['id']))
    assert service.list('alice')[0]['enabled'] is True


def test_share_capability_and_soft_delete(client,service):
    t=create(client,enabled=False).json()
    client.post('/api/day/tasks/'+t['id']+'/run',headers={'X-Veya-Day':'1'})
    service.execute(service.claim())
    with service.db() as db:
        token=db.execute('SELECT token FROM result_links WHERE task_id=?',(t['id'],)).fetchone()['token']
    other=TestClient(client.app)
    assert other.get('/api/day/shared/'+token).json()['answer']['interpretation']
    assert other.get('/api/day/shared/wrong-token').status_code == 404
    assert client.delete('/api/day/tasks/'+t['id'],headers={'X-Veya-Day':'1'}).status_code == 200
    assert other.get('/api/day/shared/'+token).status_code == 404


def test_notification_retry_never_reruns_analysis(service):
    t=service.save('alice',TaskInput(**config(enabled=False,wecom=True,wecomUrl='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test')))
    with service.db() as db:
        service.enqueue(db,service.owned(db,'alice',t['id']))
    service.execute(service.claim())
    calls=[]
    service.send=lambda d,r: (calls.append(d['channel']), (_ for _ in ()).throw(RuntimeError('failure')))[1]
    service.deliver()
    with service.db() as db:
        row=db.execute('SELECT * FROM deliveries').fetchone()
        assert row['status']=='pending' and row['attempts']==1
        assert db.execute('SELECT count(*) FROM runs').fetchone()[0]==1
    assert service.list('alice')[0]['lastRun']['status']=='success'


def test_subscription_rejects_internal_endpoints(client):
    client.get('/api/day/tasks')
    assert client.post('/api/day/subscriptions',json={'endpoint':'https://127.0.0.1/private','keys':{'p256dh':'x','auth':'y'}},headers={'X-Veya-Day':'1'}).status_code==400


def test_serverchan_secret_and_official_delivery(service, monkeypatch):
    t=service.save('alice',TaskInput(**config(enabled=False,serverchan=True,serverchanKey='SCT12345secret')))
    assert t['serverchanKeyConfigured'] and 'serverchanKey' not in t
    with service.db() as db:
        service.enqueue(db,service.owned(db,'alice',t['id']))
    service.execute(service.claim())
    calls=[]
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'code':0}
    monkeypatch.setattr('app.day_tasks.requests.post',lambda url,**kwargs:(calls.append((url,kwargs)),Response())[1])
    service.deliver()
    assert calls[0][0]=='https://sctapi.ftqq.com/SCT12345secret.send'
    assert '/mentora/?dayShare=' in calls[0][1]['data']['desp']
    assert calls[0][1]['allow_redirects'] is False
    assert service.list('alice')[0]['notifications'][0]['status']=='sent'


def test_cached_view_uses_the_original_resolved_question(client, service):
    task = create(client, enabled=False).json()
    service.runner = lambda c,r: {'question':'分析A股', 'interpretation':'缓存答案'}
    client.post('/api/day/tasks/'+task['id']+'/run', headers={'X-Veya-Day':'1'})
    service.execute(service.claim())
    assert client.get('/api/day/tasks/'+task['id']+'/result').json()['question'] == '分析A股'
    with service.db() as db:
        token = db.execute('SELECT token FROM result_links WHERE task_id=?',(task['id'],)).fetchone()['token']
    assert TestClient(client.app).get('/api/day/shared/'+token).json()['question'] == '分析A股'


def test_weekly_monthly_and_end_date_schedule():
    assert next_occurrence(config(cadence='weekly',weekdays=[4]),moment('2026-10-15T02:00:00Z')).startswith('2026-10-16T01:00:00')
    assert next_occurrence(config(cadence='monthly',monthDay=31),moment('2026-01-31T02:00:00Z')).startswith('2026-03-31T01:00:00')
    assert next_occurrence(config(cadence='daily',endDate='2026-10-15'),moment('2026-10-15T02:00:00Z')) is None


def test_run_history_is_owned_and_keeps_recent_conversations(client,service):
    task=create(client,enabled=False).json()
    for text in ['first saved answer','second saved answer']:
        service.runner=lambda c,r,text=text:{'question':'resolved question','interpretation':text}
        with service.db() as db:
            owner=db.execute('SELECT owner FROM tasks WHERE id=?',(task['id'],)).fetchone()['owner']
            service.enqueue(db,service.owned(db,owner,task['id']),automatic=True)
        service.execute(service.claim())
    service.prune()
    response=client.get('/api/day/tasks/'+task['id']+'/runs');assert response.status_code==200
    runs=response.json()['runs'];assert len(runs)==2 and all(r['available'] for r in runs)
    assert all('config' not in r and 'owner' not in r for r in runs)
    result=client.get('/api/day/tasks/'+task['id']+'/runs/'+runs[-1]['id']);assert result.json()['answer']['interpretation']=='first saved answer'
    other=TestClient(client.app)
    assert other.get('/api/day/tasks/'+task['id']+'/runs').status_code==404
    assert other.get('/api/day/tasks/'+task['id']+'/runs/'+runs[0]['id']).status_code==404


def test_run_conversation_is_saved_on_server_and_owner_isolated(client, service):
    task=create(client,enabled=False).json()
    service.runner=lambda c,r:{'question':'分析A股','interpretation':'初始报告'}
    client.post('/api/day/tasks/'+task['id']+'/run',headers={'X-Veya-Day':'1'})
    service.execute(service.claim())
    run_id=client.get('/api/day/tasks/'+task['id']+'/runs').json()['runs'][0]['id']
    messages=[
        {'role':'user','text':'进一步解释量能'},
        {'role':'assistant','text':'量能尚未确认','answer':{'interpretation':'量能尚未确认'}},
    ]
    saved=client.put('/api/day/tasks/'+task['id']+'/runs/'+run_id+'/conversation',json={'messages':messages},headers={'X-Veya-Day':'1'})
    assert saved.status_code==200 and saved.json()['count']==2
    result=client.get('/api/day/tasks/'+task['id']+'/runs/'+run_id).json()
    assert result['conversation']==messages
    other=TestClient(client.app)
    assert other.get('/api/day/tasks/'+task['id']+'/runs/'+run_id).status_code==404


def test_context_reuse_is_opt_in_and_uses_only_own_previous_success(service):
    t=service.save('alice',TaskInput(**config(enabled=False,newChat=False)))
    captured=[]
    def runner(c,r):
        captured.append(c.get('_history', []))
        return {'question':'resolved question','interpretation':'previous evidence'}
    service.runner=runner
    for _ in range(2):
        with service.db() as db:
            service.enqueue(db,service.owned(db,'alice',t['id']),automatic=True)
        service.execute(service.claim())
    assert captured[0]==[]
    assert captured[1][0]['text']=='resolved question'
    assert captured[1][1]['text']=='previous evidence'


def test_weekday_custom_and_additional_timezone_schedule():
    assert next_occurrence(config(cadence='weekdays',timezone='Asia/Tokyo',time='09:00'),moment('2026-10-16T01:00:00Z')).startswith('2026-10-19T00:00:00')
    assert next_occurrence(config(cadence='custom',weekdays=[0,2],timezone='Asia/Tokyo',time='09:00'),moment('2026-10-14T01:00:00Z')).startswith('2026-10-19T00:00:00')
    TaskInput(**config(timezone='America/Los_Angeles'))
    with pytest.raises(ValueError):
        TaskInput(**config(timezone='Not/A_Timezone'))


def window_config(**changes):
    return config(stage='live',triggerMode='window',windowStart='09:30',windowEnd='15:00',**changes)


def test_window_skips_lunch_end_boundary_and_holiday():
    c=window_config(intervalMinutes=30)
    assert next_occurrence(c,moment('2026-10-21T03:00:00Z')).startswith('2026-10-21T05:00:00')
    assert next_occurrence(c,moment('2026-10-21T06:30:00Z')).startswith('2026-10-22T01:30:00')
    assert next_occurrence(c,moment('2026-09-30T07:00:00Z')).startswith('2026-10-08T01:30:00')


def test_window_is_anchored_not_shifted_by_scheduler_delay():
    assert next_occurrence(window_config(intervalMinutes=17),moment('2026-10-21T02:05:11Z')).startswith('2026-10-21T02:21:00')


def test_us_window_handles_dst_and_early_close():
    c=window_config(market='US',intervalMinutes=30)
    c['windowEnd']='16:00'
    assert next_occurrence(c,moment('2026-03-06T21:00:00Z')).startswith('2026-03-09T13:30:00')
    assert next_occurrence(c,moment('2026-10-30T20:00:00Z')).startswith('2026-11-02T14:30:00')
    assert next_occurrence(c,moment('2026-11-27T17:30:00Z')).startswith('2026-11-30T14:30:00')
    c.update(stage='post',windowStart='16:15',windowEnd='20:00',intervalMinutes=60)
    assert next_occurrence(c,moment('2026-11-27T18:00:00Z')).startswith('2026-11-27T18:15:00')


@pytest.mark.parametrize('changes',[
    {'windowStart':'15:00','windowEnd':'09:30'}, {'windowEnd':'24:00'},
    {'intervalMinutes':4}, {'cadence':'daily'}, {'timezone':'Asia/Shanghai'},
    {'stage':'pre','windowEnd':'10:00'}, {'stage':'live','windowStart':'08:30'},
    {'stage':'post','windowStart':'14:00'}, {'stage':'rest'},
])
def test_invalid_window_rejected(changes):
    with pytest.raises(ValueError):
        TaskInput(**{**window_config(),**changes})


def test_window_api_persistence_and_scheduler_dedup(client,service):
    task=create(client,**{k:v for k,v in window_config(intervalMinutes=30).items() if k not in ('title','question')}).json()
    assert task['triggerMode']=='window' and task['scene']=='live'
    with service.db() as db:
        db.execute('UPDATE tasks SET next_at=? WHERE id=?',('2026-10-21T02:00:00+00:00',task['id']))
    service.tick(moment('2026-10-21T02:00:15Z'))
    service.tick(moment('2026-10-21T02:00:25Z'))
    with service.db() as db:
        assert db.execute('SELECT count(*) FROM runs').fetchone()[0]==1
    saved=client.get('/api/day/tasks').json()['tasks'][0]
    assert saved['nextAt'].startswith('2026-10-21T02:30:00')


def test_public_preset_delete_is_owner_scoped_and_persistent(client,service):
    from app.day_presets import SCENE_OWNER
    source=service.save(SCENE_OWNER,TaskInput(**config(enabled=False)))
    assert source['id'] in [t['id'] for t in client.get('/api/day/tasks').json()['sceneTasks']]
    response=client.delete('/api/day/tasks/'+source['id'],headers={'X-Veya-Day':'1'})
    assert response.status_code==200
    assert source['id'] not in [t['id'] for t in client.get('/api/day/tasks').json()['sceneTasks']]
    other=TestClient(client.app)
    assert source['id'] in [t['id'] for t in other.get('/api/day/tasks').json()['sceneTasks']]
    assert client.get('/api/day/tasks/'+source['id']+'/result').status_code==404
    with service.db() as db:
        assert db.execute('SELECT deleted FROM tasks WHERE id=?',(source['id'],)).fetchone()['deleted']==0
        owner=db.execute('SELECT owner FROM preset_dismissals WHERE task_id=?',(source['id'],)).fetchone()['owner']
    restarted=DayTasks(service.directory,service.runner)
    assert source['id'] not in [t['id'] for t in restarted.scene_tasks(owner)]
    assert source['id'] in [t['id'] for t in restarted.scene_tasks('different-owner')]

@pytest.mark.parametrize('mode',['fixed','open','close'])
@pytest.mark.parametrize('cadence',['daily','trading'])
def test_new_absolute_tasks_always_save_fixed_clock_time(mode,cadence):
    task=TaskInput(title='固定时间研究',question='复盘市场',market='US',cadence=cadence,time='14:30',timezone='Asia/Shanghai',timeMode=mode,offset=15)
    assert task.timeMode=='fixed' and task.offset==0
    assert task.time=='14:30' and task.timezone=='Asia/Shanghai'
