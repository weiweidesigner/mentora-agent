"""Durable QQ chat jobs; inference never blocks a platform callback."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import logging
import time

log = logging.getLogger(__name__)


def plain_answer(answer):
    import re
    text = re.sub(r'\[\[AIME_[^\n]+?\]\]', '', str(answer.get('interpretation') or ''))
    text = re.sub(r'\[([^\]]+)\]\([^\n)]+\)', r'\1', text)
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'(?m)^#{1,6}\s*', '', text).replace('**', '').replace('`', '').strip()
    suffix = '\n\n完整回答与图表：' + answer['qqShareUrl'] if answer.get('qqShareUrl') else ''
    return (text[:1400] + ('…' if len(text) > 1400 else '') or '分析已完成，请打开完整结果查看。') + suffix


class QQChat:
    def __init__(self, tasks, client, runner):
        self.tasks, self.client, self.runner = tasks, client, runner
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix='mentora-qq')
        with tasks.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS qq_chat_jobs (
              id TEXT PRIMARY KEY, scope TEXT NOT NULL, kind TEXT NOT NULL,
              target TEXT NOT NULL, message_id TEXT NOT NULL, question TEXT NOT NULL,
              state TEXT NOT NULL, created REAL NOT NULL, answer TEXT, delivered INTEGER DEFAULT 0,
              error TEXT DEFAULT '');
            CREATE INDEX IF NOT EXISTS qq_chat_scope ON qq_chat_jobs(scope,created);
            CREATE TABLE IF NOT EXISTS qq_chat_resets (scope TEXT PRIMARY KEY, reset_at REAL);
            ''')

    def recover(self):
        # Never silently repeat interrupted model/tool executions.
        with self.tasks.db() as db:
            db.execute("UPDATE qq_chat_jobs SET state='interrupted',error='服务重启中断本轮分析，请重新提问' WHERE state='running'")
            queued = [r['id'] for r in db.execute("SELECT id FROM qq_chat_jobs WHERE state='queued' ORDER BY created")]
        for job_id in queued:
            self.pool.submit(self.execute, job_id)

    def latest(self, scope):
        with self.tasks.db() as db:
            row = db.execute('SELECT * FROM qq_chat_jobs WHERE scope=? ORDER BY created DESC LIMIT 1', (scope,)).fetchone()
        if not row:
            return None
        if row['state'] in ('queued', 'running'):
            return '正在分析你的问题，完成后会回复；稍后也可以发送“最新”查询。'
        if row['state'] == 'completed':
            return plain_answer(json.loads(row['answer']))
        return row['error'] or '本轮分析未完成，请重新提问。'

    def reset(self, scope):
        with self.tasks.db() as db:
            db.execute('INSERT OR REPLACE INTO qq_chat_resets VALUES(?,?)', (scope, time.time()))
        return '已开启新对话，后续问题将不再引用之前的聊天。'

    def enqueue(self, event_id, scope, kind, target, message_id, question):
        job_id = hashlib.sha256(event_id.encode()).hexdigest()
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM qq_chat_jobs WHERE id=?', (job_id,)).fetchone():
                return None
            if db.execute("SELECT 1 FROM qq_chat_jobs WHERE scope=? AND state IN ('queued','running')", (scope,)).fetchone():
                return '上一条问题仍在分析，请稍后发送“最新”查询，再继续提问。'
            if db.execute("SELECT count(*) FROM qq_chat_jobs WHERE state IN ('queued','running')").fetchone()[0] >= 20:
                return '当前分析请求较多，请稍后再试。'
            db.execute('INSERT INTO qq_chat_jobs(id,scope,kind,target,message_id,question,state,created) VALUES(?,?,?,?,?,?,?,?)',
                       (job_id, scope, kind, target, message_id, question, 'queued', time.time()))
        self.pool.submit(self.execute, job_id)
        return None

    def execute(self, job_id):
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM qq_chat_jobs WHERE id=?', (job_id,)).fetchone()
            if not row or row['state'] != 'queued':
                return
            job = dict(row)
            db.execute("UPDATE qq_chat_jobs SET state='running' WHERE id=?", (job_id,))
            reset = db.execute('SELECT reset_at FROM qq_chat_resets WHERE scope=?', (job['scope'],)).fetchone()
            reset_at = reset['reset_at'] if reset else 0
            previous = list(db.execute("SELECT question,answer FROM qq_chat_jobs WHERE scope=? AND state='completed' AND created>? ORDER BY created DESC LIMIT 6", (job['scope'], reset_at)))
        history = []
        for item in reversed(previous):
            history.extend([{'role': 'user', 'text': item['question']},
                            {'role': 'assistant', 'text': str(json.loads(item['answer']).get('interpretation') or '')[:10000]}])
        try:
            try:
                self.client.reply(job['kind'], job['target'], job['message_id'], '收到，正在调用 Mentora 分析，请稍候。', sequence=1)
            except Exception:
                log.warning('QQ chat acknowledgement failed for job %s', job_id)
            answer = self.runner(job['scope'] + ':' + str(reset_at), job['question'], history)
            if not isinstance(answer, dict) or not (answer.get('interpretation') or answer.get('reportArtifacts')):
                raise ValueError('empty answer')
            with self.tasks.db() as db:
                db.execute("UPDATE qq_chat_jobs SET state='completed',answer=? WHERE id=?", (json.dumps(answer, ensure_ascii=False), job_id))
            content = plain_answer(answer)
        except Exception:
            log.warning('QQ analysis failed for job %s', job_id)
            content = '本轮分析未完成，请稍后重新提问。'
            with self.tasks.db() as db:
                db.execute("UPDATE qq_chat_jobs SET state='failed',error=? WHERE id=?", (content, job_id))
        # Stay inside the group reply window. The result remains retrievable even
        # if synthesis took too long or QQ rejected this particular delivery.
        window = 270 if job['kind'] == 'groups' else 3500
        if time.time() - job['created'] > window:
            return
        try:
            self.client.reply(job['kind'], job['target'], job['message_id'], content, sequence=2)
            with self.tasks.db() as db:
                db.execute('UPDATE qq_chat_jobs SET delivered=1 WHERE id=?', (job_id,))
        except Exception:
            log.warning('QQ chat result delivery failed for job %s; result retained', job_id)
