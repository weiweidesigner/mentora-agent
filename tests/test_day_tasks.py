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


def test_cn_holiday_is_skipped():
    value = next_occurrence(config(), moment('2026-09-30T02:00:00+00:00'))
    assert value.startswith('2026-10-08T01:00:00')


def test_us_fixed_market_time_follows_dst():
    c = config(market='US', time='09:00')
    assert next_occurrence(c, moment('2026-03-06T15:00:00Z')).startswith('2026-03-09T13:00:00')
    assert next_occurrence(c, moment('2026-10-30T15:00:00Z')).startswith('2026-11-02T14:00:00')


def test_us_early_close_relative_time():
    c = config(market='US', timeMode='close', offset=15)
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
    {'cadence':'daily','timeMode':'open'},
])
def test_invalid_configuration_rejected(client, changes):
    response=client.post('/api/day/tasks',json={**config(),**changes},headers={'X-Veya-Day':'1'})
    assert response.status_code in (400,422)


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
