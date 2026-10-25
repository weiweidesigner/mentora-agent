"""Read-only Hong Kong daily history; never a paper-order price source.

Provider contract: AKShare stock_zh_ah_daily (Tencent hkfqkline/get).
See docs/hk-market-data.md for identity, adjustment and session semantics.
"""
from __future__ import annotations
import datetime as dt
import json
import math
import re
from zoneinfo import ZoneInfo

import requests

HK=ZoneInfo('Asia/Hong_Kong')
ENDPOINT='https://web.ifzq.gtimg.cn/appstock/app/hkfqkline/get'
CALLBACK='mentora_hk_history'

def is_hk_symbol(value):
    text=str(value or '').strip().upper()
    return text.endswith('.HK') or text.startswith('HKEX:')

def normalize_hk_symbol(value):
    text=str(value or '').strip().upper()
    match=re.fullmatch(r'(?:([0-9]{1,5})\.HK|HKEX:([0-9]{1,5}))',text)
    if not match or not 0<int(match[1] or match[2])<=99999:
        raise ValueError('港股需要明确代码，如 0700.HK、00700.HK 或 HKEX:700')
    return str(int(match[1] or match[2])).zfill(4)+'.HK'

def research_symbol(value):
    if is_hk_symbol(value):return normalize_hk_symbol(value)
    from app.portfolio import symbol_value
    return symbol_value(value)

def _number(value):
    if isinstance(value,bool):raise ValueError('港股 OHLCV 字段格式错误')
    try:result=float(value)
    except (ValueError,TypeError):raise ValueError('港股 OHLCV 缺少数值') from None
    if not math.isfinite(result):raise ValueError('港股 OHLCV 含非有限数值')
    return result

def _payload(text):
    text=text.strip()
    if text.startswith(CALLBACK+'='):text=text[len(CALLBACK)+1:].rstrip(';').strip()
    if not text.startswith('{'):raise ValueError('港股历史行情源未返回约定 JSON；未生成替代数据')
    try:value=json.loads(text)
    except ValueError:raise ValueError('港股历史行情源 JSON 格式错误') from None
    if not isinstance(value,dict) or value.get('code')!=0:
        raise ValueError('港股历史行情源未成功返回数据')
    return value

def fetch_history(symbol,*,limit=132,as_of=None):
    symbol=normalize_hk_symbol(symbol)
    if not isinstance(limit,int) or isinstance(limit,bool) or not 1<=limit<=320:
        raise ValueError('港股历史日线数量须为 1..320')
    current=as_of or dt.datetime.now(dt.timezone.utc)
    if current.tzinfo is None:raise ValueError('港股行情时间必须带时区')
    from app.day_tasks import calendar
    cal=calendar('HK')
    today=current.astimezone(HK).date()
    # CAS ends by close +10 minutes, including shortened trading sessions.
    def completed(date):
        return cal.is_session(date) and cal.session_close(date).to_pydatetime()+dt.timedelta(minutes=10)<=current
    sessions=cal.sessions_in_range(today-dt.timedelta(days=30),today)
    finished=[s.date() for s in sessions if completed(s.date())]
    if not finished:raise ValueError('无法确认香港最近完整交易日')
    provider='hk'+symbol[:-3].zfill(5)
    start=today-dt.timedelta(days=max(400,limit*2))
    try:
        response=requests.get(ENDPOINT,params={'_var':CALLBACK,'param':f'{provider},day,{start.isoformat()},{today.isoformat()},640,qfq'},timeout=(3,12),allow_redirects=False)
        if response.status_code!=200:
            raise ValueError('港股历史行情源返回 HTTP '+str(response.status_code)+'；未重试或替换标的')
        payload=_payload(response.text)
    except requests.RequestException as exc:
        raise ValueError('港股历史行情源连接失败（'+type(exc).__name__+'），未使用替代数据') from exc
    data=payload.get('data')
    record=data.get(provider) if isinstance(data,dict) else None
    bars=record.get('qfqday') if isinstance(record,dict) else None
    if not isinstance(bars,list) or not bars:
        raise ValueError('港股 '+symbol+' 没有返回本标的的前复权日线；不以未复权或其他市场代替')
    rows={}
    for bar in bars:
        if not isinstance(bar,list) or len(bar)<6:raise ValueError('港股历史日线字段不完整')
        try:date=dt.date.fromisoformat(bar[0])
        except (ValueError,TypeError):raise ValueError('港股历史日线缺少有效交易日期') from None
        if date>today or not completed(date):continue
        opening,close,high,low,volume=map(_number,bar[1:6])
        if min(opening,close,high,low)<=0 or volume<0 or high<max(opening,close,low) or low>min(opening,close,high):
            raise ValueError('港股历史日线 OHLCV 关系无效；未填补或修造行情')
        row=dict(date=date.isoformat(),open=opening,close=close,high=high,low=low,adjusted=close,volume=volume)
        if date in rows and rows[date]!=row:raise ValueError('港股历史日线同日记录冲突')
        rows[date]=row
    values=[rows[d] for d in sorted(rows)][-limit:]
    if not values:raise ValueError('港股历史行情没有已完成交易日数据')
    stale=values[-1]['date']<finished[-1].isoformat()
    limitation='仅用于港股行情研究和历史回测；HKD 原价，前复权全部 OHLC，不可用于模拟成交；成交量沿用源单位，不猜测手/股换算'
    if stale:limitation+='；历史末日早于最近完整交易日，不能冒称当前行情'
    return dict(symbol=symbol,rows=values,rowCount=len(values),market='HK',currency='HKD',nativeCurrency='HKD',timezone='Asia/Hong_Kong',
                adjusted=True,adjustment='forward',priceBasis='forward-adjusted native HKD OHLC',volumeUnit='provider-reported',
                source='Tencent HK forward-adjusted daily OHLCV',sourceUrl='https://gu.qq.com/'+provider+'/gp',
                fetchedAt=current.astimezone(dt.timezone.utc).isoformat(),asOf=values[-1]['date'],expectedAsOf=finished[-1].isoformat(),
                stale=stale,researchOnly=True,executionAuthorized=False,limitation=limitation)
