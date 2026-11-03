"""Breeze synthesis and short-lived SILK resources for QQ media uploads."""
import os
from pathlib import Path
import re
import secrets
import time

import requests


def speech_text(text):
    return re.sub(r'https?://\S+|\[\[AIME_[^\n]+?\]\]', '', text).strip()


def speech_chunks(text, limit=100):
    """Keep all spoken content, preferring sentence and clause boundaries."""
    value = speech_text(text)
    chunks = []
    while len(value) > limit:
        prefix = value[:limit]
        ends = [m.end() for m in re.finditer(r'[。！？；\n]', prefix)]
        if not ends:
            ends = [m.end() for m in re.finditer(r'[，,、：:；;\s]', prefix)]
        end = ends[-1] if ends else limit
        chunks.append(value[:end].strip())
        value = value[end:].strip()
    if value:
        chunks.append(value)
    return chunks


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

    def send_song(self, job, receipt):
        from app.qq_singing import validate
        if not validate(receipt,folder=self.directory):return False
        window = 270 if job['kind'] == 'groups' else 3500
        if time.time()-job['created']>window:return False
        base = os.getenv('VEYA_PUBLIC_URL','https://weiweidesigner.com/mentora/').rstrip('/')
        if receipt.get('attribution'):
            self.client.reply(job['kind'],job['target'],job['message_id'],receipt['attribution'],sequence=2)
        self.client.voice_reply(job['kind'],job['target'],job['message_id'],
                               base+'/api/qq/voice/'+receipt['id']+'.silk',sequence=3)
        return True

    def send(self, job, text, *, proactive=False, before_send=None, sequence_start=None):
        endpoint = os.environ['QQ_BREEZE_ENDPOINT'].rstrip('/')
        parts = speech_chunks(text)
        audio_parts = []
        # Reserve room for the full-text fallback and optional reaction.
        # Never deliver only a prefix of an answer that exceeds this budget.
        while parts:
            if len(parts) + len(audio_parts) > 3:
                raise ValueError('Answer needs more voice messages; use full text')
            part = parts.pop(0)
            payload = {'text': part}
            if job.get('voice_instruction'):
                payload['instruction'] = job['voice_instruction'][:300]
            response = requests.post(endpoint + '/speech', json=payload,
                                     headers={'Authorization': 'Bearer ' + os.environ['QQ_BREEZE_TOKEN']},
                                     timeout=(5, 120), allow_redirects=False)
            if getattr(response, 'status_code', None) == 413 and len(part) > 1:
                parts[:0] = speech_chunks(part, max(1, len(part)//2))
                continue
            response.raise_for_status()
            audio = response.content
            if len(audio) > 2*1024*1024 or not audio.startswith(b'\x02#!SILK_V3'):
                raise ValueError('Invalid voice resource')
            audio_parts.append(audio)
        if not audio_parts:
            return False
        window = 270 if job['kind'] == 'groups' else 3500
        if time.time() - job['created'] > window:
            return False
        for path in self.directory.glob('*.silk'):
            try:
                if time.time() - path.stat().st_mtime > 900:
                    path.unlink(missing_ok=True)
            except FileNotFoundError:
                pass
        base = os.getenv('VEYA_PUBLIC_URL', 'https://weiweidesigner.com/mentora/').rstrip('/')
        for index, audio in enumerate(audio_parts):
            if time.time() - job['created'] > window:
                return False
            name = secrets.token_urlsafe(24) + '.silk'
            path = self.directory / name
            path.write_bytes(audio); path.chmod(0o600)
            url = base + '/api/qq/voice/' + name
            if before_send is not None and not before_send():return False
            if proactive:
                self.client.proactive_media(job['target'],url,file_type=3)
            else:
                # Keep sequence 4 available for the reaction image.
                self.client.voice_reply(job['kind'], job['target'], job['message_id'], url,
                                        sequence=(sequence_start + index) if sequence_start is not None else (3 if index == 0 else 5 + index))
        return True
