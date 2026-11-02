"""QQ official Webhook: retrieve completed task results through passive replies."""
from __future__ import annotations

import json
import os
import re
import threading
import time
from urllib.parse import urlparse, parse_qs

import requests
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

HELP = '直接发送问题即可调用 Mentora 分析，支持连续追问。发送“开启语音”或“关闭语音”切换语音回复。发送“新对话”清空聊天上下文，发送“最新”查询最近回答。也可以发送“查看 任务分享链接”获取结果并绑定任务；之后发送“任务最新”查看任务更新，发送“解绑”取消绑定。QQ 官方机器人不支持定时主动推送。'
IDENTIFIER = re.compile(r'[A-Za-z0-9_-]{1,128}')


class QQChannelError(RuntimeError):
    pass


def signing_key(secret):
    seed = secret.encode()
    if not seed:
        raise QQChannelError('QQ 机器人尚未配置')
    return Ed25519PrivateKey.from_private_bytes((seed * (32 // len(seed) + 1))[:32])


class QQClient:
    def __init__(self):
        self.lock = threading.Lock()
        self.cached = None

    def credentials(self):
        app_id = os.getenv('QQ_BOT_APP_ID', '').strip()
        secret = os.getenv('QQ_BOT_APP_SECRET', '').strip()
        if not app_id or not secret:
            raise QQChannelError('QQ 机器人尚未配置')
        return app_id, secret

    def token(self):
        app_id, secret = self.credentials()
        with self.lock:
            if self.cached and self.cached[:2] == (app_id, secret) and self.cached[3] > time.monotonic():
                return self.cached[2]
            response = requests.post('https://bots.qq.com/app/getAppAccessToken',
                                     json={'appId': app_id, 'clientSecret': secret}, timeout=15, allow_redirects=False)
            if response.status_code != 200:
                raise QQChannelError('QQ 鉴权失败，请检查服务器配置')
            data = response.json()
            if not data.get('access_token'):
                raise QQChannelError('QQ 未返回调用凭据')
            self.cached = (app_id, secret, data['access_token'], time.monotonic() + max(0, int(data['expires_in']) - 60))
            return data['access_token']

    def reply(self, kind, target, message_id, content, *, sequence=1):
        if kind not in ('users', 'groups') or not IDENTIFIER.fullmatch(target):
            raise QQChannelError('QQ 消息目标无效')
        response = requests.post(f'https://api.sgroup.qq.com/v2/{kind}/{target}/messages',
                                 headers={'Authorization': 'QQBot ' + self.token()},
                                 json={'msg_type': 0, 'content': content, 'msg_id': message_id, 'msg_seq': sequence},
                                 timeout=15, allow_redirects=False)
        if response.status_code not in (200, 201, 202) or not response.json().get('id'):
            raise QQChannelError('QQ 回复失败，请检查消息权限、URL 配置及回复时限')


    def voice_reply(self, kind, target, message_id, audio_url, *, sequence=3):
        if kind not in ('users', 'groups') or not IDENTIFIER.fullmatch(target):
            raise QQChannelError('QQ 消息目标无效')
        headers = {'Authorization': 'QQBot ' + self.token()}
        base = f'https://api.sgroup.qq.com/v2/{kind}/{target}'
        response = requests.post(base + '/files', headers=headers,
                                 json={'file_type': 3, 'url': audio_url, 'srv_send_msg': False},
                                 timeout=30, allow_redirects=False)
        if response.status_code not in (200, 201) or not response.json().get('file_info'):
            raise QQChannelError('QQ 语音上传失败')
        info = response.json()['file_info']
        response = requests.post(base + '/messages', headers=headers,
                                 json={'msg_type': 7, 'content': ' ', 'media': {'file_info': info},
                                       'msg_id': message_id, 'msg_seq': sequence},
                                 timeout=15, allow_redirects=False)
        if response.status_code not in (200, 201, 202) or not response.json().get('id'):
            raise QQChannelError('QQ 语音发送失败')


class QQChannel:
    def __init__(self, tasks, client=None, chat_runner=None):
        self.tasks = tasks
        self.client = client or QQClient()
        with tasks.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS qq_bindings (scope TEXT PRIMARY KEY, token TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS qq_events (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated REAL NOT NULL)')

        from app.qq_chat import QQChat
        self.chat = QQChat(tasks, self.client, chat_runner) if chat_runner else None

    def result(self, token):
        with self.tasks.db() as db:
            row = db.execute('SELECT t.config,r.answer,r.finished FROM result_links l JOIN tasks t ON t.id=l.task_id LEFT JOIN runs r ON r.id=t.success_run WHERE l.token=? AND t.deleted=0', (token,)).fetchone()
        if not row:
            return None
        if not row['answer']:
            return '任务尚未生成成功结果，请稍后发送“最新”。'
        config = self.tasks.unpack(row['config'])
        answer = json.loads(row['answer'])
        text = re.sub(r'\[\[AIME_[^\n]+?\]\]', '', answer.get('interpretation', '')).strip()
        text = re.sub(r'\[([^\]]+)\]\([^\n)]+\)', r'\1', text)
        text = re.sub(r'https?://\S+', '', text)  # Only the configured first-party link is sent.
        text = text[:700] or '完整结果包含图表或报告，请打开链接查看。'
        base = os.getenv('VEYA_PUBLIC_URL', 'https://weiweidesigner.com/mentora/').rstrip('/')
        return f"{config['title']}\n更新于 {row['finished']}\n\n{text}\n\n完整结果：{base}/?dayShare={token}"

    def content(self, scope, text):
        text = re.sub(r'<@!?[^>]+>', '', text).strip()
        if self.chat and text in ('开启语音', '关闭语音'):
            return self.chat.voice.setting(scope, text == '开启语音')
        if self.chat and text == '新对话':
            return self.chat.reset(scope)
        if self.chat and text in ('最新', '结果'):
            latest = self.chat.latest(scope)
            if latest:
                return latest
        if text == '任务最新':
            text = '查看'
        if text == '解绑':
            with self.tasks.db() as db:
                db.execute('DELETE FROM qq_bindings WHERE scope=?', (scope,))
            return '已取消当前会话中的任务绑定。'
        if text.startswith('查看 '):
            link = text[3:].strip()
            parsed = urlparse(link)
            base = urlparse(os.getenv('VEYA_PUBLIC_URL', 'https://weiweidesigner.com/mentora/'))
            tokens = parse_qs(parsed.query).get('dayShare', [])
            if parsed.scheme != 'https' or parsed.netloc != base.netloc or parsed.path.rstrip('/') != base.path.rstrip('/') or len(tokens) != 1 or not IDENTIFIER.fullmatch(tokens[0]):
                return '请发送“查看 Mentora任务分享链接”，链接需包含 dayShare。'
            result = self.result(tokens[0])
            if result is None:
                return '分享链接无效或任务已删除。'
            with self.tasks.db() as db:
                db.execute('INSERT OR REPLACE INTO qq_bindings VALUES(?,?)', (scope, tokens[0]))
            return result
        if text in ('最新', '查看', '结果'):
            with self.tasks.db() as db:
                row = db.execute('SELECT token FROM qq_bindings WHERE scope=?', (scope,)).fetchone()
            if not row:
                return HELP
            return self.result(row['token']) or '绑定任务已删除或分享链接已失效，请重新发送任务分享链接。'
        return HELP

    def dispatch(self, payload):
        event = payload.get('t')
        if payload.get('op') != 0 or event not in ('C2C_MESSAGE_CREATE', 'GROUP_AT_MESSAGE_CREATE'):
            return
        data = payload.get('d') or {}
        author = data.get('author') or {}
        sender = author.get('user_openid') or author.get('id') or author.get('member_openid')
        kind = 'groups' if event == 'GROUP_AT_MESSAGE_CREATE' else 'users'
        target = data.get('group_openid') if kind == 'groups' else sender
        message_id = data.get('id')
        if (not all(isinstance(v, str) and IDENTIFIER.fullmatch(v) for v in (sender, target))
                or not isinstance(message_id, str) or not 0 < len(message_id) <= 1024
                or not isinstance(data.get('content'), str)):
            raise HTTPException(400, 'QQ 消息格式无效')
        app_id, _ = self.client.credentials()
        scope = json.dumps([app_id, kind, target, sender])
        event_id = json.dumps([app_id, kind, target, message_id])
        now = time.time()
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM qq_events WHERE updated<?', (now - 86400,))
            old = db.execute('SELECT * FROM qq_events WHERE id=?', (event_id,)).fetchone()
            if old and (old['state'] == 'sent' or old['state'] == 'processing' and old['updated'] > now - 60):
                return
            db.execute('INSERT OR REPLACE INTO qq_events VALUES(?,?,?)', (event_id, 'processing', now))
        try:
            text = re.sub(r'<@!?[^>]+>', '', data['content']).strip()
            if not text or len(text) > 6000:
                reply = '请发送 1 至 6000 字的问题。'
            elif self.chat and text not in ('帮助', 'help', '/help', '最新', '查看', '结果', '任务最新', '解绑', '新对话', '开启语音', '关闭语音') and not re.match(r'^查看\s+https?://', text):
                reply = self.chat.enqueue(event_id, scope, kind, target, message_id, text)
            else:
                reply = self.content(scope, text)
            if reply is not None:
                self.client.reply(kind, target, message_id, reply)
        except Exception:
            with self.tasks.db() as db:
                db.execute("UPDATE qq_events SET state='failed' WHERE id=?", (event_id,))
            raise HTTPException(503, 'QQ 回复失败，请稍后重试') from None
        with self.tasks.db() as db:
            db.execute("UPDATE qq_events SET state='sent' WHERE id=?", (event_id,))


def create_router(tasks, chat_runner=None):
    channel = QQChannel(tasks, chat_runner=chat_runner)
    router = APIRouter()
    if channel.chat:
        router.add_event_handler('startup', channel.chat.recover)
        router.add_event_handler('shutdown', lambda: channel.chat.pool.shutdown(wait=False, cancel_futures=True))

    @router.get('/api/qq/voice/{filename}')
    def voice_resource(filename: str):
        from fastapi.responses import FileResponse
        if not re.fullmatch(r'[A-Za-z0-9_-]{32}\.silk', filename):
            raise HTTPException(404, '语音不存在')
        path = tasks.directory / 'qq-voice' / filename
        if not path.is_file() or time.time() - path.stat().st_mtime > 900:
            raise HTTPException(404, '语音已过期')
        return FileResponse(path, media_type='audio/silk', headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})

    @router.post('/api/qq/webhook')
    async def callback(request: Request):
        try:
            _, secret = channel.client.credentials()
        except QQChannelError:
            raise HTTPException(503, 'QQ 机器人尚未配置') from None
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 65536:
                raise HTTPException(413, 'QQ 回调过大')
        try:
            payload = json.loads(raw)
            if not isinstance(payload, dict) or not isinstance(payload.get('d'), dict):
                raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(400, 'QQ 回调格式无效') from None
        key = signing_key(secret)
        if payload.get('op') == 13:
            data = payload['d']
            if not all(isinstance(data.get(k), str) and 0 < len(data[k]) <= 1024 for k in ('event_ts', 'plain_token')):
                raise HTTPException(400, 'QQ 验证参数无效')
            return {'plain_token': data['plain_token'], 'signature': key.sign((data['event_ts'] + data['plain_token']).encode()).hex()}
        timestamp = request.headers.get('X-Signature-Timestamp', '')
        try:
            if abs(time.time() - int(timestamp)) > 300:
                raise ValueError()
            key.public_key().verify(bytes.fromhex(request.headers.get('X-Signature-Ed25519', '')), timestamp.encode() + bytes(raw))
        except (ValueError, InvalidSignature):
            raise HTTPException(401, 'QQ 回调签名无效') from None
        await run_in_threadpool(channel.dispatch, payload)
        return {'op': 12}

    return router
