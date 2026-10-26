from __future__ import annotations
import datetime as dt
import json
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field

class Input(BaseModel):
    model_config=ConfigDict(extra='forbid')
    operation:Literal['candidates','scan','quote','history','fundamentals','save_candidate']
    symbol:str=''
    refresh:bool=False
    days:int=Field(default=7,ge=1,le=30)
    limit:int=Field(default=100,ge=1,le=500)
    values:dict=Field(default_factory=dict)

def execute(service,owner,payload):
    from app.portfolio import now,stamp,symbol_value
    p=Input.model_validate(payload)
    if p.operation=='candidates':
        with service.db() as db:rows=db.execute('SELECT payload FROM portfolio_candidates WHERE owner=? AND updated>? ORDER BY updated DESC LIMIT ?',(owner,stamp(now()-dt.timedelta(days=p.days)),p.limit)).fetchall()
        return [json.loads(r['payload']) for r in rows]
    if p.operation=='scan':
        with service.db() as db:rows=db.execute("SELECT symbol,payload FROM scans WHERE error='' AND updated>? ORDER BY updated DESC LIMIT ?",(stamp(now()-dt.timedelta(days=p.days)),p.limit)).fetchall()
        return [dict(symbol=r['symbol'],signal=json.loads(r['payload'])) for r in rows]
    from app.hk_market_data import research_symbol,is_hk_symbol
    symbol=research_symbol(p.symbol) if p.operation in ('quote','history') else symbol_value(p.symbol)
    if p.operation=='quote':
        if is_hk_symbol(symbol):return service.market.favorite_quote(symbol,fresh=p.refresh)
        return service.quote(symbol,fresh=p.refresh)
    if p.operation=='history':
        history=service.market.history(symbol,priority=True) if hasattr(service.market,'cn_call') else service.market.history(symbol)
        return dict(history,symbol=symbol,rowCount=len(history.get('rows') or []))
    if p.operation=='fundamentals':
        from app.portfolio_data import load_skill,is_cn
        if is_cn(symbol) or is_hk_symbol(symbol):return {'symbol':symbol,'status':'unavailable','reason':'AInvest Key Stats 仅用于美国上市证券，不跨市场替代'}
        component=load_skill('business-chart-recall/scripts/key_stats.py','portfolio_ainvest_key_stats')
        payload=component.fetch_ainvest_key_stats(symbol,timeout=4)
        raw=payload.get('fields') or {}
        mapping={'marketCap':'marketCap','peTtm':'trailingPE','sharesOutstanding':'sharesOutstanding','epsTtm':'epsTtm','pb':'priceToBook','dividendYield':'dividendYield'}
        return {'symbol':symbol,'values':{target:raw[key] for key,target in mapping.items() if raw.get(key) is not None},'source':payload.get('source'),'fetchedAt':stamp()}
    return service.workflow.merge(owner,symbol,p.values)
