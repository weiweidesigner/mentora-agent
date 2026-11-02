import json
import time
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.day_tasks import DayTasks, TaskInput, ExecutionPreferences, create_router as day_router
from app.qq_channel import QQChannel, QQClient, QQChannelError, create_router, signing_key


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setenv('QQ_BOT_APP_ID', 'test-app')
    monkeypatch.setenv('QQ_BOT_APP_SECRET', 'test-secret')
    monkeypatch.setenv('VEYA_PUBLIC_URL', 'https://example.com/mentora/')
    tasks = DayTasks(tmp_path, lambda c, r: {'interpretation': '最新分析结论 [[AIME_CHART:/private/chart.html]]'})
    tasks.save_execution_preferences(ExecutionPreferences(reasoningEffort='high'))
    app = FastAPI()
    app.include_router(day_router(tasks))
    app.include_router(create_router(tasks))
    client = TestClient(app)
    sent = []
    monkeypatch.setattr(QQClient, 'reply', lambda self, *args: sent.append(args))
    return tasks, client, sent


def event(text='帮助', mid='ROBOT1.0_msg1', group=None, sender='alice'):
    return {'op': 0, 't': 'GROUP_AT_MESSAGE_CREATE' if group else 'C2C_MESSAGE_CREATE',
            'd': {'id': mid, 'content': text, 'group_openid': group, 'author': {'user_openid': sender}}}


def post(client, payload, timestamp=None, secret='test-secret'):
    raw = json.dumps(payload, ensure_ascii=False).encode()
    timestamp = str(timestamp or int(time.time()))
    signature = signing_key(secret).sign(timestamp.encode() + raw).hex()
    return client.post('/api/qq/webhook', content=raw, headers={'Content-Type': 'application/json', 'X-Signature-Timestamp': timestamp, 'X-Signature-Ed25519': signature})


def make_task(tasks):
    task = tasks.save('owner', TaskInput(title='每日分析', question='分析市场', enabled=False))
    with tasks.db() as db:
        tasks.enqueue(db, tasks.owned(db, 'owner', task['id']))
    tasks.execute(tasks.claim())
    with tasks.db() as db:
        token = db.execute('SELECT token FROM result_links WHERE task_id=?', (task['id'],)).fetchone()['token']
    return task, token


def test_official_challenge_vector(setup, monkeypatch):
    _, client, _ = setup
    monkeypatch.setenv('QQ_BOT_APP_SECRET', 'DG5g3B4j9X2KOErG')
    data = client.post('/api/qq/webhook', json={'op': 13, 'd': {'event_ts': '1725442341', 'plain_token': 'Arq0D5A61EgUu4OxUvOp'}})
    assert data.status_code == 200
    assert data.json()['signature'] == '87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706'


@pytest.mark.parametrize('kwargs', [{'secret': 'wrong'}, {'timestamp': 1}])
def test_invalid_signature_rejected(setup, kwargs):
    _, client, sent = setup
    assert post(client, event(), **kwargs).status_code == 401
    assert not sent


def test_missing_signature_malformed_and_disabled(setup, monkeypatch):
    _, client, sent = setup
    assert client.post('/api/qq/webhook', json=event()).status_code == 401
    assert client.post('/api/qq/webhook', json=[]).status_code == 400
    assert client.post('/api/qq/webhook', content='x' * 65537).status_code == 413
    monkeypatch.delenv('QQ_BOT_APP_SECRET')
    assert client.post('/api/qq/webhook', json=event()).status_code == 503
    assert not sent


def test_bind_latest_isolation_dedup_and_deleted(setup):
    tasks, client, sent = setup
    task, token = make_task(tasks)
    command = f'查看 https://example.com/mentora/?dayShare={token}'
    assert post(client, event(command)).status_code == 200
    assert '最新分析结论' in sent[-1][-1] and 'AIME_CHART' not in sent[-1][-1]
    assert post(client, event(command)).status_code == 200
    assert len(sent) == 1
    assert post(client, event('最新', 'msg2')).status_code == 200
    assert '每日分析' in sent[-1][-1]
    assert post(client, event('最新', 'msg3', sender='bob')).status_code == 200
    assert '发送“查看' in sent[-1][-1]
    assert post(client, event('最新', 'msg4', group='group1')).status_code == 200
    assert '发送“查看' in sent[-1][-1]
    with tasks.db() as db:
        db.execute('UPDATE tasks SET deleted=1 WHERE id=?', (task['id'],))
    assert post(client, event('最新', 'msg5')).status_code == 200
    assert '已删除' in sent[-1][-1]


def test_group_binding_and_unbind_survive_restart(setup):
    tasks, client, sent = setup
    _, token = make_task(tasks)
    command = f'<@!bot> 查看 https://example.com/mentora/?dayShare={token}'
    assert post(client, event(command, group='group1')).status_code == 200
    assert sent[-1][:2] == ('groups', 'group1')
    app = FastAPI(); app.include_router(create_router(tasks)); client = TestClient(app)
    assert post(client, event('最新', 'msg2', group='group1')).status_code == 200
    assert '每日分析' in sent[-1][-1]
    assert post(client, event('解绑', 'msg3', group='group1')).status_code == 200
    assert post(client, event('最新', 'msg4', group='group1')).status_code == 200
    assert '发送“查看' in sent[-1][-1]


def test_no_arbitrary_urls_or_unshared_tasks(setup):
    tasks, client, sent = setup
    make_task(tasks)
    for i, url in enumerate(['https://evil.example/?dayShare=token', 'http://example.com/mentora/?dayShare=token', 'https://example.com/mentora/?dayShare=unknown']):
        assert post(client, event('查看 ' + url, f'msg{i}')).status_code == 200
        assert '每日分析' not in sent[-1][-1]


def test_failed_send_can_retry(setup, monkeypatch):
    _, client, sent = setup
    def fail(*args):
        raise QQChannelError('private error')
    monkeypatch.setattr(QQClient, 'reply', fail)
    response = post(client, event())
    assert response.status_code == 503 and 'private error' not in response.text
    monkeypatch.setattr(QQClient, 'reply', lambda self, *args: sent.append(args))
    assert post(client, event()).status_code == 200 and len(sent) == 1


def test_qq_link_requires_owner_and_configured_bot(setup, monkeypatch):
    tasks, client, _ = setup
    client.get('/api/day/tasks')
    task = client.post('/api/day/tasks', headers={'X-Veya-Day': '1'}, json={'title': '我的任务', 'question': '分析', 'enabled': False}).json()
    path = '/api/day/tasks/' + task['id'] + '/qq-link'
    assert client.post(path).status_code == 403
    assert client.post(path, headers={'X-Veya-Day': '1'}).json()['command'].startswith('查看 https://example.com/mentora/?dayShare=')
    other = TestClient(client.app)
    assert other.post(path, headers={'X-Veya-Day': '1'}).status_code == 404
    monkeypatch.delenv('QQ_BOT_APP_SECRET')
    assert client.post(path, headers={'X-Veya-Day': '1'}).status_code == 503


def test_access_token_cached_and_send_contract(monkeypatch):
    monkeypatch.setenv('QQ_BOT_APP_ID', 'app')
    monkeypatch.setenv('QQ_BOT_APP_SECRET', 'secret')
    calls = []
    def request(url, **kwargs):
        calls.append((url, kwargs))
        return SimpleNamespace(status_code=200, json=lambda: {'access_token': 'token', 'expires_in': 7200} if 'getAppAccessToken' in url else {'id': 'sent'})
    monkeypatch.setattr('app.qq_channel.requests.post', request)
    client = QQClient()
    QQClient.reply(client, 'users', 'alice', 'msg1', '内容')
    QQClient.reply(client, 'groups', 'group1', 'msg2', '内容')
    assert len(calls) == 3
    assert calls[1][1]['headers']['Authorization'] == 'QQBot token'
    assert calls[1][1]['json']['msg_id'] == 'msg1'
    assert calls[1][1]['json']['msg_seq'] == 1
    assert calls[2][0].endswith('/v2/groups/group1/messages')
    assert all(c[1]['allow_redirects'] is False for c in calls)
    monkeypatch.setattr('app.qq_channel.requests.post', lambda *a, **k: SimpleNamespace(status_code=200, json=lambda: {'code': 1}))
    with pytest.raises(QQChannelError):
        client.reply('users', 'alice', 'msg3', '内容')


def test_pending_task_stays_bound_until_result_exists(setup):
    tasks, client, sent = setup
    task = tasks.save('owner', TaskInput(title='待运行', question='分析', enabled=False))
    with tasks.db() as db:
        token = db.execute('SELECT token FROM result_links WHERE task_id=?', (task['id'],)).fetchone()['token']
    assert post(client, event(f'查看 https://example.com/mentora/?dayShare={token}')).status_code == 200
    assert '尚未生成' in sent[-1][-1]
    with tasks.db() as db:
        tasks.enqueue(db, tasks.owned(db, 'owner', task['id']))
    tasks.execute(tasks.claim())
    assert post(client, event('最新', 'msg2')).status_code == 200
    assert '最新分析结论' in sent[-1][-1]
