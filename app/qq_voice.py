"""Breeze synthesis and short-lived SILK resources for QQ media uploads."""
import os
from pathlib import Path
import re
import secrets
import time

import requests


def speech_text(text, limit=140):
    value = re.sub(r'https?://\S+|\[\[AIME_[^\n]+?\]\]', '', text).strip()
    if len(value) <= limit:
        return value
    prefix = value[:limit]
    ends = [m.end() for m in re.finditer(r'[。！？；\n]', prefix)]
    if ends:
        prefix = prefix[:ends[-1]]
    return prefix.strip() + '详细内容请看文字。'


class QQVoice:
    def __init__(self, tasks, client):
        self.tasks, self.client = tasks, client
        self.directory = tasks.directory / 'qq-voice'
        self.directory.mkdir(exist_ok=True, mode=0o700)
        with tasks.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS qq_voice_preferences(scope TEXT PRIMARY KEY,enabled INTEGER NOT NULL)')

    def configured(self):
        return bool(os.getenv('QQ_BREEZE_ENDPOINT') and os.getenv('QQ_BREEZE_TOKEN'))

    def enabled(self, scope):
        if not self.configured():
            return False
        with self.tasks.db() as db:
            row = db.execute('SELECT enabled FROM qq_voice_preferences WHERE scope=?', (scope,)).fetchone()
        return bool(row['enabled']) if row else os.getenv('QQ_VOICE_DEFAULT', '1') == '1'

    def setting(self, scope, enabled):
        if enabled and not self.configured():
            return '语音服务暂未配置，仍会以文字回复。'
        with self.tasks.db() as db:
            db.execute('INSERT OR REPLACE INTO qq_voice_preferences VALUES(?,?)', (scope, int(enabled)))
        return '已允许语音，之后会按语境选择语音或文字。' if enabled else '已关闭语音，之后只回复文字。'

    def send(self, job, text):
        endpoint = os.environ['QQ_BREEZE_ENDPOINT'].rstrip('/')
        payload = {'text': speech_text(text)}
        if job.get('voice_instruction'):
            payload['instruction'] = job['voice_instruction'][:300]
        response = requests.post(endpoint + '/speech', json=payload,
                                 headers={'Authorization': 'Bearer ' + os.environ['QQ_BREEZE_TOKEN']},
                                 timeout=(5, 120), allow_redirects=False)
        response.raise_for_status()
        audio = response.content
        if len(audio) > 2*1024*1024 or not audio.startswith(b'\x02#!SILK_V3'):
            raise ValueError('Invalid voice resource')
        window = 270 if job['kind'] == 'groups' else 3500
        if time.time() - job['created'] > window:
            return False
        for path in self.directory.glob('*.silk'):
            try:
                if time.time() - path.stat().st_mtime > 900:
                    path.unlink(missing_ok=True)
            except FileNotFoundError:
                pass
        name = secrets.token_urlsafe(24) + '.silk'
        path = self.directory / name
        path.write_bytes(audio); path.chmod(0o600)
        base = os.getenv('VEYA_PUBLIC_URL', 'https://weiweidesigner.com/mentora/').rstrip('/')
        url = base + '/api/qq/voice/' + name
        self.client.voice_reply(job['kind'], job['target'], job['message_id'], url, sequence=3)
        return True
