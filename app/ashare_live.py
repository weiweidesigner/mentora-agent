"""On-demand, uncached Shanghai/Shenzhen stock and index five-session minute quotes; native business K-line rendering.

Wire contract follows AKShare's documented Eastmoney trends2 adapter:
https://github.com/akfamily/akshare/blob/main/akshare/stock_feature/stock_hist_em.py
Prices are unadjusted CNY; upstream volume in lots is converted to shares.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import re
from collections import OrderedDict
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import HTMLResponse

ROOT = Path(__file__).resolve().parents[1]
SHANGHAI = ZoneInfo('Asia/Shanghai')
PERIODS = ('1m', '5m', '15m', '30m', '1h')
SOURCE_URL = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get'
router = APIRouter()


def normalize_symbol(value: str) -> str:
    value = value.strip().upper()
    match = re.fullmatch(r'(SSE|SHSE|SH|SZSE|SZ):(\d{6})', value)
    if match: return match[2] + ('.SH' if match[1] in {'SSE','SHSE','SH'} else '.SZ')
    match = re.fullmatch(r'(\d{6})\.(SH|SS|SZ)', value)
    if match: return match[1] + ('.SZ' if match[2]=='SZ' else '.SH')
    # Bare 000001 remains Shenzhen's stock; Shanghai's index needs an explicit exchange.
    if re.fullmatch(r'[036]\d{5}', value): return value + ('.SH' if value.startswith('6') else '.SZ')
    raise ValueError('请输入带交易所的沪深代码，例如 000001.SH（上证指数）、399001.SZ 或 600519.SH。')


def session_open(now: datetime) -> bool:
    minutes = now.hour * 60 + now.minute
    return now.weekday() < 5 and (570 <= minutes < 690 or 780 <= minutes < 900)


def poll_delay(now: datetime) -> int:
    if session_open(now): return 30
    # Lunch/weekends: wake at the next possible session, not every 30 seconds.
    for offset in range(8):
        date = now + timedelta(days=offset)
        if date.weekday() >= 5: continue
        for hour, minute in ((9, 30), (13, 0)):
            candidate = date.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if candidate > now: return max(30, int((candidate-now).total_seconds()))
    return 3600


def number(value) -> float:
    result = float(value)
    if not math.isfinite(result): raise ValueError('Invalid quote number')
    return result


def normalize_trends(data: dict, now: datetime, days: int = 1, date: str | None = None) -> list[dict]:
    by_time = {}
    for line in data.get('trends') or []:
        if not isinstance(line, str): continue
        try:
            fields = line.split(',')
            stamp = datetime.strptime(fields[0], '%Y-%m-%d %H:%M').replace(tzinfo=SHANGHAI)
            minute = stamp.hour*60+stamp.minute
            if stamp > now + timedelta(minutes=1) or not (570 <= minute <= 690 or 780 <= minute <= 900): continue
            opening, close, high, low = map(number, fields[1:5])
            volume, amount = number(fields[5])*100, number(fields[6])
            if min(opening, close, high, low) <= 0 or volume < 0 or amount < 0: continue
            if high < max(opening,close,low) or low > min(opening,close,high): continue
            by_time[int(stamp.timestamp()*1000)] = dict(time=int(stamp.timestamp()*1000),open=opening,high=high,low=low,close=close,volume=volume,amount=amount)
        except (ValueError, TypeError, IndexError): continue
    rows = [by_time[t] for t in sorted(by_time)]
    if not rows: raise ValueError('分钟行情源暂未返回有效数据。')
    dates = sorted({datetime.fromtimestamp(row['time']/1000, SHANGHAI).date().isoformat() for row in rows})
    selected = {date} if date else set(dates[-days:])
    result = [row for row in rows if datetime.fromtimestamp(row['time']/1000, SHANGHAI).date().isoformat() in selected]
    if not result: raise ValueError('所选交易日不在数据源返回的最近五个交易日内。')
    return result


def aggregate(rows: list[dict], minutes: int) -> list[dict]:
    if minutes == 1: return [dict(row) for row in rows]
    buckets = OrderedDict()
    for row in rows:
        stamp = datetime.fromtimestamp(row['time']/1000, SHANGHAI)
        start = stamp.replace(hour=9 if stamp.hour<12 else 13,minute=30 if stamp.hour<12 else 0,second=0,microsecond=0)
        offset = max(0, int((stamp-start).total_seconds()/60)-1)//minutes*minutes
        key = int((start+timedelta(minutes=offset)).timestamp()*1000)
        if key not in buckets: buckets[key] = {**row, 'time':key}
        else:
            bar = buckets[key]
            bar.update(high=max(bar['high'],row['high']),low=min(bar['low'],row['low']),close=row['close'],volume=bar['volume']+row['volume'],amount=bar['amount']+row['amount'])
    return list(buckets.values())


def fetch_source(symbol: str, days: int = 5) -> dict:
    code, exchange = symbol.split('.')
    response = requests.get(SOURCE_URL, params={
        'fields1':'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        'fields2':'f51,f52,f53,f54,f55,f56,f57,f58', 'ndays':str(days),'iscr':'0',
        'secid':('1' if exchange=='SH' else '0')+'.'+code,
    }, headers={'User-Agent':'Mozilla/5.0','Referer':'https://quote.eastmoney.com/'}, timeout=(3,8))
    response.raise_for_status()
    payload = response.json()
    data = payload.get('data') if isinstance(payload,dict) else None
    if not isinstance(data,dict) or str(data.get('code')) != code: raise ValueError('分钟行情源没有返回该标的的数据。')
    return data


def minute_snapshot(value: str, days: int = 5, date: str | None = None) -> dict:
    """One upstream request per call; no server memory/disk market-data cache."""
    symbol = normalize_symbol(value)
    if days not in range(1,6):raise ValueError('days 必须为 1 至 5。')
    if date:
        try: datetime.strptime(date,'%Y-%m-%d')
        except ValueError as exc:raise ValueError('date 必须为 YYYY-MM-DD。') from exc
    now = datetime.now(SHANGHAI)
    try:
        source = fetch_source(symbol,5 if date else days)
        all_rows = normalize_trends(source,now,5)
    except (requests.RequestException,ValueError,KeyError,TypeError) as exc:
        raise RuntimeError('东方财富分钟行情源暂不可用；未使用其他数据源或缓存数据。') from exc
    available = sorted({datetime.fromtimestamp(row['time']/1000,SHANGHAI).date().isoformat() for row in all_rows})
    rows = normalize_trends(source,now,days,date)
    selected = sorted({datetime.fromtimestamp(row['time']/1000,SHANGHAI).date().isoformat() for row in rows})
    grouped = {day:[row for row in rows if datetime.fromtimestamp(row['time']/1000,SHANGHAI).date().isoformat()==day] for day in selected}
    data_time = datetime.fromtimestamp(rows[-1]['time']/1000,SHANGHAI)
    behind = max(0,int((now-data_time).total_seconds()))
    return {'symbol':symbol,'name':str(source.get('name') or symbol),'source':'东方财富公开行情',
            'sourceUrl':'https://quote.eastmoney.com/','adjustment':'none','volumeUnit':'shares',
            'fetchedAt':now.isoformat(),'dataTime':data_time.isoformat(),'availableDates':available,
            'dates':selected,'rowsByDate':grouped,'cachePolicy':'no-store',
            'coverageWarning':f'已请求最近 {days} 个交易日，数据源实际仅返回 {len(selected)} 天；未获得完整请求区间的分时。' if not date and len(selected)<days else None,
            'dataByPeriod':{p:aggregate(rows,n) for p,n in zip(PERIODS,(1,5,15,30,60))},
            'status':'delayed' if session_open(now) and behind>180 else 'closed' if not session_open(now) else 'updating',
            'error':None,'nextPollSeconds':poll_delay(now),'delaySeconds':behind}


@router.get('/api/widgets/ashare-minute')
def minute_api(response: Response, symbol: str = Query(min_length=6,max_length=20),
               days: int = Query(default=5,ge=1,le=5), date: str | None = Query(default=None,pattern=r'^\d{4}-\d{2}-\d{2}$')):
    response.headers['Cache-Control'] = 'no-store'
    try: return minute_snapshot(symbol,days,date)
    except ValueError as error: raise HTTPException(status_code=422,detail=str(error)) from error
    except RuntimeError as error: raise HTTPException(status_code=503,detail=str(error)) from error


@lru_cache(maxsize=1)
def native_renderer():
    path = ROOT/'app/skills/business-chart-recall/scripts/kline.py'
    spec = importlib.util.spec_from_file_location('ashare_live_native_kline',path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def live_document(value: str, theme: str='dark') -> str:
    symbol = normalize_symbol(value)
    if theme not in {'dark','light'}: raise ValueError('Unsupported theme')
    component = {'type':'kline','title':symbol+' · 分钟行情','props':{
        'code':symbol,'name':symbol,'dataType':'1m','market':'CN','exchange':symbol[-2:],
        'language':'zh-CN','timeZone':'Asia/Shanghai','themeMode':theme,'candleColors':'red_up_green_down',
        'availablePeriods':list(PERIODS),'prefetchPeriods':list(PERIODS),'subIndicators':['VOL'],
        'sources':{p:'eastmoney' for p in PERIODS},
    },'dataByPeriod':{p:[] for p in PERIODS}}
    document = native_renderer().render_document(component)
    script = (ROOT/'app/static/ashare-live.js').read_text()
    metadata = '<script id="ashare-live-config" type="application/json">'+json.dumps({'symbol':symbol},ensure_ascii=False)+'</script>'
    status = '<div id="ashareLiveStatus" role="status" hidden style="padding:8px 12px;font:12px/1.6 system-ui;opacity:.75">正在连接分钟行情…</div>'
    return document.replace('</body>',status+metadata+'<script>'+script+'</script></body>')


def build_live_widget(symbol: str, output_dir: Path) -> dict:
    symbol = normalize_symbol(symbol)
    document = live_document(symbol)
    digest = hashlib.sha256(document.encode()).hexdigest()[:24]
    output_dir.mkdir(parents=True,exist_ok=True)
    target = output_dir/f'widget-ashare-live-{digest}.html'
    if not target.exists(): target.write_text(document)
    return {'title':symbol+' · 分钟行情','url':'/generated/'+target.name,'provider':'Eastmoney',
            'widget':'symbol-overview','preset':'intraday','mode':'native-live','config':{'symbols':[[symbol]],'height':'100%'}}


@router.get('/api/widgets/ashare-chart',response_class=HTMLResponse)
def chart_api(symbol: str=Query(min_length=6,max_length=20),theme: str='dark'):
    try: return HTMLResponse(live_document(symbol,theme),headers={'Cache-Control':'no-store'})
    except ValueError as error: raise HTTPException(status_code=422,detail=str(error)) from error
