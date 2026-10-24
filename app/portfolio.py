"""Real market data, persistent paper ledger, rolling universe scans. No broker calls."""
from __future__ import annotations

import csv
import datetime as dt
import fcntl
import hashlib
import importlib.util
import io
import json
import logging
import math
import os
import re
import secrets
import sqlite3
import statistics
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed, wait
from contextlib import contextmanager, nullcontext
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

import requests
from dateutil.parser import parse as parse_date
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.day_tasks import COOKIE, calendar, market_state
from app.day_presets import SCENE_OWNER

log = logging.getLogger(__name__)
NY = ZoneInfo('America/New_York')
DEFAULTS = dict(maxPositionPct=15.0, riskPct=0.5, reservePct=20.0, stopPct=5.0, slippageBps=10.0, fee=0.0, automatic=False)
PRIORITY = ['SPY','QQQ','AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AMD','AVGO','JPM','XOM','GLD','TLT','IWM','DIA','XLK','XLF','XLE']
STRATEGIES = [
    dict(id='trend', name='均线趋势', rule='最新完整日收盘价 > MA20 > MA60，20 日均成交额达标（美股 1000 万美元 / A 股 1 亿元）', inputs='至少 65 个完整交易日的价格、成交量', cadence='分批扫描，轮次间隔 5 分钟；按上游限速，使用完整日线'),
    dict(id='reversion', name='均值回归', rule='20 日价格 Z 分数 ≤ -2，且收盘价 > MA60；20 日均成交额达标（美股 1000 万美元 / A 股 1 亿元）', inputs='至少 65 个完整交易日的价格、成交量', cadence='同上'),
    dict(id='event', name='事件观察', rule='读取近 7 天成功的美股/A 股定时任务，识别已上市标的；符合量化条件后才可自动买入', inputs='任务来源、运行时间、报告中的标的 + 独立行情验证', cadence='每轮扫描同步任务；文本提及本身不构成买入信号'),
]


def now():
    return dt.datetime.now(dt.timezone.utc)


def stamp(value=None):
    return (value or now()).isoformat()


def cents(value):
    return int((Decimal(str(value)) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def number(value):
    try:
        result = float(re.sub(r'[$,%\s,]', '', str(value)))
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def symbol_value(value):
    symbol = value.strip().upper()
    if re.fullmatch(r'[036]\d{5}', symbol):
        symbol += '.SH' if symbol.startswith('6') else '.SZ'
    if not re.fullmatch(r'[A-Z][A-Z0-9.-]{0,9}|\d{6}\.(?:SH|SZ|BJ)', symbol):
        raise ValueError('请输入带市场的交易代码，如 AAPL、600519.SH')
    return symbol


class MarketData:
    """Reuse business-chart AInvest history; Nasdaq supplies latest quote metadata."""
    def __init__(self):
        path = Path(__file__).parent / 'skills/business-chart-recall/scripts/kline.py'
        spec = importlib.util.spec_from_file_location('portfolio_business_history', path)
        self.business = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.business)
        self.guard = threading.Lock()
        self.cache = {}

    @staticmethod
    def nasdaq(url):
        r = requests.get(url, headers={'User-Agent':'Mozilla/5.0', 'Accept':'application/json', 'Origin':'https://www.nasdaq.com', 'Referer':'https://www.nasdaq.com/'}, timeout=15)
        r.raise_for_status()
        return r.json()

    def quote(self, symbol, asset='stocks', fresh=False):
        symbol = symbol_value(symbol)
        key = ('quote', symbol)
        with self.guard:
            cached = self.cache.get(key)
        if cached and not fresh and time.monotonic() - cached[0] < 60:
            return dict(cached[1])
        data = self.nasdaq(f'https://api.nasdaq.com/api/quote/{symbol}/info?assetclass={asset}').get('data') or {}
        p = data.get('primaryData') or {}
        price = number(p.get('lastSalePrice'))
        raw = p.get('lastTradeTimestamp') or ''
        if not price or price <= 0 or not raw:
            raise ValueError('行情源暂未返回有效价格和时间，请稍后重试')
        # Date-only quote metadata is a close reference, never labelled intraday.
        date_only = not bool(re.search(r'\d:\d', raw))
        try:
            cleaned = re.sub(r'\s+(ET|EST|EDT)$', '', raw.strip())
            at = parse_date(cleaned).replace(tzinfo=NY)
            if date_only:
                at = at.replace(hour=16, minute=0, second=0)
        except Exception:
            raise ValueError('无法校验行情时间，暂不生成交易')
        quote = dict(symbol=symbol, name=data.get('companyName') or symbol, price=price, priceAt=stamp(at), priceDate=at.date().isoformat(), dateOnly=date_only, fetchedAt=stamp(), currency='USD', source='Nasdaq quote API', sourceUrl=f'https://www.nasdaq.com/market-activity/{asset}/{symbol.lower()}', marketStatus=data.get('marketStatus') or 'Unknown', realTime=p.get('isRealTime') is True, changePct=number(p.get('percentageChange')))
        quote['tradable'], quote['limitation'] = self.freshness(quote)
        with self.guard:
            self.cache[key] = (time.monotonic(), quote)
        return dict(quote)

    @staticmethod
    def freshness(quote):
        current = now()
        at = dt.datetime.fromisoformat(quote['priceAt'])
        try:
            cal = calendar('US')
            today = current.astimezone(NY).date()
            sessions = cal.sessions_in_range(today - dt.timedelta(days=12), today)
            completed = [s for s in sessions if cal.session_close(s).to_pydatetime() <= current]
            if not completed:
                return False, '无法确定最近交易日'
            last_close = completed[-1].date()
            state = market_state('US', current)
            if state.get('calendarError'):
                return False, '交易日历暂不可用'
            if state['stage'] == 'live':
                if quote['dateOnly'] or (current - at).total_seconds() > 20*60 or at > current + dt.timedelta(minutes=2):
                    return False, '盘中行情超过 20 分钟或缺少成交时间，请刷新'
            elif at.date() < last_close or at > current + dt.timedelta(hours=1):
                return False, '行情早于最近已完成的交易日，暂不成交'
            return True, '按最新可用价格记录；休市时使用最近收盘价' if quote['dateOnly'] else '按数据源最新成交价记录；可能存在行情延迟'
        except Exception:
            return False, '无法校验行情新鲜度，暂不成交'

    def history(self, symbol):
        key = ('history', symbol, now().astimezone(NY).date().isoformat())
        with self.guard:
            cached = self.cache.get(key)
        if cached and time.monotonic() - cached[0] < 1800:
            return cached[1]
        bars=self.business.fetch_ainvest_rows({'adjustType':'forward'},symbol,'1d',132,6)
        rows = []
        cal = calendar('US')
        current = now()
        for bar in bars:
            value=bar['time'];text=str(value)
            if len(text)==8 and text.isdigit():date=dt.datetime.strptime(text,'%Y%m%d').date()
            elif isinstance(value,(int,float)):date=dt.datetime.fromtimestamp(value/(1000 if value>1e12 else 1),NY).date()
            else:date=dt.date.fromisoformat(text[:10])
            if not cal.is_session(date) or cal.session_close(date).to_pydatetime() > current:
                continue
            close = number(bar.get('close'))
            volume = number(bar.get('volume'))
            adj = close
            if close and close > 0 and volume is not None:
                rows.append(dict(date=date.isoformat(), open=number(bar.get('open')), close=close, adjusted=adj, volume=volume))
        rows.sort(key=lambda r:r['date'])
        if len(rows)<65:raise ValueError('AInvest 完整历史行情不足 65 日，未生成回测数据')
        result = dict(rows=rows, source='AInvest business K-line / forward adjustment', adjusted=True,currency='USD',market='US')
        with self.guard:
            self.cache[key] = (time.monotonic(), result)
        return result


def signals(history):
    rows = history['rows']
    if len(rows) < 65:
        raise ValueError('完整交易日不足 65 日')
    cal=calendar(history.get('market','US'))
    today=now().date()
    completed=[session for session in cal.sessions_in_range(today-dt.timedelta(days=20),today) if cal.session_close(session).to_pydatetime()<=now()]
    if not completed or dt.date.fromisoformat(rows[-1]['date'])<completed[-1].date():
        raise ValueError('日线数据过期')
    prices = [r['adjusted'] if history['adjusted'] else r['close'] for r in rows]
    if not history['adjusted'] and any(abs(prices[i] / prices[i-1] - 1) > 0.35 for i in range(1,len(prices))):
        raise ValueError('未复权数据疑似除权或剧烈跳变，跳过策略计算')
    p, ma20, ma60 = prices[-1], statistics.mean(prices[-20:]), statistics.mean(prices[-60:])
    std = statistics.pstdev(prices[-20:])
    z = (p-ma20)/std if std else 0
    turnover = statistics.mean(r.get('turnover') or r['close']*r['volume'] for r in rows[-20:])
    found = []
    if turnover >= (100_000_000 if history.get('market')=='CN' else 10_000_000):
        if p > ma20 > ma60:
            found.append('trend')
        if z <= -2 and p > ma60:
            found.append('reversion')
    return dict(strategies=found, asOf=rows[-1]['date'], source=history['source'], adjusted=history['adjusted'], ma20=round(ma20,4), ma60=round(ma60,4), z=round(z,3), turnover=round(turnover), return20=round((p/prices[-21]-1)*100,2), lastClose=rows[-1]['close'], currency=history.get('currency','USD'), market=history.get('market','US'))


class PlanInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=10)
    side: Literal['buy','sell'] = 'buy'
    quantity: int | None = Field(default=None, ge=1, le=10_000_000)
    strategy: Literal['manual','trend','reversion','event'] = 'manual'
    decisionId: str | None = Field(default=None,max_length=64)
    userInstruction: str = Field(default='',max_length=2000)
    maxSpendUsd: float | None = Field(default=None,gt=0,allow_inf_nan=False)


class SettingsInput(BaseModel):
    maxPositionPct: float = Field(default=15, ge=1, le=100, allow_inf_nan=False)
    riskPct: float = Field(default=.5, ge=.05, le=5, allow_inf_nan=False)
    reservePct: float = Field(default=20, ge=0, le=95, allow_inf_nan=False)
    stopPct: float = Field(default=5, ge=.5, le=50, allow_inf_nan=False)
    slippageBps: float = Field(default=10, ge=0, le=200, allow_inf_nan=False)
    fee: float = Field(default=0, ge=0, le=100, allow_inf_nan=False)
    automatic: bool = False


class InvestmentPreferencesInput(BaseModel):
    markets: list[Literal['CN','US']] = Field(default_factory=list,max_length=2)
    styles: list[Literal['value','growth','dividend','trend','balanced']] = Field(default_factory=list,max_length=5)
    horizon: Literal['','short','medium','long'] = ''
    targetReturnPct: float | None = Field(default=None,ge=0,le=1000,allow_inf_nan=False)
    maxDrawdownPct: float | None = Field(default=None,ge=0,le=100,allow_inf_nan=False)
    confidenceThresholdPct: float | None = Field(default=None,ge=10,le=100,allow_inf_nan=False)


class InvestmentProfileInput(BaseModel):
    profile: str = Field(default='',max_length=4000)
    investment: InvestmentPreferencesInput | None = None


class WorkflowStateInput(BaseModel):
    enabled: bool


class TradingIdeaInput(BaseModel):
    question: str = Field(min_length=2,max_length=2000)


class CustomStrategyInput(BaseModel):
    id: str = Field(pattern=r'^custom(?::[A-Za-z0-9_-]{1,64})?$')
    name: str = Field(min_length=1,max_length=60)
    code: str = Field(max_length=12000)
    description: str = Field(default='',max_length=4000)


class StrategyGenerationInput(BaseModel):
    id: str = Field(pattern=r'^custom(?::[A-Za-z0-9_-]{1,64})?$')
    name: str = Field(min_length=1,max_length=60)
    enabled: bool = True
    description: str = Field(min_length=2,max_length=4000)
    code: str = Field(default='',max_length=12000)


class StrategySettingsInput(BaseModel):
    enabled: list[str] = Field(default_factory=lambda:['trend','reversion'],min_length=1,max_length=28)
    customStrategies: list[CustomStrategyInput] | None = Field(default=None,max_length=20)
    customName: str = Field(default='自定义策略',min_length=1,max_length=60)
    customCode: str = Field(default='',max_length=12000)


class FavoriteInput(BaseModel):
    symbol: str = Field(min_length=1,max_length=80)
    name: str | None = Field(default=None,max_length=120)


class TradeNotifications:
    """Observe committed paper-ledger versions and bridge a durable outbox to Feishu."""
    def __init__(self, service):
        self.service = service
        self.lock = threading.Lock()
        with service.db() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('CREATE TABLE IF NOT EXISTS trade_notice_versions(owner TEXT, trade_id TEXT, fingerprint TEXT, voided INTEGER, PRIMARY KEY(owner,trade_id))')
            db.execute("CREATE TABLE IF NOT EXISTS trade_notice_outbox(id TEXT PRIMARY KEY, owner TEXT NOT NULL, notification TEXT NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending')")
            if not db.execute("SELECT 1 FROM state WHERE key='tradeNoticeBaseline'").fetchone():
                for row in db.execute('SELECT * FROM trades').fetchall():
                    trade = json.loads(row['payload'])
                    db.execute('INSERT OR IGNORE INTO trade_notice_versions VALUES(?,?,?,?)',
                               (row['owner'], row['id'], self.fingerprint(trade), bool(trade.get('voided'))))
                db.execute('INSERT INTO state VALUES(?,?)', ('tradeNoticeBaseline', stamp()))

    @staticmethod
    def fingerprint(trade):
        return hashlib.sha256(json.dumps(trade, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

    @staticmethod
    def money(value):
        return '暂无估值' if value is None else f'{value:,.2f}'

    def body(self, changes, account):
        lines = ['Mentora Deal · 模拟交易记录更新', '持仓快照时间（北京时间）：' + now().astimezone(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M:%S')]
        for trade, previous in changes:
            event = '成交' if previous is None else '撤销' if trade.get('voided') else '恢复' if previous['voided'] else '记录变更'
            currency = trade.get('nativeCurrency', 'USD')
            price = trade.get('nativePrice', trade.get('price') if currency == 'USD' else None)
            lines.append(f"{event}｜{'买入' if trade['side']=='buy' else '卖出'} {trade['symbol']} · {trade['quantity']} 股 · {currency} {self.money(price)}")
            lines.append('成交时间：' + str(trade.get('created', '未知')))
            reason = trade.get('voidReason') if trade.get('voided') else trade.get('decisionReason')
            if reason: lines.append('原因：' + str(reason)[:500])
        lines.extend(['', '当前持仓明细（成本、市值及盈亏统一为 USD）'])
        for position in sorted(account['positions'], key=lambda p: p['symbol']):
            quote = position.get('quote') or {}
            lines.append(f"{position['symbol']} {quote.get('name', '')}｜持仓 {position['quantity']} · 可卖 {position['availableToSell']} · 均价 {self.money(position['averageCost'])} · 成本 {self.money(position['cost'])} · 市值 {self.money(position['marketValue'])} · 浮盈亏 {self.money(position['unrealized'])}")
            lines.append(f"报价：{quote.get('priceAt') or '暂无'}{'（已过期）' if position['stale'] else ''}")
        if not account['positions']: lines.append('当前空仓')
        lines.extend(['', f"账户汇总（USD）｜可用现金 {self.money(account['cash'])} · 总资产 {self.money(account['equity'])} · 已实现盈亏 {self.money(account['realized'])} · 持仓浮盈亏 {self.money(account['unrealized'])}"])
        if not account['valuationComplete']: lines.append('部分持仓报价过期或缺失，估值仅供参考。')
        return '\n'.join(lines)

    def capture(self, owner):
        # Snapshot and version checks are serialized across processes, after fills commit.
        with self.service.db() as db:
            db.execute('BEGIN IMMEDIATE')
            changes = []
            for row in db.execute('SELECT id,payload FROM trades WHERE owner=? ORDER BY created,id', (owner,)).fetchall():
                trade = json.loads(row['payload'])
                previous = db.execute('SELECT * FROM trade_notice_versions WHERE owner=? AND trade_id=?', (owner, row['id'])).fetchone()
                fingerprint = self.fingerprint(trade)
                if previous and previous['fingerprint'] == fingerprint: continue
                changes.append((trade, dict(previous) if previous else None))
            if not changes: return
            account = self.service.summary(owner, _snapshot_db=db)
            body = self.body(changes, account)
            key = str(uuid.uuid5(uuid.NAMESPACE_URL, 'trade-notice:' + owner + ':' + ':'.join(t['id'] + self.fingerprint(t) for t, _ in changes)))
            # Feishu text messages have a byte limit. Preserve all holdings in ordered parts.
            chunks = ['']
            for line in body.splitlines():
                if len((chunks[-1] + line).encode()) > 12000: chunks.append('')
                chunks[-1] += line + '\n'
            for index, chunk in enumerate(chunks):
                notification = dict(title='模拟交易记录更新', body=chunk.strip(), path='/?tab=portfolio&portfolioView=trades', linkLabel='查看交易记录与持仓')
                if len(chunks) > 1: notification['body'] = f'模拟交易更新（{index+1}/{len(chunks)}）\n' + notification['body']
                db.execute('INSERT OR IGNORE INTO trade_notice_outbox(id,owner,notification,created) VALUES(?,?,?,?)', (key + ':' + str(index), owner, json.dumps(notification, ensure_ascii=False), stamp()))
            for trade, _ in changes:
                db.execute('INSERT OR REPLACE INTO trade_notice_versions VALUES(?,?,?,?)', (owner, trade['id'], self.fingerprint(trade), bool(trade.get('voided'))))

    def binding(self, owner):
        tasks = self.service.tasks
        with tasks.db() as db:
            rows = db.execute('SELECT config FROM tasks WHERE owner=? AND deleted=0', (owner,)).fetchall()
        bindings = {}
        for row in rows:
            config = tasks.unpack(row['config'])
            if config.get('feishu') and config.get('feishuUrl'):
                if config.get('_portfolioKind') == 'events': return config
                bindings[config['feishuUrl']] = config
        # Never guess a destination for private account data.
        return next(iter(bindings.values())) if len(bindings) == 1 else None

    def drain(self, owner):
        tasks = self.service.tasks
        if tasks is None: return
        config = self.binding(owner)
        if config is None: return
        with self.service.db() as db:
            rows = db.execute("SELECT * FROM trade_notice_outbox WHERE owner=? AND status='pending' ORDER BY created,id", (owner,)).fetchall()
        for row in rows:
            encrypted = tasks.pack(config)
            notification = json.loads(row['notification'])
            with tasks.db() as db:
                db.execute('BEGIN IMMEDIATE')
                db.execute('INSERT OR IGNORE INTO runs(id,task_id,owner,config,status,created,finished,answer) VALUES(?,?,?,?,?,?,?,?)',
                           (row['id'], 'mentora-deal-trades:' + owner, owner, encrypted, 'success', row['created'], row['created'], json.dumps({'interpretation': notification['body']}, ensure_ascii=False)))
                target = dict(notification=notification, notificationConfig=encrypted)
                db.execute('INSERT OR IGNORE INTO deliveries(id,run_id,owner,channel,target,next_at) VALUES(?,?,?,?,?,?)',
                           (row['id'] + ':feishu', row['id'], owner, 'feishu', json.dumps(target, ensure_ascii=False), stamp()))
            with self.service.db() as db:
                db.execute("UPDATE trade_notice_outbox SET status='queued' WHERE id=?", (row['id'],))

    def notify(self, owner):
        try:
            with self.lock:
                self.capture(owner)
                self.drain(owner)
        except Exception:
            # A notification failure must never turn a committed fill into an order failure.
            log.exception('Paper trade notification enqueue failed')

    def run(self):
        while not self.service.stop_event.is_set():
            try:
                with self.service.db() as db:
                    owners = [r['owner'] for r in db.execute('SELECT owner FROM accounts')]
                for owner in owners: self.notify(owner)
            except Exception:
                log.exception('Paper trade notification observer failed')
            self.service.stop_event.wait(10)


class Portfolio:
    def __init__(self, directory, tasks=None, market=None):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = self.directory / 'portfolio.sqlite3'
        if market is None:
            from app.portfolio_data import MarketDataHub
            market = MarketDataHub()
        self.tasks, self.market = tasks, market
        self.stop_event = threading.Event()
        self.market.stop_event=self.stop_event
        self.scan_guard = threading.Lock()
        self.thread = None
        self.lock_file = None
        with self.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS accounts(owner TEXT PRIMARY KEY, initial INTEGER NOT NULL, cash INTEGER NOT NULL, realized INTEGER NOT NULL DEFAULT 0, settings TEXT NOT NULL, created TEXT NOT NULL, automation_error TEXT NOT NULL DEFAULT '');
            CREATE TABLE IF NOT EXISTS positions(owner TEXT NOT NULL, symbol TEXT NOT NULL, quantity INTEGER NOT NULL, cost INTEGER NOT NULL, PRIMARY KEY(owner,symbol));
            CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS plan_owner ON plans(owner,created);
            CREATE TABLE IF NOT EXISTS trades(id TEXT PRIMARY KEY, owner TEXT NOT NULL, plan_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, created TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS trade_owner ON trades(owner,created);
            CREATE TABLE IF NOT EXISTS quotes(symbol TEXT PRIMARY KEY, payload TEXT NOT NULL, updated TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS universe(symbol TEXT PRIMARY KEY, name TEXT NOT NULL, asset TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS scans(symbol TEXT PRIMARY KEY, payload TEXT NOT NULL, updated TEXT NOT NULL, error TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS snapshots(owner TEXT NOT NULL, day TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,day));
            CREATE TABLE IF NOT EXISTS auto_signals(owner TEXT NOT NULL, signal TEXT NOT NULL, plan_id TEXT NOT NULL, PRIMARY KEY(owner,signal));
            ''')
        os.chmod(self.path, 0o600)
        from app.portfolio_workflow import PortfolioWorkflow
        self.workflow=PortfolioWorkflow(self)
        self.trade_notifications=TradeNotifications(self)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        try:
            with db:
                yield db
        finally:
            db.close()

    def account(self, owner):
        with self.db() as db:
            db.execute('INSERT OR IGNORE INTO accounts(owner,initial,cash,settings,created) VALUES(?,?,?,?,?)', (owner,100_000_000,100_000_000,json.dumps(DEFAULTS),stamp()))
            return dict(db.execute('SELECT * FROM accounts WHERE owner=?',(owner,)).fetchone())

    def setting(self, owner, settings):
        self.account(owner)
        with self.db() as db:
            db.execute('UPDATE accounts SET settings=? WHERE owner=?',(json.dumps(settings),owner))
        return settings

    def quote(self, symbol, fresh=False):
        with self.db() as db:
            listing = db.execute('SELECT * FROM universe WHERE symbol=?',(symbol,)).fetchone()
        if listing is None and re.fullmatch(r'\d{6}\.(?:SH|SZ|BJ)',symbol) and hasattr(self.market,'cn'):
            # Exact metadata resolution allows manual and task symbols before their universe page arrives.
            name=self.market.resolve_name(symbol,priority=True) if hasattr(self.market,'resolve_name') else self.market.cn.fetch_stock_name(symbol)
            with self.db() as db:
                db.execute('INSERT OR IGNORE INTO universe VALUES(?,?,?)',(symbol,name,'ashare'))
                listing=db.execute('SELECT * FROM universe WHERE symbol=?',(symbol,)).fetchone()
        if listing is None:
            raise ValueError('当前标的不在已同步的美股/A 股/ETF 标的目录中；请等待目录同步或检查交易代码')
        q = self.market.quote(symbol, listing['asset'], fresh=fresh)
        q['name']=listing['name']
        if q.get('currency') != 'USD' or not math.isfinite(q['price']) or q['price'] <= 0:
            raise ValueError('无有效美元报价')
        with self.db() as db:
            db.execute('INSERT OR REPLACE INTO quotes VALUES(?,?,?)',(symbol,json.dumps(q),stamp()))
        return q

    def summary(self, owner, *, _snapshot_db=None):
        account = dict(_snapshot_db.execute('SELECT * FROM accounts WHERE owner=?',(owner,)).fetchone()) if _snapshot_db is not None else self.account(owner)
        with (nullcontext(_snapshot_db) if _snapshot_db is not None else self.db()) as db:
            positions = [dict(x) for x in db.execute('SELECT * FROM positions WHERE owner=? AND quantity>0',(owner,))]
            quotes = {x['symbol']:json.loads(x['payload']) for x in db.execute('SELECT * FROM quotes')}
            trades = [trade for x in db.execute('SELECT payload FROM trades WHERE owner=? ORDER BY created DESC LIMIT 300',(owner,)) if not (trade:=json.loads(x['payload'])).get('voided')]
            plans = [dict(json.loads(x['payload']),status=x['status']) for x in db.execute('SELECT * FROM plans WHERE owner=? ORDER BY created DESC LIMIT 60',(owner,))]
            history = [json.loads(x['payload']) for x in db.execute('SELECT payload FROM snapshots WHERE owner=? ORDER BY day',(owner,))]
            native_costs={}
            for row in db.execute('SELECT payload FROM trades WHERE owner=? ORDER BY created,rowid',(owner,)):
                trade=json.loads(row['payload'])
                if trade.get('voided'):continue
                symbol=trade['symbol'];qty=trade['quantity']
                ledger=native_costs.setdefault(symbol,{'quantity':0,'cost':0.,'known':True})
                if trade['side']=='buy':
                    price=trade.get('nativePrice');currency=trade.get('nativeCurrency','USD')
                    if price is None and currency=='USD':price=trade['price']
                    rate=((trade.get('quote') or {}).get('fx') or {}).get('rate') or (1 if currency=='USD' else None)
                    if price is None or rate is None:ledger['known']=False
                    else:ledger['cost']+=price*qty+trade.get('fee',0)/rate
                    ledger['quantity']+=qty
                elif ledger['quantity']:
                    ledger['cost']*=max(0,ledger['quantity']-qty)/ledger['quantity'];ledger['quantity']=max(0,ledger['quantity']-qty)
            state = dict(db.execute('SELECT key,value FROM state'))
            coverage = db.execute("SELECT count(*) total, sum(CASE WHEN error='' THEN 1 ELSE 0 END) valid FROM scans").fetchone()
            universe = db.execute('SELECT count(*) FROM universe').fetchone()[0]
        value, cost, complete = 0, 0, True
        for p in positions:
            q = quotes.get(p['symbol'])
            # A cached position mark remains visible with its timestamp; missing marks never become zero.
            mark = cents(q['price']*p['quantity']) if q else None
            usable = bool(q) and self.market.freshness(q)[0]
            complete = complete and usable
            p.update(availableToSell=self.available_to_sell(owner,p['symbol'],p['quantity'],_snapshot_db),cost=p['cost']/100, averageCost=p['cost']/100/p['quantity'], quote=q, marketValue=mark/100 if mark is not None else None, unrealized=(mark-p['cost'])/100 if mark is not None else None, stale=not usable)
            ledger=native_costs.get(p['symbol'],{})
            native_cost=ledger.get('cost') if ledger.get('known') and ledger.get('quantity')==p['quantity'] else None
            currency=(q or {}).get('nativeCurrency','USD');native_price=(q or {}).get('nativePrice',(q or {}).get('price') if currency=='USD' else None)
            p.update(nativeCurrency=currency,nativeAverageCost=native_cost/p['quantity'] if native_cost is not None else p['averageCost'] if currency=='USD' else None,
                     nativeMarketValue=native_price*p['quantity'] if native_price is not None else None,
                     nativeUnrealized=native_price*p['quantity']-native_cost if native_price is not None and native_cost is not None else p['unrealized'] if currency=='USD' else None)
            cost += cents(p['cost'])
            if mark is not None:
                value += mark
        equity = account['cash'] + value if all(p['marketValue'] is not None for p in positions) else None
        return dict(initial=account['initial']/100, cash=account['cash']/100, equity=equity/100 if equity is not None else None, marketValue=value/100 if equity is not None else None, unrealized=(value-cost)/100 if equity is not None else None, realized=account['realized']/100, totalReturn=(equity/account['initial']-1)*100 if equity is not None else None, positions=positions, trades=trades, plans=plans, history=history, settings=json.loads(account['settings']), valuationComplete=complete, automationError=account['automation_error'], universeCount=universe, scannedCount=coverage['total'], validCount=coverage['valid'] or 0, scan=state, serverTime=stamp(), mode='paper', currency='USD', strategies=STRATEGIES)

    @staticmethod
    def order_skill():
        from app.portfolio_data import load_skill
        return load_skill('portfolio-order/scripts/order.py','portfolio_order_skill')

    def make_plan(self, owner, payload, auto_signal=None):
        return self.order_skill().make_plan(self,owner,payload,auto_signal)

    def execute(self, owner, plan_id):
        trade = self.order_skill().execute(self,owner,plan_id)
        self.trade_notifications.notify(owner)
        return trade

    def void_low_confidence_trades(self, owner, trade_ids, reason=None):
        arguments=(self,owner,trade_ids) if reason is None else (self,owner,trade_ids,reason)
        result = self.order_skill().void_low_confidence_trades(*arguments)
        self.trade_notifications.notify(owner)
        return result

    def sync_universe(self):
        with self.db() as db:
            last = db.execute("SELECT value FROM state WHERE key='universeAt'").fetchone()
        if last and (now()-dt.datetime.fromisoformat(last['value'])).total_seconds()<86400:
            return
        r = requests.get('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt',timeout=20)
        r.raise_for_status()
        listings = []
        for row in csv.DictReader(io.StringIO(r.text),delimiter='|'):
            symbol = row.get('Symbol','')
            if row.get('Test Issue')!='N' or row.get('Nasdaq Traded')!='Y' or not re.fullmatch(r'[A-Z][A-Z0-9.]{0,9}',symbol):
                continue
            listings.append((symbol,row['Security Name'],'etf' if row.get('ETF')=='Y' else 'stocks'))
        if len(listings)<1000:
            raise ValueError('上市目录返回不完整，保留上次目录')
        with self.db() as db:
            db.execute("DELETE FROM universe WHERE asset!='ashare'")
            db.executemany('INSERT INTO universe VALUES(?,?,?)',listings)
            db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('universeAt',stamp()))

    def sync_cn_universe(self):
        if not hasattr(self.market,'cn_page'):
            return
        try:
            with self.db() as db:
                row=db.execute("SELECT value FROM state WHERE key='cnOffset'").fetchone()
            offset=int(row['value']) if row else 0
            envelope=self.market.cn_page(offset)
            data=envelope.get('data') or {}
            items=data.get('item') or []
            total=int(data.get('total') or 0)
            listings=[(x['thscode'],x['thscode'],'ashare') for x in items if re.fullmatch(r'\d{6}\.(?:SH|SZ|BJ)',x.get('thscode',''))]
            if not listings:
                raise ValueError('A-share directory empty')
            with self.db() as db:
                db.executemany('INSERT OR REPLACE INTO universe VALUES(?,?,?)',listings)
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('cnOffset',str(0 if offset+len(items)>=total else offset+len(items))))
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('cnTotal',str(total)))
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('cnAt',stamp()))
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('cnError',''))
        except Exception:
            with self.db() as db:
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('cnError','A 股快照目录暂不可用，保留已有数据'))
            log.warning('A-share directory unavailable')

    def available_to_sell(self,owner,symbol,quantity,db=None):
        if not symbol[0].isdigit():return quantity
        if db is None:
            with self.db() as connection:return self.available_to_sell(owner,symbol,quantity,connection)
        today=now().astimezone(ZoneInfo('Asia/Shanghai')).date()
        bought=0
        for row in db.execute('SELECT payload FROM trades WHERE owner=?',(owner,)):
            trade=json.loads(row['payload'])
            if trade.get('voided'):continue
            if trade['symbol']==symbol and trade['side']=='buy' and dt.datetime.fromisoformat(trade['created']).astimezone(ZoneInfo('Asia/Shanghai')).date()==today:
                bought+=trade['quantity']
        return max(0,quantity-bought)

    def task_sources(self, owner):
        if not self.tasks:
            return []
        with self.tasks.db() as db:
            rows = db.execute("SELECT t.id,t.owner,r.config,r.answer,r.finished,r.id run_id FROM tasks t JOIN runs r ON r.id=t.success_run WHERE t.owner IN (?,?) AND t.deleted=0 AND json_extract(r.config,'$._portfolioKind') IS NULL AND r.finished>? ORDER BY r.finished DESC LIMIT 30",(owner,SCENE_OWNER,stamp(now()-dt.timedelta(days=7)))).fetchall()
        with self.db() as db:
            universe = {r['symbol'] for r in db.execute('SELECT symbol FROM universe')}
        sources = []
        for row in rows:
            config = self.tasks.unpack(row['config'])
            if config.get('market') not in {'US','CN'}:
                continue
            answer = json.loads(row['answer'])
            text = config.get('symbols','')+' '+str(answer.get('interpretation',''))
            # Only recognized listings; no model-generated prices, sentiment, or buy directions.
            tickers = set(re.findall(r'(?<![A-Za-z0-9])\$?([A-Z][A-Z0-9.]{0,9})(?![A-Za-z0-9])',text)) & universe
            # Avoid English acronyms being treated as report stock mentions unless explicitly tagged.
            if config.get('market')=='CN':
                for code in re.findall(r'(?<!\d)([036]\d{5})(?:\.(SH|SZ))?(?!\d)',text):
                    tickers.add(code[0]+'.'+(code[1] or ('SH' if code[0].startswith('6') else 'SZ')))
                # Full A-share identifiers are verified against the provider before analysis/order.
                tickers={s for s in tickers if s in universe or re.fullmatch(r'\d{6}\.(?:SH|SZ|BJ)',s)}
            explicit = set(re.findall(r'[A-Z][A-Z0-9.]{0,9}',config.get('symbols','').upper()))
            for s in sorted(tickers):
                if not s[0].isdigit() and s not in explicit and not re.search(r'(?:\$|NASDAQ:|NYSE:)'+re.escape(s)+r'\b|\('+re.escape(s)+r'\)',text):
                    continue
                sources.append(dict(symbol=s, taskId=row['id'], runId=row['run_id'], title=config['title'], at=row['finished'], kind='task-mention'))
        return sources

    def opportunities(self, owner):
        sources = self.task_sources(owner)
        by_symbol = {}
        for s in sources:
            by_symbol.setdefault(s['symbol'],[]).append(s)
        with self.db() as db:
            rows = db.execute("SELECT s.*,u.name FROM scans s JOIN universe u USING(symbol) WHERE s.error='' ORDER BY s.updated DESC").fetchall()
        items = []
        for row in rows:
            p = json.loads(row['payload'])
            if (now()-dt.datetime.fromisoformat(row['updated'])).total_seconds()>86400:
                continue
            if p['strategies'] or row['symbol'] in by_symbol:
                items.append(dict(p,symbol=row['symbol'],name=row['name'],sources=by_symbol.get(row['symbol'],[]),scannedAt=row['updated'],eligible=bool(p['strategies'])))
        represented = {x['symbol'] for x in items}
        for symbol, refs in by_symbol.items():
            if symbol not in represented:
                items.append(dict(symbol=symbol,name=symbol,strategies=[],sources=refs,eligible=False,limitation='等待行情和策略验证'))
        items.sort(key=lambda x:(not x['eligible'],not bool(x['sources']),-x.get('return20',0)))
        return items[:150]

    def scan_one(self, symbol):
        if self.stop_event.is_set():return
        try:
            payload = signals(self.market.history(symbol))
            error = ''
            if payload['strategies'] and symbol[0].isdigit() and hasattr(self.market,'cn'):
                try:
                    name=self.market.resolve_name(symbol) if hasattr(self.market,'resolve_name') else self.market.cn.fetch_stock_name(symbol)
                    with self.db() as db:db.execute('UPDATE universe SET name=? WHERE symbol=?',(name,symbol))
                except Exception:pass
        except Exception:
            payload,error = {},'日线不可用、过期或不满足数据质量要求'
        if self.stop_event.is_set():return
        with self.db() as db:
            db.execute('INSERT OR REPLACE INTO scans VALUES(?,?,?,?)',(symbol,json.dumps(payload),stamp(),error))

    def scan(self, requested=()):
        if not self.scan_guard.acquire(blocking=False):
            return
        try:
            try:
                self.sync_universe()
            except Exception:
                log.warning('US directory refresh failed; retaining previous coverage')
            self.sync_cn_universe()
            if hasattr(self.market,'cn'):
                for symbol in ['600519.SH','000001.SZ','300750.SZ']:
                    with self.db() as db:listing=db.execute('SELECT 1 FROM universe WHERE symbol=?',(symbol,)).fetchone()
                    if not listing:
                        try:
                            name=self.market.resolve_name(symbol) if hasattr(self.market,'resolve_name') else self.market.cn.fetch_stock_name(symbol)
                            with self.db() as db:db.execute('INSERT OR IGNORE INTO universe VALUES(?,?,?)',(symbol,name,'ashare'))
                        except Exception:pass
            with self.db() as db:
                # Oldest first advances through the entire supported listing directory.
                page = [r['symbol'] for r in db.execute('SELECT u.symbol FROM universe u LEFT JOIN scans s USING(symbol) ORDER BY COALESCE(s.updated,\'\'),u.symbol LIMIT 40')]
                known = {r['symbol'] for r in db.execute('SELECT symbol FROM universe')}
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('scanStatus','running'))
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('scanStarted',stamp()))
            selected = list(dict.fromkeys([s for s in requested if s in known][:30]+[s for s in PRIORITY+['600519.SH','000001.SZ','300750.SZ'] if s in known]+page))[:100]
            with ThreadPoolExecutor(max_workers=4) as pool:
                for f in as_completed([pool.submit(self.scan_one,s) for s in selected]):
                    f.result()
            with self.db() as db:
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('scanAt',stamp()))
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('scanStatus','idle'))
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('scanError',''))
        except Exception:
            log.exception('Portfolio universe scan failed')
            with self.db() as db:
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('scanError','市场目录或行情源暂不可用，稍后自动重试'))
                db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('scanStatus','error'))
        finally:
            self.scan_guard.release()

    def refresh(self, owner, *, include_favorites=False):
        """Refresh the account positions within a bounded wait.

        Candidate-pool quotes are research data and are refreshed by their own
        workflow steps. Pulling the whole candidate pool here made a simple
        account read repeat up to 100 network requests before it could return.
        """
        self.account(owner)
        with self.db() as db:
            symbols = [r['symbol'] for r in db.execute('SELECT symbol FROM positions WHERE owner=? AND quantity>0',(owner,))]
        symbols = list(dict.fromkeys(symbols))
        failures = []
        pool = ThreadPoolExecutor(max_workers=4)
        jobs = {pool.submit(self.quote,s,True):s for s in symbols}
        try:
            done,pending = wait(jobs,timeout=30)
            for job in done:
                try:
                    job.result()
                except Exception:
                    failures.append(jobs[job])
            for job in pending:
                job.cancel();failures.append(jobs[job])
        finally:
            pool.shutdown(wait=False,cancel_futures=True)
        if include_favorites:failures.extend(self.workflow.refresh_favorites(owner))
        summary = self.summary(owner)
        if summary['valuationComplete']:
            day = now().astimezone(NY).date().isoformat()
            snapshot = dict(day=day,equity=summary['equity'],marketValue=summary['marketValue'],cash=summary['cash'],realized=summary['realized'],unrealized=summary['unrealized'],profit=round(summary['equity']-summary['initial'],2),returnPct=summary['totalReturn'],at=stamp(),kind='observed')
            with self.db() as db:
                db.execute('INSERT OR REPLACE INTO snapshots VALUES(?,?,?)',(owner,day,json.dumps(snapshot)))
        return dict(summary,refreshFailures=failures)

    def automated(self, owner):
        if not json.loads(self.account(owner)['settings'])['automatic']:return
        with self.db() as db:
            rows=db.execute("SELECT payload FROM portfolio_decisions WHERE owner=? AND expires>? ORDER BY created DESC LIMIT 50",(owner,stamp())).fetchall()
        seen=set()
        for row in rows:
            decision=json.loads(row['payload']);key=(decision['kind'],decision['symbol'])
            if key in seen:continue
            seen.add(key)
            if decision.get('executionStatus') in {'market-closed','awaiting-confirmation'}:
                self.workflow.try_order(owner,decision)

    def tick(self):
        with self.db() as db:
            owners=[r['owner'] for r in db.execute('SELECT owner FROM accounts')]
        requested=[]
        for owner in owners:
            requested += [r['symbol'] for r in self.task_sources(owner)]
        for owner in owners:
            try:
                self.refresh(owner,include_favorites=True)
                self.automated(owner)
            except Exception:
                log.exception('Portfolio account update failed')
        self.scan(requested)

    def start(self):
        self.lock_file=open(self.directory/'scheduler.lock','a+')
        try:
            fcntl.flock(self.lock_file,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock_file.close();self.lock_file=None
            return
        def loop():
            while not self.stop_event.is_set():
                try:
                    self.tick()
                except Exception:
                    log.exception('Portfolio scheduler failed')
                self.stop_event.wait(300)
        self.workflow.start()
        self.notice_thread=threading.Thread(target=self.trade_notifications.run,name='portfolio-notifications',daemon=True)
        self.notice_thread.start()
        self.thread=threading.Thread(target=loop,name='portfolio-scheduler',daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        self.workflow.stop()
        if getattr(self,'notice_thread',None): self.notice_thread.join(timeout=2)
        if self.thread:
            self.thread.join(timeout=2)
        # Keep the process lock until the worker has actually stopped.
        if self.lock_file and (not self.thread or not self.thread.is_alive()):
            self.lock_file.close();self.lock_file=None


def create_router(service):
    from app.portfolio_questions import QuestionPool
    questions = QuestionPool(service)
    router=APIRouter(prefix='/api/portfolio')
    def owner(request,response,write=False):
        if write and (request.headers.get('x-veya-portfolio')!='1' or request.headers.get('sec-fetch-site')=='cross-site'):
            raise HTTPException(403,'请从持仓页面操作')
        token=request.cookies.get(COOKIE,'')
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):
            token=secrets.token_urlsafe(32)
            response.set_cookie(COOKIE,token,max_age=31536000,httponly=True,secure=request.url.scheme=='https' or request.headers.get('x-forwarded-proto')=='https',samesite='strict',path='/')
        response.headers['Cache-Control']='no-store'
        return hashlib.sha256(token.encode()).hexdigest()

    def call(fn,*args):
        try:
            return fn(*args)
        except ValueError as e:
            raise HTTPException(409,str(e))
        except (requests.RequestException,RuntimeError):
            raise HTTPException(503,'行情服务暂不可用，请稍后重试；未执行交易')

    @router.get('/account')
    def account(request:Request,response:Response):
        return service.summary(owner(request,response))

    @router.get('/opportunities')
    def opportunities(request:Request,response:Response):
        return {'items':service.opportunities(owner(request,response))}

    @router.get('/workflow')
    def workflow(request:Request,response:Response):
        user=owner(request,response)
        result=service.workflow.view(user)
        service.workflow.request_missing_direction_confidences(user)
        return result

    @router.post('/workflow/direction-assessments')
    def fill_direction_assessments(request:Request,response:Response):
        return call(service.workflow.request_missing_direction_confidences,owner(request,response,True))

    @router.put('/workflow/profile')
    def save_investment_profile(payload:InvestmentProfileInput,request:Request,response:Response):
        return service.workflow.save_profile(owner(request,response,True),payload.profile,payload.investment.model_dump(exclude_none=True) if payload.investment is not None else None)

    @router.put('/workflow/state')
    def set_workflow_state(payload:WorkflowStateInput,request:Request,response:Response):
        return call(service.workflow.set_enabled,owner(request,response,True),payload.enabled)

    @router.get('/strategies')
    def strategies(request:Request,response:Response):
        return service.workflow.strategy_settings(owner(request,response))

    @router.put('/strategies')
    def save_strategies(payload:StrategySettingsInput,request:Request,response:Response):
        return call(service.workflow.save_strategy_settings,owner(request,response,True),payload.model_dump())

    @router.post('/strategies/generate')
    def generate_strategy(payload:StrategyGenerationInput,request:Request,response:Response):
        owner_id=owner(request,response,True)
        if len(payload.description.strip())<2:raise HTTPException(422,'请描述你的策略规则')
        def events():
            from app.portfolio_strategies import stream_strategy
            try:
                yield 'data: '+json.dumps(dict(type='start'))+'\n\n'
                for event in stream_strategy(payload.description.strip(),payload.code):
                    if event.get('type')=='complete':
                        event=dict(event,settings=service.workflow.save_generated_strategy(owner_id,payload.model_dump(),event['code']))
                    yield 'data: '+json.dumps(event,ensure_ascii=False)+'\n\n'
            except ValueError as error:
                yield 'data: '+json.dumps(dict(type='error',message=str(error)),ensure_ascii=False)+'\n\n'
            except Exception:
                logging.getLogger(__name__).exception('Strategy generation failed')
                yield 'data: '+json.dumps(dict(type='error',message='策略生成服务暂不可用，请重试；当前草稿未保存'),ensure_ascii=False)+'\n\n'
        return StreamingResponse(events(),media_type='text/event-stream',headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no',**dict(response.headers)})

    @router.get('/favorites')
    def favorites(request:Request,response:Response):
        return {'items':service.workflow.favorites(owner(request,response))}

    @router.post('/favorites')
    def add_favorite(payload:FavoriteInput,request:Request,response:Response):
        return call(service.workflow.add_favorite,owner(request,response,True),payload.symbol,payload.name)

    @router.delete('/favorites/{symbol}')
    def remove_favorite(symbol:str,request:Request,response:Response):
        return call(service.workflow.remove_favorite,owner(request,response,True),symbol)

    @router.post('/workflow/run')
    def run_workflow(request:Request,response:Response):
        return call(service.workflow.request,owner(request,response,True))

    @router.post('/workflow/ideas')
    def submit_trading_idea(payload:TradingIdeaInput,request:Request,response:Response):
        return call(service.workflow.submit_idea,owner(request,response,True),payload.question.strip())

    @router.post('/refresh')
    def refresh(request:Request,response:Response):
        user=owner(request,response,True)
        result=call(lambda:service.refresh(user,include_favorites=True))
        questions.refreshed(user,result.get('refreshFailures',[]))
        result['lastRefreshAt']=questions.read(user)['lastRefreshAt']
        return result

    @router.get('/questions')
    def question_pool(request:Request,response:Response):
        return questions.read(owner(request,response))

    @router.post('/page-refresh')
    def refresh_page(request:Request,response:Response):
        return call(questions.request_refresh,owner(request,response,True))

    @router.post('/questions')
    def replenish_question_pool(request:Request,response:Response):
        return call(questions.ensure,owner(request,response,True))

    @router.post('/scan')
    def scan(request:Request,response:Response):
        user=owner(request,response,True)
        if service.scan_guard.locked():
            return {'status':'running'}
        # Bound browser-triggered work; the persistent scheduler also scans without an open page.
        with service.db() as db:
            row=db.execute("SELECT value FROM state WHERE key='manualScanAt'").fetchone()
            if row and (now()-dt.datetime.fromisoformat(row['value'])).total_seconds()<120:
                return {'status':'scheduled'}
            db.execute('INSERT OR REPLACE INTO state VALUES(?,?)',('manualScanAt',stamp()))
        requested=[r['symbol'] for r in service.task_sources(user)]
        threading.Thread(target=service.scan,args=(requested,),daemon=True).start()
        return {'status':'started'}

    @router.put('/settings')
    def settings(payload:SettingsInput,request:Request,response:Response):
        return service.setting(owner(request,response,True),payload.model_dump())

    @router.post('/plans')
    def plan(payload:PlanInput,request:Request,response:Response):
        return call(service.make_plan,owner(request,response,True),payload)

    @router.post('/plans/{plan_id}/execute')
    def execute(plan_id:str,request:Request,response:Response):
        return call(service.execute,owner(request,response,True),plan_id)

    return router
