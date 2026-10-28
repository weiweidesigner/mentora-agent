"""On-demand OHLCV pages using the pinned native component's data contract."""
from __future__ import annotations

import math
import threading
import time
from collections import OrderedDict
from concurrent.futures import Future
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Response

from app.artifact_upgrades import _native_kline

router = APIRouter(prefix='/api/kline')
PERIODS = {'1m':60, '5m':300, '15m':900, '30m':1800, '1h':3600,
           '2h':7200, '4h':14400, '1d':86400, '1w':604800, '1M':2678400, '3M':8035200}
_cache = OrderedDict()
_pending = {}
_lock = threading.Lock()


def timestamp(value):
    if isinstance(value, (float, int)):
        value = float(value)
        if 10000101 <= value <= 99991231 and value.is_integer():
            return datetime.strptime(str(int(value)), '%Y%m%d').replace(tzinfo=timezone.utc).timestamp()*1000
        return value if value > 1e12 else value*1000
    instant = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if instant.tzinfo is None:instant=instant.replace(tzinfo=timezone.utc)
    return instant.timestamp()*1000


def _read_page(symbol, period, market, exchange, cursor, direction):
    if period in {'1m','5m','15m','30m','1h'}:
        from app.ashare_live import normalize_symbol, minute_snapshot
        try: mainland = normalize_symbol(symbol)
        except ValueError: mainland = None
        if mainland:
            snapshot = minute_snapshot(mainland,5,interval='1m' if period=='1m' else '5m')
            rows = snapshot['dataByPeriod'][period]
            if cursor:
                rows=[row for row in rows if timestamp(row['time']) < cursor] if direction=='before' else [row for row in rows if timestamp(row['time']) > cursor]
            page=rows[:500] if direction=='after' else rows[-500:]
            return dict(symbol=symbol,period=period,rows=page,source='eastmoney',reliableVolume=True,
                        hasMore=len(rows)>len(page),availableDates=snapshot['availableDates'],
                        coverageWarning=snapshot.get('coverageWarning'),cachePolicy='no-store')
    native = _native_kline()
    now = time.time()*1000
    seconds = PERIODS[period]
    fetch_period = '1h' if period in {'2h','4h'} else '1M' if period == '3M' else period
    # More than 500 makes the native adapter use its end-time-aware paged path.
    props = dict(market=market, exchange=exchange, timeout=8, fullHistory=False, historyPageSize=500)
    endpoint = min(now, cursor) if cursor and direction == 'before' else now
    attempts = 1
    if cursor and direction == 'after':
        endpoint = min(now, cursor + PERIODS[fetch_period]*800*1000)
        attempts = 5
    for attempt in range(attempts):
        frame = dict(props)
        if cursor: frame['toDate'] = endpoint
        rows, source = native.fetch_rows(frame, symbol, fetch_period, 800)
        rows = native.aggregate_rows_for_period(native.repair_zero_volume_rows(rows), period)
        valid = {}
        for row in rows:
            try:
                key = timestamp(row.get('time', row.get('timestamp')))
                values = [float(row[k]) for k in ('open','high','low','close','volume')]
                o,h,l,c,v = values
                if not math.isfinite(key) or not all(math.isfinite(n) for n in values):continue
                if min(o,h,l,c) <= 0 or v < 0 or h < max(o,l,c) or l > min(o,h,c):continue
                if cursor and ((direction == 'before' and key >= cursor) or (direction == 'after' and key <= cursor)):continue
                valid[key] = row
            except (KeyError, TypeError, ValueError):continue
        ordered = [valid[t] for t in sorted(valid)]
        if ordered or not cursor or direction != 'after' or endpoint >= now:break
        endpoint = min(now, cursor + PERIODS[fetch_period]*800*1000*(2**(attempt+1)))
    page = ordered[:500] if direction == 'after' else ordered[-500:]
    return dict(symbol=symbol, period=period, rows=page, source=source,
                reliableVolume=native.has_reliable_volume(props,source),
                hasMore=bool(page) and (direction != 'after' or timestamp(page[-1]['time']) < now-seconds*1000))


def history_page(symbol, period, market='', exchange='', cursor=None, direction='before'):
    key = (symbol, period, market, exchange, cursor, direction)
    if period in {'1m','5m','15m','30m','1h'}:
        from app.ashare_live import normalize_symbol
        try: mainland=normalize_symbol(symbol)
        except ValueError: mainland=None
        if mainland:return _read_page(*key)
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic()-hit[0] < 60:
            _cache.move_to_end(key)
            return hit[1]
        pending = _pending.get(key)
        leader = pending is None
        if leader:
            pending = Future(); _pending[key] = pending
    if not leader:return pending.result(timeout=100)
    try:
        result = _read_page(*key)
        with _lock:
            _cache[key] = (time.monotonic(), result)
            while len(_cache)>128:_cache.popitem(last=False)
        pending.set_result(result)
        return result
    except Exception as exc:
        pending.set_exception(exc)
        raise
    finally:
        with _lock:_pending.pop(key,None)


@router.get('/history')
def history(response: Response, symbol: str = Query(min_length=1,max_length=64,pattern=r'^[A-Za-z0-9^.:/_-]+$'),
            period: str = Query(pattern=r'^(1m|5m|15m|30m|1h|2h|4h|1d|1w|1M|3M)$'),
            market: str = Query(default='',max_length=24,pattern=r'^[A-Za-z0-9_-]*$'),
            exchange: str = Query(default='',max_length=24,pattern=r'^[A-Za-z0-9_-]*$'),
            cursor: float | None = Query(default=None,ge=0,le=32503680000000),
            direction: str = Query(default='before',pattern=r'^(before|after)$')):
    response.headers['Cache-Control']='no-store'
    if "://" in symbol or ".." in symbol:
        raise HTTPException(422,"无效的标的代码")
    try:return history_page(symbol.upper(),period,market,exchange,cursor,direction)
    except Exception as exc:
        raise HTTPException(502,'行情加载失败，请点击重试') from exc
