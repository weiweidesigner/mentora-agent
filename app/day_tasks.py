"""Persistent, browser-scoped daily research tasks and server-side execution.

The scheduler holds an OS lock so reloads/multiple ASGI workers cannot dispatch
one occurrence twice. SQLite transactions also serialize claims and edits.
"""
from __future__ import annotations

import base64
import datetime as dt
import fcntl
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Literal
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import exchange_calendars as xcals
import requests
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field, model_validator

from app.wecom_channel import WeComRobotClient, validate_webhook_url

log = logging.getLogger(__name__)
UTC = dt.timezone.utc
MARKETS = {
    'CN': {'name': 'A股', 'flag': '🇨🇳', 'zone': 'Asia/Shanghai', 'exchange': 'XSHG'},
    'HK': {'name': '港股', 'flag': '🇭🇰', 'zone': 'Asia/Hong_Kong', 'exchange': 'XHKG'},
    'US': {'name': '美股', 'flag': '🇺🇸', 'zone': 'America/New_York', 'exchange': 'XNYS'},
}
STAGES = {'pre': '盘前机会', 'live': '盘中监控', 'post': '收盘回顾', 'rest': '休市时光'}
COOKIE = 'veya_day_owner'
SECRET_FIELDS = ('feishuUrl', 'feishuSecret', 'wecomUrl', 'serverchanKey')


def now_utc():
    return dt.datetime.now(UTC)


def stamp(value):
    return value.astimezone(UTC).isoformat() if value else None


@lru_cache(maxsize=3)
def calendar(market):
    return xcals.get_calendar(MARKETS[market]['exchange'])


def session(market, day):
    cal = calendar(market)
    if not cal.is_session(day.isoformat()):
        return None
    return cal.schedule.loc[day.isoformat()]


def market_state(market, now=None):
    local = (now or now_utc()).astimezone(ZoneInfo(MARKETS[market]['zone']))
    result = dict(MARKETS[market], market=market, localTime=local.isoformat(), stage='pre', status='盘前', calendarError='')
    try:
        s = session(market, local.date())
        if s is None:
            result.update(status='今日休市', stage='rest', closed=True)
        elif local < s['open'].to_pydatetime():
            pass
        elif local >= s['close'].to_pydatetime():
            result.update(status='已收盘', stage='post')
        else:
            result.update(status='交易中', stage='live')
            if s['break_start'] is not None and not str(s['break_start']) == 'NaT':
                if s['break_start'].to_pydatetime() <= local < s['break_end'].to_pydatetime():
                    result['status'] = '午间休市'
        if s is not None:
            result.update(closed=False,openAt=stamp(s['open'].to_pydatetime()),closeAt=stamp(s['close'].to_pydatetime()))
    except Exception:
        result.update(status='交易日历暂不可用', calendarError='无法确认交易日，交易日任务暂停调度')
    return result


class TaskInput(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    market: Literal['CN', 'HK', 'US'] = 'CN'
    stage: Literal['pre', 'live', 'post', 'rest'] = 'pre'
    assetType: Literal['stocks', 'etf', 'index', 'sector', 'watchlist'] = 'stocks'
    symbols: str = Field(default='', max_length=500)
    question: str = Field(min_length=1, max_length=6000)
    cadence: Literal['daily', 'weekdays', 'trading', 'once', 'weekly', 'monthly', 'custom'] = 'trading'
    date: str = ''
    endDate: str = ''
    weekdays: list[int] = Field(default_factory=lambda: [0], min_length=1, max_length=7)
    monthDay: int = Field(default=1, ge=1, le=31)
    time: str = '09:00'
    timeMode: Literal['fixed', 'open', 'close'] = 'fixed'
    offset: int = Field(default=-30, ge=-180, le=180)
    timezone: str = Field(default='market', max_length=80)
    enabled: bool = True
    newChat: bool = True
    browser: bool = False
    feishu: bool = False
    wecom: bool = False
    serverchan: bool = False
    serverchanKey: str = Field(default='', max_length=200)
    feishuUrl: str = Field(default='', max_length=500)
    feishuSecret: str = Field(default='', max_length=300)
    wecomUrl: str = Field(default='', max_length=500)

    @model_validator(mode='after')
    def validate_schedule(self):
        self.title, self.question = self.title.strip(), self.question.strip()
        if not self.title or not self.question:
            raise ValueError('任务名称和问句不能为空')
        if self.timezone != 'market':
            try:
                ZoneInfo(self.timezone)
            except (KeyError, ValueError):
                raise ValueError('请选择有效的时区')
        if not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', self.time):
            raise ValueError('时间格式应为 HH:MM')
        if self.assetType == 'watchlist' and not self.symbols.strip():
            raise ValueError('请选择自选列表中的具体标的，或改为全市场分析')
        if any(day < 0 or day > 6 for day in self.weekdays):
            raise ValueError('星期应为 0 至 6')
        if self.endDate:
            dt.date.fromisoformat(self.endDate)
        if self.cadence == 'once':
            dt.date.fromisoformat(self.date)
        if self.timeMode != 'fixed' and self.cadence == 'daily':
            raise ValueError('相对开收盘时间请选交易日触发')
        if self.serverchanKey and not re.fullmatch(r'SCT[A-Za-z0-9]+', self.serverchanKey):
            raise ValueError('请填写 SCT 开头的 Server酱 Turbo SendKey')
        if self.feishuUrl:
            p = urlparse(self.feishuUrl)
            if (p.scheme != 'https' or p.netloc != 'open.feishu.cn' or p.query or p.fragment
                    or not re.fullmatch(r'/open-apis/bot/v2/hook/[A-Za-z0-9-]+', p.path)):
                raise ValueError('请填写飞书群自定义机器人的官方 Webhook 地址')
        if self.wecomUrl:
            p = urlparse(self.wecomUrl)
            if p.netloc != 'qyapi.weixin.qq.com' or p.fragment:
                raise ValueError('请填写企业微信群机器人的官方 Webhook 地址')
            try:
                validate_webhook_url(self.wecomUrl)
            except Exception as exc:
                raise ValueError('请填写有效的企业微信群机器人地址') from exc
        return self


def next_occurrence(config, after):
    if not config['enabled']:
        return None
    market = config['market']
    zone = ZoneInfo(MARKETS[market]['zone'] if config['timezone'] == 'market' else config['timezone'])
    start = after.astimezone(zone).date()
    days = [dt.date.fromisoformat(config['date'])] if config['cadence'] == 'once' else [start + dt.timedelta(days=i) for i in range(370)]
    for day in days:
        if config.get('endDate') and day > dt.date.fromisoformat(config['endDate']):
            return None
        if config['cadence'] == 'weekdays' and day.weekday() > 4:
            continue
        if config['cadence'] in ('weekly', 'custom') and day.weekday() not in config.get('weekdays', [0]):
            continue
        if config['cadence'] == 'monthly' and day.day != config.get('monthDay', 1):
            continue
        if config['timeMode'] == 'fixed':
            candidate = dt.datetime.combine(day, dt.time.fromisoformat(config['time']), zone)
            if config.get('stage')=='rest' and session(market,candidate.astimezone(ZoneInfo(MARKETS[market]['zone'])).date()) is not None:
                continue
            if config['cadence'] == 'trading':
                # A fixed Beijing time for US stocks belongs to its exchange-local date.
                exchange_day = candidate.astimezone(ZoneInfo(MARKETS[market]['zone'])).date()
                if session(market, exchange_day) is None:
                    continue
        else:
            s = session(market, day)
            if s is None:
                continue
            candidate = s[config['timeMode']].to_pydatetime() + dt.timedelta(minutes=config['offset'])
        if candidate > after:
            return stamp(candidate)
    return None


def task_scene(config, at=None):
    if config.get('stage')=='rest':return 'rest'
    if config.get('timeMode')=='open':return 'pre' if config.get('offset',0)<=0 else 'live'
    if config.get('timeMode')=='close':return 'post' if config.get('offset',0)>=0 else 'live'
    time=dt.time.fromisoformat(config.get('time','09:00'))
    zone=ZoneInfo(MARKETS[config['market']]['zone'] if config.get('timezone','market')=='market' else config['timezone'])
    exchange=dt.datetime.combine((at or now_utc()).astimezone(zone).date(),time,zone).astimezone(ZoneInfo(MARKETS[config['market']]['zone'])).time()
    close=dt.time(15,0) if config['market']=='CN' else dt.time(16,0)
    return 'pre' if exchange<dt.time(9,30) else 'live' if exchange<close else 'post'


def result_preview(markdown):
    text=re.sub(r'\[\[AIME_[^\n]+?\]\]','',markdown or '')
    text=re.sub(r'\[([^\]]+)\]\([^)]+\)',r'\1',text)
    text=re.sub(r'[*_`]+','',text)
    lines=[re.sub(r'^\s*(?:#{1,6}\s*|[-*>]\s*|\d+[.、]\s*)','',line).strip() for line in text.splitlines()]
    lines=[line for line in lines if line and line not in ('核心结论','关键证据','结论','总结','分析结果') and not line.startswith(('来源','数据口径','http','|'))]
    if not lines:return '',''
    first=lines[0]
    headline=re.split(r'[。！？\n]',first)[0][:64]
    description=' '.join(lines[1:] if len(first)<=64 and len(lines)>1 else lines)[:240]
    return headline,description


def private_file(path, content):
    try:
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as file:
            file.write(content)
    except FileExistsError:
        pass
    return path.read_bytes()


class DayTasks:
    def __init__(self, directory: Path, runner: Callable):
        self.directory, self.runner = directory, runner
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db_path = directory / 'tasks.sqlite3'
        self.cipher = Fernet(private_file(directory / 'channel.key', Fernet.generate_key()))
        key = ec.generate_private_key(ec.SECP256R1())
        self.vapid_path = directory / 'vapid.pem'
        pem = private_file(self.vapid_path, key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        vapid = serialization.load_pem_private_key(pem, password=None)
        self.public_key = base64.urlsafe_b64encode(vapid.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)).rstrip(b'=').decode()
        self.stop_event = threading.Event()
        self.lock_file = None
        with self.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, config TEXT NOT NULL,
                next_at TEXT, active_run TEXT, last_run TEXT, success_run TEXT,
                created TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS task_owner ON tasks(owner,deleted);
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY, task_id TEXT NOT NULL, owner TEXT NOT NULL,
                config TEXT NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL,
                finished TEXT, answer TEXT, error TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS result_links (
                task_id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS subscriptions (
                endpoint TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS task_confirmations (
                task_id TEXT PRIMARY KEY, config_key TEXT NOT NULL, answer TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS deliveries (
                id TEXT PRIMARY KEY, run_id TEXT NOT NULL, owner TEXT NOT NULL,
                channel TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0, next_at TEXT NOT NULL, error TEXT NOT NULL DEFAULT ''
            );
            ''')
        os.chmod(self.db_path, 0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.db_path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        try:
            with db:
                yield db
        finally:
            db.close()

    def pack(self, data):
        config = dict(data)
        for name in SECRET_FIELDS:
            config[name] = self.cipher.encrypt(config[name].encode()).decode() if config.get(name) else ''
        return json.dumps(config, ensure_ascii=False)

    def unpack(self, value):
        config = json.loads(value)
        config.setdefault('serverchan', False)
        config.setdefault('newChat', True)
        config.setdefault('endDate', '')
        config.setdefault('weekdays', [0])
        config.setdefault('monthDay', 1)
        for name in SECRET_FIELDS:
            config[name] = self.cipher.decrypt(config[name].encode()).decode() if config.get(name) else ''
        return config

    def owned(self, db, owner, task_id):
        row = db.execute('SELECT * FROM tasks WHERE id=? AND owner=? AND deleted=0', (task_id, owner)).fetchone()
        if not row:
            raise HTTPException(404, '任务不存在')
        return row

    def public(self, db, row):
        config = self.unpack(row['config'])
        for name in SECRET_FIELDS:
            config[name + 'Configured'] = bool(config.pop(name, ''))
        last = db.execute('SELECT status,error,finished FROM runs WHERE id=?', (row['last_run'],)).fetchone()
        success = db.execute('SELECT id,created,config,finished,answer FROM runs WHERE id=?', (row['success_run'],)).fetchone()
        notice = db.execute('SELECT channel,status,error FROM deliveries WHERE run_id=?', (row['last_run'],)).fetchall()
        answer = json.loads(success['answer']) if success else {}
        summary = re.sub(r'\[\[AIME_[^\n]+?\]\]', '', answer.get('interpretation', ''))
        from app.day_presets import SCENE_OWNER, PRESETS
        snapshot=self.unpack(success['config']) if success else config
        scene=task_scene(snapshot,dt.datetime.fromisoformat(success['created']) if success else None)
        headline,description=result_preview(answer.get('interpretation',''))
        emoji=next((p[2] for p in PRESETS if p[3]==config['title']),{'pre':'🌅','live':'☀️','post':'🌇','rest':'🧳'}.get(scene,'📋'))
        return dict(config, systemPreset=row['owner']==SCENE_OWNER, scene=task_scene(config),resultScene=scene,resultMarket=snapshot['market'],resultDate=dt.datetime.fromisoformat(success['created']).astimezone(ZoneInfo(MARKETS[snapshot['market']]['zone'])).date().isoformat() if success else None,resultHeadline=headline,resultDescription=description,emoji=emoji, id=row['id'], nextAt=row['next_at'], activeRun=row['active_run'],
                    lastRun=dict(last) if last else None, successAt=success['finished'] if success else None,
                    resultVersion=success['id'] if success else None, summary=summary[:180],
                    notifications=[dict(n) for n in notice])

    def list(self, owner):
        with self.db() as db:
            return [self.public(db, r) for r in db.execute('SELECT * FROM tasks WHERE owner=? AND deleted=0 ORDER BY created', (owner,))]

    def seed_scene_presets(self):
        from app.day_presets import SCENE_OWNER,preset_payloads
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            for task_id,emoji,payload in preset_payloads():
                if db.execute('SELECT 1 FROM tasks WHERE id=?',(task_id,)).fetchone():continue
                config=payload.model_dump()
                next_at=next_occurrence(config,now_utc())
                db.execute('INSERT INTO tasks(id,owner,config,next_at,created) VALUES(?,?,?,?,?)',(task_id,SCENE_OWNER,self.pack(config),next_at,stamp(now_utc())))
                db.execute('INSERT INTO result_links(task_id,token) VALUES(?,?)',(task_id,secrets.token_urlsafe(32)))

    def scene_tasks(self):
        from app.day_presets import SCENE_OWNER
        with self.db() as db:
            return [self.public(db,row) for row in db.execute('SELECT * FROM tasks WHERE owner=? AND deleted=0 ORDER BY id',(SCENE_OWNER,))]

    def readable(self,db,owner,task_id):
        from app.day_presets import SCENE_OWNER
        row=db.execute('SELECT * FROM tasks WHERE id=? AND deleted=0 AND owner IN (?,?)',(task_id,owner,SCENE_OWNER)).fetchone()
        if not row:raise HTTPException(404,'任务不存在')
        return row

    def save(self, owner, payload, task_id=None):
        config = payload.model_dump()
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            if task_id:
                old = self.owned(db, owner, task_id)
                previous = self.unpack(old['config'])
                for name in SECRET_FIELDS:
                    config[name] = config.get(name, '') or previous.get(name, '')
            else:
                if db.execute('SELECT count(*) FROM tasks WHERE owner=? AND deleted=0', (owner,)).fetchone()[0] >= 20:
                    raise HTTPException(400, '最多创建 20 个任务')
                if db.execute('SELECT count(*) FROM tasks WHERE deleted=0').fetchone()[0] >= 500:
                    raise HTTPException(429, '任务容量已满，请稍后重试')
                task_id = str(uuid.uuid4())
            if (config['feishu'] and not config['feishuUrl']) or (config['wecom'] and not config['wecomUrl']):
                raise HTTPException(400, '请先填写所选机器人的 Webhook 地址')
            try:
                next_at = next_occurrence(config, now_utc())
            except Exception as exc:
                raise HTTPException(400, '交易日历超出可用范围，暂时不能设置此日期') from exc
            if config['serverchan'] and not config['serverchanKey']:
                raise HTTPException(400, '请先填写 Server酱 Turbo SendKey')
            if config['browser'] and not db.execute('SELECT 1 FROM subscriptions WHERE owner=? LIMIT 1', (owner,)).fetchone():
                raise HTTPException(400, '请先点击开启当前浏览器通知，完成授权与订阅')
            if config['enabled'] and not next_at:
                raise HTTPException(400, '没有未来的执行时间，请修改日期或时间')
            if not config['feishu']:
                config['feishuUrl'] = config['feishuSecret'] = ''
            if not config['serverchan']:
                config['serverchanKey'] = ''
            if not config['wecom']:
                config['wecomUrl'] = ''
            if task_id and 'old' in locals():
                db.execute('UPDATE tasks SET config=?,next_at=? WHERE id=?', (self.pack(config), next_at, task_id))
            else:
                db.execute('INSERT INTO tasks(id,owner,config,next_at,created) VALUES(?,?,?,?,?)', (task_id, owner, self.pack(config), next_at, stamp(now_utc())))
            db.execute('INSERT OR IGNORE INTO result_links(task_id,token) VALUES(?,?)', (task_id, secrets.token_urlsafe(32)))
            return self.public(db, self.owned(db, owner, task_id))

    def enqueue(self, db, row, automatic=False, now=None):
        if row['active_run']:
            raise HTTPException(409, '任务正在排队或执行，请等待完成')
        now = now or now_utc()
        if not automatic:
            last = db.execute('SELECT created FROM runs WHERE id=?', (row['last_run'],)).fetchone()
            if last and (now - dt.datetime.fromisoformat(last['created'])).total_seconds() < 60:
                raise HTTPException(429, '请间隔至少一分钟再运行')
        run_id = str(uuid.uuid4())
        db.execute('INSERT INTO runs(id,task_id,owner,config,status,created) VALUES(?,?,?,?,?,?)', (run_id, row['id'], row['owner'], row['config'], 'queued', stamp(now)))
        db.execute('UPDATE tasks SET active_run=?,last_run=? WHERE id=?', (run_id, run_id, row['id']))
        if automatic:
            config = self.unpack(row['config'])
            try:
                next_at = next_occurrence(config, now)
            except Exception:
                next_at = None
            if config['cadence'] == 'once':
                config['enabled'] = False
            db.execute('UPDATE tasks SET config=?,next_at=? WHERE id=?', (self.pack(config), next_at, row['id']))
        return run_id

    def tick(self, now=None):
        now = now or now_utc()
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            for row in db.execute('SELECT * FROM tasks WHERE deleted=0 AND active_run IS NULL AND next_at<=?', (stamp(now),)).fetchall():
                # A server restart catches up only a recent occurrence; old market reports are skipped.
                if now - dt.datetime.fromisoformat(row['next_at']) <= dt.timedelta(minutes=30):
                    self.enqueue(db, row, automatic=True, now=now)
                else:
                    try:
                        next_at = next_occurrence(self.unpack(row['config']), now)
                    except Exception:
                        next_at = None
                    db.execute('UPDATE tasks SET next_at=? WHERE id=?', (next_at, row['id']))

    def claim(self):
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute("SELECT r.* FROM runs r JOIN tasks t ON r.task_id=t.id WHERE r.status='queued' AND t.deleted=0 ORDER BY r.created LIMIT 1").fetchone()
            if row:
                db.execute("UPDATE runs SET status='running' WHERE id=?", (row['id'],))
                return dict(row)
        return None

    def execute(self, run):
        config = self.unpack(run['config'])
        try:
            run_config = dict(config)
            if not config.get('newChat', True):
                with self.db() as db:
                    previous = db.execute('SELECT r.config,r.answer FROM tasks t JOIN runs r ON r.id=t.success_run WHERE t.id=? AND t.owner=?', (run['task_id'], run['owner'])).fetchone()
                if previous and previous['answer']:
                    previous_answer = json.loads(previous['answer'])
                    run_config['_history'] = [
                        {'role': 'user', 'text': previous_answer.get('question') or self.unpack(previous['config'])['question']},
                        {'role': 'assistant', 'text': str(previous_answer.get('interpretation', ''))[:16000]},
                    ]
            answer = self.runner(run_config, run['id'])
            if not isinstance(answer, dict) or not (answer.get('interpretation') or answer.get('reportArtifacts')):
                raise ValueError('empty result')
            with self.db() as db:
                db.execute('BEGIN IMMEDIATE')
                db.execute("UPDATE runs SET status='success',answer=?,finished=? WHERE id=?", (json.dumps(answer, ensure_ascii=False), stamp(now_utc()), run['id']))
                db.execute('UPDATE tasks SET success_run=?,active_run=NULL WHERE id=? AND active_run=?', (run['id'], run['task_id'], run['id']))
                task = db.execute('SELECT deleted FROM tasks WHERE id=?', (run['task_id'],)).fetchone()
                if task and not task['deleted']:
                    for channel in ('feishu', 'wecom', 'browser', 'serverchan'):
                        if config[channel]:
                            targets = [dict(s) for s in db.execute('SELECT endpoint,payload FROM subscriptions WHERE owner=?', (run['owner'],))] if channel == 'browser' else [{}]
                            for target in targets:
                                db.execute('INSERT INTO deliveries(id,run_id,owner,channel,target,next_at) VALUES(?,?,?,?,?,?)', (str(uuid.uuid4()), run['id'], run['owner'], channel, json.dumps(target), stamp(now_utc())))
        except Exception:
            log.exception('Daily research task failed: %s', run['id'])
            with self.db() as db:
                db.execute("UPDATE runs SET status='failed',error=?,finished=? WHERE id=?", ('分析未完成，请稍后重试；上次成功结果已保留', stamp(now_utc()), run['id']))
                db.execute('UPDATE tasks SET active_run=NULL WHERE id=? AND active_run=?', (run['task_id'], run['id']))

    def send(self, delivery, run):
        config = self.unpack(run['config'])
        answer = json.loads(run['answer'])
        prefix = os.getenv('AICHART_BASE_PATH', '').rstrip('/')
        with self.db() as db:
            token = db.execute('SELECT token FROM result_links WHERE task_id=?', (run['task_id'],)).fetchone()['token']
        link = f"{os.getenv('VEYA_PUBLIC_URL', 'https://weiweidesigner.com/mentora/').rstrip('/')}/?dayShare={token}"
        summary = re.sub(r'\[\[AIME_[^\n]+?\]\]', '', answer.get('interpretation', ''))[:900]
        content = f"{config['title']}\n{MARKETS[config['market']]['name']} · {STAGES[config['stage']]}\n{run['finished']}\n\n{summary}\n\n查看最新完整分析：{link}"
        if delivery['channel'] == 'wecom':
            WeComRobotClient(config['wecomUrl']).send_markdown(content)
        elif delivery['channel'] == 'serverchan':
            response = requests.post('https://sctapi.ftqq.com/' + config['serverchanKey'] + '.send', data={'title': config['title'].replace('\n', ' ') + '已更新', 'desp': content}, timeout=15, allow_redirects=False)
            response.raise_for_status()
            if response.json().get('code') != 0:
                raise ValueError('ServerChan rejected message')
        elif delivery['channel'] == 'feishu':
            payload = {'msg_type': 'text', 'content': {'text': content}}
            if config['feishuSecret']:
                timestamp = str(int(time.time()))
                key = f"{timestamp}\n{config['feishuSecret']}".encode()
                payload.update(timestamp=timestamp, sign=base64.b64encode(hmac.new(key, b'', hashlib.sha256).digest()).decode())
            response = requests.post(config['feishuUrl'], json=payload, timeout=15, allow_redirects=False)
            response.raise_for_status()
            result = response.json()
            if int(result.get('code', result.get('StatusCode', -1))) != 0:
                raise ValueError('Feishu rejected message')
        else:
            from pywebpush import webpush, WebPushException
            target = json.loads(delivery['target'])
            try:
                webpush(subscription_info=json.loads(target['payload']), data=json.dumps({'title': config['title'] + '已更新', 'body': summary[:100], 'url': prefix + '/?dayResult=' + run['task_id'], 'tag': run['task_id']}), vapid_private_key=str(self.vapid_path), vapid_claims={'sub': os.getenv('VEYA_PUSH_CONTACT', 'https://weiweidesigner.com')}, timeout=15, ttl=3600)
            except WebPushException as exc:
                if exc.response is not None and exc.response.status_code in (404, 410):
                    with self.db() as db:
                        db.execute('DELETE FROM subscriptions WHERE endpoint=? AND owner=?', (target['endpoint'], run['owner']))
                    return
                raise

    def deliver(self):
        with self.db() as db:
            rows = db.execute("SELECT * FROM deliveries WHERE status='pending' AND next_at<=? LIMIT 20", (stamp(now_utc()),)).fetchall()
        for row in rows:
            with self.db() as db:
                run = db.execute('SELECT * FROM runs WHERE id=?', (row['run_id'],)).fetchone()
            try:
                self.send(row, run)
                with self.db() as db:
                    db.execute("UPDATE deliveries SET status='sent',error='' WHERE id=?", (row['id'],))
            except Exception:
                attempts = row['attempts'] + 1
                with self.db() as db:
                    db.execute('UPDATE deliveries SET status=?,attempts=?,next_at=?,error=? WHERE id=?', ('failed' if attempts >= 3 else 'pending', attempts, stamp(now_utc() + dt.timedelta(seconds=60 * 2 ** attempts)), '通知发送失败，请检查机器人配置或浏览器推送网络', row['id']))

    def prune(self):
        with self.db() as db:
            # The homepage has one result. Retain at most twenty recent logs per
            # task and snapshots still needed by the notification outbox.
            db.execute("UPDATE runs SET answer=NULL WHERE status='success' AND id IN (SELECT id FROM (SELECT id,row_number() OVER(PARTITION BY task_id ORDER BY created DESC) AS n FROM runs) WHERE n>20) AND id NOT IN (SELECT success_run FROM tasks WHERE success_run IS NOT NULL) AND id NOT IN (SELECT run_id FROM deliveries WHERE status='pending')")
            db.execute("DELETE FROM deliveries WHERE status!='pending' AND run_id IN (SELECT id FROM (SELECT id,row_number() OVER(PARTITION BY task_id ORDER BY created DESC) AS n FROM runs) WHERE n>20)")
            db.execute("DELETE FROM runs WHERE id IN (SELECT id FROM (SELECT id,row_number() OVER(PARTITION BY task_id ORDER BY created DESC) AS n FROM runs) WHERE n>20) AND id NOT IN (SELECT run_id FROM deliveries) AND id NOT IN (SELECT success_run FROM tasks WHERE success_run IS NOT NULL) AND status NOT IN ('running','queued')")

    def start(self):
        if self.lock_file:
            return
        lock = open(self.directory / 'scheduler.lock', 'a')
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            lock.close()
            return
        self.lock_file = lock
        with self.db() as db:
            db.execute("UPDATE runs SET status='failed',error='服务重启中断执行，请重新运行',finished=? WHERE status='running'", (stamp(now_utc()),))
            db.execute("UPDATE tasks SET active_run=NULL WHERE active_run IN (SELECT id FROM runs WHERE status='failed')")
        def worker():
            while not self.stop_event.is_set():
                try:
                    run = self.claim()
                    if run:
                        self.execute(run)
                        continue
                except Exception:
                    log.exception('Daily task worker failed')
                self.stop_event.wait(2)
        def schedule():
            while not self.stop_event.is_set():
                try:
                    self.tick()
                except Exception:
                    log.exception('Daily scheduler failed')
                self.stop_event.wait(10)
        def notifications():
            while not self.stop_event.is_set():
                try:
                    self.deliver()
                    self.prune()
                except Exception:
                    log.exception('Daily notification worker failed')
                self.stop_event.wait(10)
        for target in (schedule, worker, worker, notifications):
            threading.Thread(target=target, daemon=True, name='veya-day').start()

    def stop(self):
        self.stop_event.set()
        # Retain the lock until the process exits: in-flight daemon workers may
        # still be finishing. The OS releases it safely at process termination.


def create_router(service):
    router = APIRouter(prefix='/api/day')

    def owner(request: Request, response: Response):
        token = request.cookies.get(COOKIE, '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
            token = secrets.token_urlsafe(32)
            response.set_cookie(COOKIE, token, max_age=31536000, httponly=True, secure=request.url.scheme == 'https' or request.headers.get('x-forwarded-proto') == 'https', samesite='strict', path='/')
        response.headers['Cache-Control'] = 'no-store'
        return hashlib.sha256(token.encode()).hexdigest()

    def writer(request, response):
        if request.headers.get('x-veya-day') != '1':
            raise HTTPException(403, '请从 Mentora 任务面板操作')
        if request.headers.get('sec-fetch-site') == 'cross-site':
            raise HTTPException(403, '不支持跨站请求')
        return owner(request, response)

    @router.get('/tasks')
    def tasks(request: Request, response: Response):
        return {'tasks': service.list(owner(request, response)), 'sceneTasks':service.scene_tasks(), 'markets': [market_state(m) for m in MARKETS], 'serverTime': stamp(now_utc()), 'pushPublicKey': service.public_key}

    @router.post('/plan')
    def plan(payload: dict, request: Request, response: Response):
        writer(request, response)
        from app.task_planner import PlanningInput, plan_task
        from pydantic import ValidationError
        try:
            parsed = PlanningInput.model_validate(payload)
        except ValidationError as exc:
            raise HTTPException(422, '任务问句或回答格式无效') from exc
        try:
            return plan_task(parsed)
        except (ValueError, RuntimeError) as exc:
            raise HTTPException(502, str(exc)[:300]) from exc
        except Exception as exc:
            log.warning('Task planning unavailable: %s', type(exc).__name__)
            raise HTTPException(502, '任务配置生成暂时失败，请重试或使用新建任务面板。') from exc

    @router.post('/tasks')
    def add(payload: TaskInput, request: Request, response: Response):
        return service.save(writer(request, response), payload)

    @router.post('/tasks/{task_id}/confirmation')
    def confirmation(task_id: str, request: Request, response: Response):
        user=writer(request,response)
        with service.db() as db:
            row=service.owned(db,user,task_id)
            # Invalidate generated prose when the task's actual configuration changes.
            task=service.unpack(row['config'])
            task['nextAt']=row['next_at']
            key=hashlib.sha256(row['config'].encode()).hexdigest()
            cached=db.execute('SELECT answer FROM task_confirmations WHERE task_id=? AND config_key=?',(task_id,key)).fetchone()
        if cached:return {'answer':cached['answer']}
        from app.task_planner import task_confirmation
        try:
            answer=task_confirmation(task)
        except Exception as exc:
            log.warning('Task confirmation unavailable: %s',type(exc).__name__)
            raise HTTPException(502,'确认答复暂时未能生成，任务已保存，可以重试。') from exc
        with service.db() as db:
            current=service.owned(db,user,task_id)
            if hashlib.sha256(current['config'].encode()).hexdigest()!=key:
                raise HTTPException(409,'任务配置已变更，请重新查看。')
            db.execute('INSERT OR REPLACE INTO task_confirmations(task_id,config_key,answer) VALUES(?,?,?)',(task_id,key,answer))
        return {'answer':answer}

    @router.put('/tasks/{task_id}')
    def edit(task_id: str, payload: TaskInput, request: Request, response: Response):
        return service.save(writer(request, response), payload, task_id)

    @router.post('/tasks/{task_id}/run')
    def run(task_id: str, request: Request, response: Response):
        user = writer(request, response)
        with service.db() as db:
            db.execute('BEGIN IMMEDIATE')
            return {'runId': service.enqueue(db, service.owned(db, user, task_id))}

    @router.delete('/tasks/{task_id}')
    def remove(task_id: str, request: Request, response: Response):
        user = writer(request, response)
        with service.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = service.owned(db, user, task_id)
            if row['active_run']:
                raise HTTPException(409, '请等待任务执行完成再删除')
            db.execute('UPDATE tasks SET deleted=1,next_at=NULL WHERE id=?', (task_id,))
            db.execute("UPDATE deliveries SET status='cancelled' WHERE run_id IN (SELECT id FROM runs WHERE task_id=?) AND status='pending'", (task_id,))
        return {'ok': True}

    @router.get('/tasks/{task_id}/runs')
    def runs(task_id: str, request: Request, response: Response):
        user = owner(request, response)
        with service.db() as db:
            task = service.readable(db, user, task_id)
            rows = db.execute('SELECT id,status,created,finished,error,answer IS NOT NULL AS available FROM runs WHERE task_id=? AND owner=? AND (id IN (SELECT id FROM runs WHERE task_id=? AND owner=? ORDER BY created DESC LIMIT 20) OR id=?) ORDER BY created DESC', (task_id, task['owner'], task_id, task['owner'], task['success_run'])).fetchall()
            return {'runs': [dict(row) for row in rows]}

    @router.get('/tasks/{task_id}/runs/{run_id}')
    def run_result(task_id: str, run_id: str, request: Request, response: Response):
        user = owner(request, response)
        with service.db() as db:
            task = service.readable(db, user, task_id)
            row = db.execute('SELECT * FROM runs WHERE id=? AND task_id=? AND owner=?', (run_id, task_id, task['owner'])).fetchone()
            if not row:
                raise HTTPException(404, '运行记录不存在')
            answer = json.loads(row['answer']) if row['answer'] else None
            snapshot = service.unpack(row['config'])
            return {'taskId': task_id, 'runId': row['id'], 'status': row['status'], 'question': (answer or {}).get('question') or snapshot['question'], 'answer': answer, 'cachedDate': row['finished'] or row['created'], 'error': row['error']}

    @router.get('/tasks/{task_id}/result')
    def result(task_id: str, request: Request, response: Response):
        user = owner(request, response)
        with service.db() as db:
            task = service.readable(db, user, task_id)
            row = db.execute('SELECT * FROM runs WHERE id=?', (task['success_run'],)).fetchone()
            if not row:
                raise HTTPException(404, '还没有成功结果')
            config = service.unpack(row['config'])
            answer = json.loads(row['answer'])
            return {'question': answer.get('question') or config['question'], 'answer': answer, 'cachedDate': row['finished']}

    @router.get('/shared/{token}')
    def shared(token: str, request: Request, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
        with service.db() as db:
            row = db.execute('SELECT r.*, t.config AS current_config FROM result_links l JOIN tasks t ON l.task_id=t.id JOIN runs r ON r.id=t.success_run WHERE l.token=? AND t.deleted=0', (token,)).fetchone()
            if not row:
                raise HTTPException(404, '结果不存在或尚未完成')
            config = service.unpack(row['config'])
            answer = json.loads(row['answer'])
            snapshot = {key: value for key, value in config.items() if key not in SECRET_FIELDS}
            snapshot['id'] = row['task_id']
            visitor = hashlib.sha256(request.cookies.get(COOKIE, '').encode()).hexdigest()
            return {'taskId': row['task_id'], 'runId': row['id'], 'task': snapshot, 'canEdit': visitor == row['owner'], 'title': config['title'], 'question': answer.get('question') or config['question'], 'answer': answer, 'cachedDate': row['finished']}

    @router.post('/subscriptions')
    def subscribe(payload: dict[str, Any], request: Request, response: Response):
        user = writer(request, response)
        p = urlparse(str(payload.get('endpoint', '')))
        allowed = {'fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'wns2-db5p.notify.windows.com'}
        keys = payload.get('keys', {})
        if (p.scheme != 'https' or p.netloc not in allowed or p.username or p.fragment or not p.path
                or not isinstance(keys, dict) or not keys.get('p256dh') or not keys.get('auth') or len(json.dumps(payload)) > 4096):
            raise HTTPException(400, '无效的浏览器推送订阅')
        with service.db() as db:
            if db.execute('SELECT count(*) FROM subscriptions WHERE owner=?', (user,)).fetchone()[0] >= 10:
                db.execute('DELETE FROM subscriptions WHERE owner=? AND endpoint=?', (user, payload['endpoint']))
                if db.execute('SELECT count(*) FROM subscriptions WHERE owner=?', (user,)).fetchone()[0] >= 10:
                    raise HTTPException(400, '最多订阅十个浏览器')
            db.execute('INSERT INTO subscriptions(endpoint,owner,payload) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET owner=excluded.owner,payload=excluded.payload', (payload['endpoint'], user, json.dumps(payload)))
        return {'ok': True}

    @router.get('/service-worker.js')
    def service_worker():
        return Response('''self.addEventListener('push', event => {
          const data = event.data ? event.data.json() : {};
          event.waitUntil(self.registration.showNotification(data.title || 'Mentora 分析已完成', {
            body: data.body || '点击查看最新分析', tag: data.tag, data: {url: data.url}
          }));
        });
        self.addEventListener('notificationclick', event => {
          event.notification.close();
          const target = new URL(event.notification.data.url || self.registration.scope, self.location.origin);
          if (target.origin !== self.location.origin) return;
          event.waitUntil(clients.openWindow(target.href));
        });''', media_type='application/javascript', headers={'Service-Worker-Allowed': os.getenv('AICHART_BASE_PATH', '').rstrip('/') + '/', 'Cache-Control': 'no-store'})

    return router
