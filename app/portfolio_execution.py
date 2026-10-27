"""Account execution adapters; no broker integration or fabricated market marks."""
import datetime as dt
import json
import math
import re
import time
from zoneinfo import ZoneInfo

import requests

from app.portfolio import now, stamp, number
from app.portfolio_data import MarketDataHub
from app.portfolio_workflow import PortfolioWorkflow, search_symbols
from app.day_tasks import calendar


class ExecutionMarket(MarketDataHub):
    def hk_fx(self):
        with self.guard:cached=self.cache.get(('fx','HKD'))
        if cached and time.monotonic()-cached[0]<3600:return dict(cached[1])
        response=requests.get('https://api.frankfurter.dev/v2/rate/HKD/USD',timeout=12)
        response.raise_for_status();data=response.json();rate=number(data.get('rate'))
        date=dt.date.fromisoformat(data['date'])
        if data.get('base')!='HKD' or data.get('quote')!='USD' or not rate or not 0<rate<1 or not 0<=(now().date()-date).days<=4:
            raise ValueError('港币兑美元汇率缺失或过期，未执行订单')
        result=dict(base='HKD',quote='USD',rate=rate,date=data['date'],source='Frankfurter daily reference FX',sourceUrl='https://frankfurter.dev/')
        with self.guard:self.cache[('fx','HKD')]=(time.monotonic(),result)
        return result

    def quote(self,symbol,asset='stocks',fresh=False):
        from app.hk_market_data import is_hk_symbol,normalize_hk_symbol,fetch_snapshot
        if not is_hk_symbol(symbol):
            quote=super().quote(symbol,asset,fresh)
            if quote.get('changePct') is None and quote.get('dateOnly') and quote.get('sourceUrl')=='https://quote.ainvest.com/':
                # The existing close-price fallback has already cached this history.
                # Compare the same series and session; never substitute a zero or
                # mix an intraday quote with an unrelated historical close.
                try:
                    rows=self.history(symbol).get('rows') or [];day=quote.get('priceDate')
                    current=next((row for row in reversed(rows) if row.get('date')==day),None)
                    previous=max((row for row in rows if day and row.get('date','')<day),key=lambda row:row['date'],default=None)
                    close=number(current.get('close')) if current else None
                    previous_close=number(previous.get('close')) if previous else None
                    if close and close>0 and previous_close and previous_close>0 and math.isclose(close,quote['price'],rel_tol=1e-9,abs_tol=1e-8):
                        quote=dict(quote,changePct=round((close/previous_close-1)*100,6),previousClose=previous_close,
                                   changePctSource=quote.get('source'),changePctAsOf=day)
                except InterruptedError:raise
                except Exception:pass  # Keep the valid price; missing change remains unknown.
            return quote
        symbol=normalize_hk_symbol(symbol)
        key=('execution-hk-quote-v2',symbol)
        with self.guard:cached=self.cache.get(key)
        if cached and not fresh and time.monotonic()-cached[0]<30:
            q=dict(cached[1])
        else:
            q=fetch_snapshot(symbol,as_of=now())
            with self.guard:self.cache[key]=(time.monotonic(),dict(q))
        fx=self.hk_fx()
        native=number(q.get('nativePrice'))
        if native is None or native<=0 or q.get('nativeCurrency')!='HKD':raise ValueError('港股原币报价无效，未执行订单')
        q.update(price=round(native*fx['rate'],8),currency='USD',fx=fx,
                 lotSize=1,quantityRule='Mentora 账户按整数股记账',dateOnly=False,researchOnly=False)
        q['tradable'],q['limitation']=self.freshness(q)
        return q

    def favorite_quote(self,symbol,fresh=False):
        return self.quote(symbol,fresh=fresh) if symbol.endswith('.HK') else super().favorite_quote(symbol,fresh)

    @staticmethod
    def freshness(q):
        if q.get('market')!='HK':return MarketDataHub.freshness(q)
        try:
            current=now();local=current.astimezone(ZoneInfo('Asia/Hong_Kong'))
            at=dt.datetime.fromisoformat(q['priceAt']);fx=q['fx']
            rate=number(fx.get('rate'));price=number(q.get('price'));native=number(q.get('nativePrice'))
            if not at.tzinfo or at>current+dt.timedelta(minutes=1):return False,'港股报价时间无法验证'
            if fx.get('base')!='HKD' or fx.get('quote')!='USD' or not rate or not 0<rate<1 or not 0<=(current.date()-dt.date.fromisoformat(fx['date'])).days<=4:return False,'港币汇率参考数据过期或无效'
            if q.get('currency')!='USD' or q.get('nativeCurrency')!='HKD' or not native or native<=0 or not price or price<=0 or not math.isclose(price,native*rate,abs_tol=1e-7):return False,'港股价格与币种换算校验失败'
            cal=calendar('HK');day=local.date()
            sessions=cal.sessions_in_range(day-dt.timedelta(days=30),day)
            completed=[s for s in sessions if cal.session_close(s).to_pydatetime()+dt.timedelta(minutes=10)<=current]
            if not cal.is_session(at.astimezone(local.tzinfo).date()):return False,'港股报价不是有效交易日'
            if cal.is_session(day):
                opened=cal.session_open(day).to_pydatetime();closed=cal.session_close(day).to_pydatetime()+dt.timedelta(minutes=10)
                if opened<=current<closed:
                    try:in_break=cal.session_break_start(day).to_pydatetime()<=current<cal.session_break_end(day).to_pydatetime()
                    except (ValueError,TypeError):in_break=False
                    max_age=90*60 if in_break else 180
                    if q.get('dateOnly') or (current-at).total_seconds()>max_age:return False,'港股盘中报价过期，未执行订单'
                elif not completed or at.astimezone(local.tzinfo).date()<completed[-1].date():return False,'港股报价早于最近完整交易日'
            elif not completed or at.astimezone(local.tzinfo).date()<completed[-1].date():return False,'港股报价早于最近完整交易日'
            return True,'港币原价按参考汇率折算美元，按账户数量规则执行'
        except (KeyError,ValueError,TypeError,AttributeError,OverflowError):return False,'港股行情时间、交易日历或汇率无法验证'


class ExecutionWorkflow(PortfolioWorkflow):
    @staticmethod
    def stock_symbol(symbol):
        return bool(re.fullmatch(r'\d{4,5}\.HK',symbol or '')) or PortfolioWorkflow.stock_symbol(symbol)

    def favorites(self,owner):
        items=super().favorites(owner)
        with self.service.db() as db:
            cached={row['symbol']:json.loads(row['payload']) for row in db.execute('SELECT q.symbol,q.payload FROM quotes q JOIN portfolio_favorites f ON f.symbol=q.symbol WHERE f.owner=?',(owner,))}
        for item in items:
            quote=item.get('quote') or {};other=cached.get(item['symbol'],{})
            if quote.get('changePct') is not None or not quote.get('priceDate') or quote['priceDate']!=other.get('priceDate'):continue
            currency=quote.get('nativeCurrency') or quote.get('currency')
            if currency!=(other.get('nativeCurrency') or other.get('currency')):continue
            price=number(quote.get('nativePrice',quote.get('price')));other_price=number(other.get('nativePrice',other.get('price')))
            change=number(other.get('changePct'))
            if price and price>0 and other_price and other_price>0 and change is not None and math.isclose(price,other_price,rel_tol=1e-9,abs_tol=1e-8):
                item['quote']=dict(quote,changePct=change,changePctSource=other.get('changePctSource') or other.get('source'),changePctAsOf=quote['priceDate'])
        return items

    def refresh_favorites(self,owner):
        failures=[]
        with self.service.db() as db:
            rows=db.execute('SELECT symbol,payload FROM portfolio_favorites WHERE owner=?',(owner,)).fetchall()
            known={row['symbol'] for row in db.execute('SELECT u.symbol FROM universe u JOIN portfolio_favorites f ON f.symbol=u.symbol WHERE f.owner=?',(owner,))}
        for row in rows:
            symbol=row['symbol'];item=json.loads(row['payload'])
            try:
                # Portfolio.quote resolves assetclass from the actual directory
                # (ETF versus stock) and updates the shared quote cache as well.
                quote=self.service.quote(symbol,True) if symbol in known or not hasattr(self.service.market,'favorite_quote') else self.service.market.favorite_quote(symbol,fresh=True)
                item.update(quote=quote,updated=stamp())
                if not item.get('name') and quote.get('name'):item['name']=quote['name']
                with self.service.db() as db:
                    db.execute('UPDATE portfolio_favorites SET payload=?,updated=? WHERE owner=? AND symbol=?',(json.dumps(item,ensure_ascii=False),item['updated'],owner,symbol))
            except InterruptedError:raise
            except Exception:failures.append(symbol)
        return failures

    def add_favorite(self,owner,symbol,name=None):
        """Identity validation and persistence do not wait for market quotes."""
        symbol=self.favorite_symbol(symbol)
        with self.service.db() as db:
            old=db.execute('SELECT payload FROM portfolio_favorites WHERE owner=? AND symbol=?',(owner,symbol)).fetchone()
            listing=db.execute('SELECT name FROM universe WHERE symbol=?',(symbol,)).fetchone()
        if old:
            item=json.loads(old['payload']);item['tradingViewUrl']=self.tradingview_url(symbol);return item
        hk=symbol.endswith('.HK');cn=bool(re.fullmatch(r'\d{6}\.(SH|SZ|BJ)',symbol))
        resolved=listing['name'] if listing else None
        if not resolved:
            code=symbol[:-3].lstrip('0') if hk else symbol.split('.')[0]
            matches=search_symbols(code,'hk' if hk else 'cn' if cn else 'us')
            match=next((item for item in matches if (item['code'].lstrip('0') if hk else item['code'])==code),None)
            if not match:raise ValueError('未找到该股票代码，请核对代码与市场')
            resolved=match['name']
        created=stamp()
        item=dict(symbol=symbol,name=resolved,market='HK' if hk else 'CN' if cn else 'US',nativeCurrency='HKD' if hk else 'CNY' if cn else 'USD',quote=None,created=created,updated=created)
        with self.service.db() as db:
            db.execute('INSERT OR IGNORE INTO portfolio_favorites(owner,symbol,payload,created,updated) VALUES(?,?,?,?,?)',(owner,symbol,json.dumps(item,ensure_ascii=False),created,created))
        self.merge(owner,symbol,dict(sourceTypes=['favorite'],favorite=dict(created=created,updated=created)))
        item['tradingViewUrl']=self.tradingview_url(symbol)
        return item
