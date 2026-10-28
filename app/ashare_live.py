"""On-demand, uncached Shanghai/Shenzhen stock and index five-session minute quotes; native business K-line rendering.

Default: documented Sina stock/index minute bars, unadjusted CNY.
https://akshare.akfamily.xyz/data/stock/stock_quote.html
Eastmoney is an explicit alternative. Volume metadata remains provider-specific.
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
            volume, amount = number(fields[5])*data.get("volumeScale",100), number(fields[6])
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


def fetch_five_minute_source(symbol: str) -> dict:
    """The documented Eastmoney 5m K-line route, distinct from trends2."""
    code,exchange=symbol.split('.')
    response=requests.get('https://push2his.eastmoney.com/api/qt/stock/kline/get',params={
        'secid':('1' if exchange=='SH' else '0')+'.'+code,
        'ut':'7eea3edcaed734bea9cbfc24409ed989','fields1':'f1,f2,f3,f4,f5,f6',
        'fields2':'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        'klt':'5','fqt':'0','beg':'0','end':'20500000'},
        headers={'User-Agent':'Mozilla/5.0','Referer':'https://quote.eastmoney.com/'},timeout=(3,8))
    response.raise_for_status();payload=response.json();data=payload.get('data')
    if not isinstance(data,dict) or str(data.get('code'))!=code:raise ValueError('五分钟行情源未返回该标的。')
    return {**data,'trends':[','.join(str(row).split(',')[:7])+',0' for row in data.get('klines',[])]}


def fetch_sina_source(symbol: str, interval: str) -> dict:
    """AKShare stock_zh_a_minute's documented stock/index, unadjusted contract.

    Parse JSONP as data only. No eval, daily-price synthesis, retries or cache.
    """
    code, exchange = symbol.split('.')
    response = requests.get(
        'https://quotes.sina.cn/cn/api/jsonp_v2.php/=/CN_MarketDataService.getKLineData',
        params={'symbol':exchange.lower()+code,'scale':'5' if interval=='5m' else '1',
                'ma':'no','datalen':'1970'}, timeout=(3,8))
    response.raise_for_status()
    match = re.fullmatch(r'\s*/\*.*?\*/\s*=\s*\((.*)\);?\s*', response.text, re.S)
    if not match:
        match = re.fullmatch(r'\s*=\s*\((.*)\);?\s*', response.text, re.S)
    if not match: raise ValueError('新浪分钟行情响应格式无效。')
    records = json.loads(match[1])
    if not isinstance(records,list) or not records: raise ValueError('新浪未返回该标的的分钟行情。')
    trends=[]
    for row in records:
        if not isinstance(row,dict): continue
        try:
            stamp=datetime.strptime(row['day'],'%Y-%m-%d %H:%M:%S')
            if stamp.second: continue
            values=[row[key] for key in ('open','close','high','low','volume')]
            # Amount may be absent; never compute it from closing price.
            trends.append(','.join([stamp.strftime('%Y-%m-%d %H:%M'),*map(str,values),str(row.get('amount',0)),'0']))
        except (KeyError,ValueError,TypeError): continue
    return {'code':code,'name':symbol,'trends':trends,'volumeScale':1}


def minute_snapshot(value: str, days: int = 5, date: str | None = None, interval: str = "auto", provider: str = "sina") -> dict:
    """On-demand quotes; explicit provider and actual resolution, no quote cache."""
    symbol = normalize_symbol(value)
    if days not in range(1,6):raise ValueError('days 必须为 1 至 5。')
    if date:
        try: datetime.strptime(date,'%Y-%m-%d')
        except ValueError as exc:raise ValueError('date 必须为 YYYY-MM-DD。') from exc
    if interval not in {'auto','1m','5m'}:raise ValueError('interval 必须为 auto、1m 或 5m。')
    if provider not in {'sina','eastmoney'}:raise ValueError('provider 必须为 sina 或 eastmoney。')
    now = datetime.now(SHANGHAI)
    attempts=[];source=None;all_rows=[];actual='1m';error=None;notice=None
    if provider=='sina':
        actual='5m' if interval=='5m' else '1m'
        try:
            source=fetch_sina_source(symbol,actual);all_rows=normalize_trends(source,now,5)
            count=len({datetime.fromtimestamp(row['time']/1000,SHANGHAI).date() for row in all_rows})
            attempts.append({'provider':'sina','interval':actual,'status':'success' if count>=days else 'partial','sessions':count})
        except (requests.RequestException,ValueError,KeyError,TypeError) as exc:
            raise RuntimeError('新浪分钟行情源暂不可用；未使用缓存或拼造行情。') from exc
    if provider=='eastmoney' and interval!='5m':
        try:
            source=fetch_source(symbol,5 if date else days);all_rows=normalize_trends(source,now,5)
            count=len({datetime.fromtimestamp(row['time']/1000,SHANGHAI).date() for row in all_rows})
            attempts.append({'interval':'1m','status':'success' if count>=days else 'partial','sessions':count})
        except (requests.RequestException,ValueError,KeyError,TypeError) as exc:
            error=exc;attempts.append({'interval':'1m','status':'unavailable'})
    needs_five=provider=='eastmoney' and (interval=='5m' or (interval=='auto' and (not all_rows or (not date and attempts[-1].get('sessions',0)<days) or (date and date not in {datetime.fromtimestamp(row['time']/1000,SHANGHAI).date().isoformat() for row in all_rows}))))
    if needs_five:
        try:
            alternative=fetch_five_minute_source(symbol);alternative_rows=normalize_trends(alternative,now,5)
            count=len({datetime.fromtimestamp(row['time']/1000,SHANGHAI).date() for row in alternative_rows})
            attempts.append({'interval':'5m','status':'success','sessions':count})
            if not all_rows or interval=='5m' or count>attempts[0].get('sessions',0):
                source=alternative;all_rows=alternative_rows;actual='5m'
                if interval=='auto':notice='一分钟分时不可用或覆盖不足，已使用真实五分钟数据。'
        except (requests.RequestException,ValueError,KeyError,TypeError) as exc:
            error=exc;attempts.append({'interval':'5m','status':'unavailable'})
    if not all_rows:raise RuntimeError('东方财富行情源暂不可用；未使用缓存或拼造行情。') from error
    available = sorted({datetime.fromtimestamp(row['time']/1000,SHANGHAI).date().isoformat() for row in all_rows})
    source_dates=sorted({line.split(',')[0][:10] for line in source.get('trends',[]) if isinstance(line,str) and re.match(r'^\d{4}-\d{2}-\d{2} ',line)})[-5:]
    discarded_dates=sorted(set(source_dates)-set(available))
    ohlc_warning=('行情源还包含 '+', '.join(discarded_dates)+' 的价格记录，但缺少有效开高低收，未当作有效 K 线或补造价格。') if discarded_dates else None
    rows = normalize_trends(source,now,days,date)
    selected = sorted({datetime.fromtimestamp(row['time']/1000,SHANGHAI).date().isoformat() for row in rows})
    grouped = {day:[row for row in rows if datetime.fromtimestamp(row['time']/1000,SHANGHAI).date().isoformat()==day] for day in selected}
    data_time = datetime.fromtimestamp(rows[-1]['time']/1000,SHANGHAI)
    behind = max(0,int((now-data_time).total_seconds()))
    return {'symbol':symbol,'name':str(source.get('name') or symbol),'source':'新浪财经' if provider=='sina' else '东方财富公开行情',
            'provider':provider,'sourceUrl':'https://finance.sina.com.cn/' if provider=='sina' else 'https://quote.eastmoney.com/',
            'adjustment':'none','volumeUnit':'source-unverified' if provider=='sina' else 'shares','reliableVolume':provider=='eastmoney',
            'fetchedAt':now.isoformat(),'dataTime':data_time.isoformat(),'availableDates':available,
            'sourceDates':source_dates,'ohlcCoverageWarning':ohlc_warning,'dates':selected,'rowsByDate':grouped,'cachePolicy':'no-store','interval':actual,'requestedInterval':interval,'attempts':attempts,'resolutionNotice':notice,
            'coverageWarning':' '.join(v for v in [f'已请求最近 {days} 个交易日，仅获得 {len(selected)} 天有效数据；未获得完整请求区间的分时。' if not date and len(selected)<days else None, ohlc_warning] if v) or None,
            'dataByPeriod':{p:(list(rows) if (actual=='1m' and n==1) or (actual=='5m' and n==5) else aggregate(rows,n)) for p,n in zip(PERIODS,(1,5,15,30,60)) if actual=='1m' or n>=5},
            'status':'delayed' if session_open(now) and behind>180 else 'closed' if not session_open(now) else 'updating',
            'error':None,'nextPollSeconds':poll_delay(now),'delaySeconds':behind}


@router.get('/api/widgets/ashare-minute')
def minute_api(response: Response, symbol: str = Query(min_length=6,max_length=20),
               days: int = Query(default=5,ge=1,le=5), date: str | None = Query(default=None,pattern=r'^\d{4}-\d{2}-\d{2}$'),
               interval: str = Query(default='auto',pattern=r'^(auto|1m|5m)$'),
               provider: str = Query(default='sina',pattern=r'^(sina|eastmoney)$')):
    response.headers['Cache-Control'] = 'no-store'
    try: return minute_snapshot(symbol,days,date,interval,provider)
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
        'language':'zh-CN','timeZone':'Asia/Shanghai','themeMode':theme,'candleColors':'red_up_green_down','klineType':'line',
        'availablePeriods':list(PERIODS),'prefetchPeriods':list(PERIODS),'subIndicators':[],
        'sources':{p:'sina' for p in PERIODS},
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
    return {'title':symbol+' · 分钟行情','url':'/generated/'+target.name,'provider':'Sina',
            'widget':'symbol-overview','preset':'intraday','mode':'native-live','config':{'symbols':[[symbol]],'height':'100%'}}


@router.get('/api/widgets/ashare-chart',response_class=HTMLResponse)
def chart_api(symbol: str=Query(min_length=6,max_length=20),theme: str='dark'):
    try: return HTMLResponse(live_document(symbol,theme),headers={'Cache-Control':'no-store'})
    except ValueError as error: raise HTTPException(status_code=422,detail=str(error)) from error
