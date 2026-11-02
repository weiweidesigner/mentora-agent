import json
import threading
import time
from types import SimpleNamespace

import pytest
from app.day_tasks import DayTasks
from app.qq_channel import QQChannel
from app.qq_chat import QQChat, plain_answer


class Client:
    def __init__(self):
        self.sent = []
        self.fail_ack = False
        self.fail_result = False

    def credentials(self):
        return 'app', 'secret'

    def reply(self, kind, target, message_id, content, *, sequence=1):
        if self.fail_ack and sequence == 1 or self.fail_result and sequence == 2:
            raise RuntimeError('QQ unavailable')
        self.sent.append((kind, target, message_id, content, sequence))


@pytest.fixture
def tasks(tmp_path):
    return DayTasks(tmp_path, lambda c, r: {})


def payload(text, mid='message1', user='alice', group=None):
    return {'op': 0, 't': 'GROUP_AT_MESSAGE_CREATE' if group else 'C2C_MESSAGE_CREATE',
            'd': {'id': mid, 'content': text, 'author': {'user_openid': user}, 'group_openid': group}}


def wait_job(tasks, expected='completed', count=1):
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        with tasks.db() as db:
            rows = list(db.execute('SELECT * FROM qq_chat_jobs ORDER BY created'))
        if len(rows) == count and rows[-1]['state'] == expected:
            return rows
        time.sleep(.01)
    raise AssertionError('job did not reach expected state')


def test_free_question_async_dedup_and_followup(tasks):
    entered, release = threading.Event(), threading.Event()
    calls, client = [], Client()
    def runner(scope, question, history):
        calls.append((scope, question, history))
        entered.set()
        assert release.wait(3)
        return {'interpretation': '真实分析结果', 'qqShareUrl': 'https://example.com/share/result'}
    channel = QQChannel(tasks, client=client, chat_runner=runner)
    channel.dispatch(payload('今天A股市场表现'))
    assert entered.wait(1)
    channel.dispatch(payload('今天A股市场表现'))
    assert len(calls) == 1
    channel.dispatch(payload('继续追问', 'message2'))
    assert '上一条' in client.sent[-1][3]
    release.set()
    wait_job(tasks)
    channel.chat.pool.shutdown(wait=True)
    assert [m[4] for m in client.sent if m[2] == 'message1'] == [1, 2]
    assert '真实分析结果' in client.sent[-1][3]
    assert calls[0][1] == '今天A股市场表现' and calls[0][2] == []
    channel.dispatch(payload('最新', 'message3'))
    assert '真实分析结果' in client.sent[-1][3]


def test_histories_isolated_and_reset(tasks):
    client, calls = Client(), []
    runner = lambda scope, q, history: (calls.append((scope, q, history)) or {'interpretation': '回答' + q})
    chat = QQChat(tasks, client, runner)
    for index, scope in enumerate(['alice', 'alice', 'bob', 'group-alice']):
        chat.enqueue(str(index), scope, 'users', 'target', str(index), '问题' + str(index))
        wait_job(tasks, count=index+1)
    assert calls[0][2] == []
    assert calls[1][2][0]['text'] == '问题0'
    assert calls[2][2] == [] and calls[3][2] == []
    chat.reset('alice')
    chat.enqueue('reset', 'alice', 'users', 'target', 'reset', '新问题')
    wait_job(tasks, count=5)
    chat.pool.shutdown(wait=True)
    assert calls[-1][2] == []


def test_failed_ack_does_not_prevent_analysis_and_failed_send_retains_result(tasks):
    client = Client(); client.fail_ack = client.fail_result = True
    chat = QQChat(tasks, client, lambda *a: {'interpretation': '保存的结果'})
    chat.enqueue('event', 'scope', 'users', 'target', 'mid', '问题')
    wait_job(tasks)
    chat.pool.shutdown(wait=True)
    assert '保存的结果' in chat.latest('scope')
    with tasks.db() as db:
        assert db.execute('SELECT delivered FROM qq_chat_jobs').fetchone()[0] == 0


def test_model_failure_never_says_completed(tasks):
    client = Client()
    def fail(*args):
        raise RuntimeError('private credential details')
    chat = QQChat(tasks, client, fail)
    chat.enqueue('event', 'scope', 'users', 'target', 'mid', '问题')
    wait_job(tasks, 'failed')
    chat.pool.shutdown(wait=True)
    assert '未完成' in chat.latest('scope')
    assert 'private credential' not in str(client.sent)


def test_restart_marks_running_interrupted_and_resumes_queued(tasks):
    client = Client()
    chat = QQChat(tasks, client, lambda *a: {'interpretation': '恢复队列'})
    with tasks.db() as db:
        for state in ['running', 'queued']:
            db.execute('INSERT INTO qq_chat_jobs(id,scope,kind,target,message_id,question,state,created) VALUES(?,?,?,?,?,?,?,?)',
                       (state, state, 'users', 'target', state, '问题', state, time.time()))
    chat.recover(); chat.pool.shutdown(wait=True)
    assert '重启中断' in chat.latest('running')
    assert '恢复队列' in chat.latest('queued')


def test_expired_group_reply_is_saved_without_late_send(tasks):
    client = Client()
    chat = QQChat(tasks, client, lambda *a: {'interpretation': '超时保存的结果'})
    with tasks.db() as db:
        db.execute('INSERT INTO qq_chat_jobs(id,scope,kind,target,message_id,question,state,created) VALUES(?,?,?,?,?,?,?,?)',
                   ('late', 'scope', 'groups', 'group', 'mid', '问题', 'queued', time.time()-301))
    chat.execute('late'); chat.pool.shutdown(wait=True)
    assert not any(item[4] == 2 for item in client.sent)
    assert '超时保存的结果' in chat.latest('scope')


def test_plain_text_preserves_conclusion_and_hides_artifact_paths():
    result = plain_answer({'interpretation': '## 结论\n**上涨** [来源](https://source.example)\n[[AIME_CHART:/private/file.html]]', 'qqShareUrl': 'https://example.com/share/id'})
    assert '上涨' in result and '/private/' not in result and 'AIME_CHART' not in result
    assert 'https://example.com/share/id' in result


def test_signed_callback_starts_chat_without_waiting_for_inference(tasks, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.qq_channel import create_router, QQClient, signing_key
    monkeypatch.setenv('QQ_BOT_APP_ID', 'app')
    monkeypatch.setenv('QQ_BOT_APP_SECRET', 'secret')
    entered, release, done = threading.Event(), threading.Event(), threading.Event()
    def runner(*args):
        entered.set()
        assert release.wait(3)
        return {'interpretation': '普通问题已接入'}
    sent = []
    def reply(self, *args, **kwargs):
        sent.append((args, kwargs))
        if kwargs.get('sequence') == 2:
            done.set()
    monkeypatch.setattr(QQClient, 'reply', reply)
    app = FastAPI(); app.include_router(create_router(tasks, chat_runner=runner))
    raw = json.dumps(payload('今天A股市场表现')).encode()
    timestamp = str(int(time.time()))
    signature = signing_key('secret').sign(timestamp.encode() + raw).hex()
    with TestClient(app) as client:
        response = client.post('/api/qq/webhook', content=raw, headers={'X-Signature-Timestamp': timestamp, 'X-Signature-Ed25519': signature})
        assert response.status_code == 200 and entered.wait(1)
        assert not done.is_set()
        release.set()
        assert done.wait(2)
    assert '普通问题已接入' in sent[-1][0][-1]


def test_runner_uses_existing_agent_and_keeps_shareable_complete_answer(monkeypatch):
    import ast
    from pathlib import Path
    source = ast.parse(Path('app/presentation.py').read_text())
    fn = next(item for item in source.body if isinstance(item, ast.FunctionDef) and item.name == 'run_qq_chat')
    captured, shared = [], []
    def events(request, owner):
        captured.append((request, owner))
        yield 'status', {'message': '研究'}
        yield 'final', {'interpretation': '完整回答', 'reportArtifacts': [{'url': '/generated/figure.html'}]}
    monkeypatch.setenv('VEYA_PUBLIC_URL', 'https://example.com/mentora/')
    namespace = {'os': __import__('os'), 'ChatRequest': lambda **kwargs: SimpleNamespace(**kwargs),
                 'DAY_TASKS': SimpleNamespace(execution_preferences=lambda: {'reasoningEffort': 'high'}),
                 'durable_chat_events': events, 'normalize_chat_result': lambda data: dict(data),
                 'save_share_session': lambda payload: shared.append(payload.session),
                 'ShareSessionRequest': lambda **kwargs: SimpleNamespace(**kwargs)}
    exec(compile(ast.Module(body=[fn], type_ignores=[]), '<qq-runner>', 'exec'), namespace)
    result = namespace['run_qq_chat']('private-qq-scope', '今天A股市场表现', [{'role': 'user', 'text': '之前的问题'}])
    assert captured[0][0].agent == 'mentora' and captured[0][0].reasoningEffort == 'high'
    assert captured[0][0].history[0]['text'] == '之前的问题'
    assert '今天A股市场表现' in captured[0][0].question
    assert 'private-qq-scope' not in captured[0][1]
    assert shared[0]['question'] == '今天A股市场表现'
    assert shared[0]['reportArtifacts'][0]['url'] == '/generated/figure.html'
    assert result['qqShareUrl'].startswith('https://example.com/mentora/share/qq-')
