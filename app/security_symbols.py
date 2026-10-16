"""Resolve human security names/codes for display widgets; no quote data."""
from __future__ import annotations

import json
import re
import time
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

MARKET_NAMES = {'us': '美股', 'hk': '港股', 'cn': 'A 股', 'auto': '自动识别'}
US_EXCHANGES = {'NASDAQ', 'NYSE', 'AMEX', 'CBOE', 'NYSEARCA'}
SYMBOL_PATTERN = re.compile(r'(?:[A-Z0-9_]+:)?[A-Z0-9_.!/^+\-]{1,80}')


def read_json(url):
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Origin': 'https://www.tradingview.com'})
    with urlopen(request, timeout=4) as response:
        return json.loads(response.read(2_000_000))


def candidate(exchange, code, name, market, source):
    exchange, code = exchange.upper(), code.upper()
    symbol = exchange+':'+code
    if not SYMBOL_PATTERN.fullmatch(symbol):
        return None
    clean_name=re.sub('<[^>]+>', '', name)
    result={'symbol':symbol,'code':code,'name':clean_name,'market':market,'exchange':exchange,'source':source}
    if market=='cn':
        # Exchange prefixes identify listing/risk status, not a different issuer.
        alias=re.sub(r'^(?:\*?ST|XD|XR|DR|[NC])(?=[\u4e00-\u9fff])','',clean_name)
        if alias!=clean_name:result['aliases']=[alias]
    return result



def eastmoney_candidates(query):
    data = read_json('https://searchapi.eastmoney.com/api/suggest/get?'+urlencode({'input':query,'type':'14','count':30}))
    results=[]
    for row in (data.get('QuotationCodeTable') or {}).get('Data') or []:
        code=str(row.get('Code') or '').upper()
        kind=row.get('Classify');exchange='';market=''
        if kind=='UsStock' and row.get('JYS') in US_EXCHANGES:
            exchange=row['JYS'];market='us'
        elif kind=='HK' and code.isdigit():
            exchange='HKEX';code=str(int(code));market='hk'
        elif kind=='AStock' and re.fullmatch(r'\d{6}',code):
            exchange='SSE' if code.startswith(('5','6','9')) and not code.startswith('92') else 'SZSE' if code.startswith(('0','1','2','3')) else ''
            market='cn'
        if exchange:
            item=candidate(exchange,code,str(row.get('Name') or code),market,'Eastmoney')
            if item:results.append(item)
    return results


def tradingview_candidates(query, market):
    exchange={'hk':'HKEX'}.get(market,'')
    data=read_json('https://symbol-search.tradingview.com/symbol_search/v3/?'+urlencode({'text':query,'exchange':exchange,'search_type':'stocks','lang':'zh','hl':'0','domain':'production'}))
    results=[]
    for row in data.get('symbols') or []:
        exchange=str(row.get('prefix') or row.get('exchange') or '')
        region='us' if row.get('country')=='US' and exchange in US_EXCHANGES else 'hk' if exchange=='HKEX' else 'cn' if exchange in {'SSE','SZSE'} else 'auto'
        if market!='auto' and region!=market:continue
        item=candidate(exchange,str(row.get('symbol') or ''),str(row.get('description') or ''),region,'TradingView')
        if item:results.append(item)
    return results


def rank(query, item):
    query=query.strip().casefold()
    if query==item['symbol'].casefold() or query==item['code'].casefold() or (query.isdigit() and item['code'].isdigit() and int(query)==int(item['code'])):return 0
    if query in [name.casefold() for name in [item['name'],*item.get('aliases',[])]]:return 1
    return 2


def verified_candidates(query, market):
    """Small, source-backed identity supplement for gaps in upstream search."""
    records=json.loads(Path(__file__).with_name('security_identities.json').read_text())
    results=[]
    for record in records:
        if market!='auto' and record['market']!=market:continue
        names=[record['name'],record['code'],*record.get('aliases',[])]
        if not any(query.casefold() in name.casefold() for name in names):continue
        item=candidate(record['exchange'],record['code'],record['name'],record['market'],record['source'])
        if item:
            item['aliases']=record.get('aliases',[])
            results.append(item)
    return results


@lru_cache(maxsize=256)
def _search(query, market, bucket):
    results=[];available=False
    try:
        results=eastmoney_candidates(query);available=True
    except (OSError, ValueError, TypeError, KeyError):
        pass
    results=[item for item in results if market=='auto' or item['market']==market]
    if not results:
        try:
            results=tradingview_candidates(query,market);available=True
        except (OSError, ValueError, TypeError, KeyError):
            pass
    verified=verified_candidates(query,market)
    if not available and not verified:raise ValueError('标的搜索暂时不可用，请稍后重试。')
    unique={item['symbol']:item for item in results}
    for item in verified:unique.setdefault(item['symbol'],item)
    return sorted(unique.values(),key=lambda item:rank(query,item))[:10]


def search_symbols(query, market='us'):
    query=str(query or '').strip()
    if market not in MARKET_NAMES:raise ValueError('请选择支持的证券市场。')
    if not query:return []
    if len(query)>80:raise ValueError('股票名称或代码过长，请缩短后重试。')
    return _search(query,market,int(time.time()//300))


def resolve_symbol(value, market='auto'):
    value=str(value or '').strip();upper=value.upper()
    if len(value)>80 or re.search(r'[<>\x00-\x1f]',value):raise ValueError('请填写有效的股票名称或代码。')
    if ':' in upper and SYMBOL_PATTERN.fullmatch(upper):return upper
    if market=='hk' and re.fullmatch(r'\d{1,5}',value):return 'HKEX:'+str(int(value))
    if market=='cn' and re.fullmatch(r'\d{6}',value):
        if value.startswith(('0','1','2','3')):return 'SZSE:'+value
        if value.startswith(('5','6','9')) and not value.startswith('92'):return 'SSE:'+value
    matches=search_symbols(value,market)
    exact=[item for item in matches if rank(value,item)<=1]
    if len(exact)==1:return exact[0]['symbol']
    if len(matches)==1:return matches[0]['symbol']
    if matches:raise ValueError(f'“{value}”有多个匹配标的，请从候选列表选择。')
    raise ValueError(f'没有找到“{value}”，请检查市场、名称或代码。')
