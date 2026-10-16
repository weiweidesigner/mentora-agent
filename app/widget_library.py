"""Direct manual TradingView embedding. No planner, model, or quote-data fetch."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from app.security_symbols import resolve_symbol, search_symbols
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / 'outputs' / 'generated'
router = APIRouter()


class TradingViewInput(BaseModel):
    widget: str = Field(min_length=1, max_length=60)
    symbols: list[str] = Field(default_factory=list, max_length=30)
    market: str = Field(default='default', max_length=30)
    preset: Literal['intraday','forex','crypto-pairs'] | None = None
    symbolMarket: Literal['auto', 'us', 'hk', 'cn'] = 'auto'
    theme: Literal['dark', 'light'] = 'dark'
    language: Literal['zh-CN', 'zh-Hant', 'en'] = 'zh-CN'
    interval: str | None = Field(default=None, max_length=10)


@lru_cache(maxsize=1)
def renderer():
    path = ROOT / 'app/skills/trading-view-chart/scripts/trading_view_chart.py'
    spec = importlib.util.spec_from_file_location('widget_library_tradingview', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


GROUPS = {'symbol-overview', 'market-data', 'ticker-tape', 'tickers'}
MARKETS = {'screener', 'crypto-mkt-screener', 'stock-heatmap', 'crypto-heatmap',
           'market-overview', 'economic-calendar', 'top-stories','stock-market','etf-heatmap','market-summary','world-market-summary','economic-map'}
REGIONS = {'default', 'us', 'cn', 'eu', 'gb', 'jp'}
STOCK_MARKETS = {'default', 'america', 'china', 'hongkong', 'japan', 'uk', 'germany','forex','crypto'}
CURRENCY_WIDGETS = {'forex-cross-rates','forex-heatmap','forex-table'}
BROKER_WIDGETS = {'broker-rating','broker-reviews'}

def allowed_markets(widget):
    if widget == 'screener': return STOCK_MARKETS
    if widget == 'economic-calendar': return REGIONS
    if widget in {'stock-market','market-summary'}: return {'default','US','SSE','SZSE','HKEX','TSE','LSE'}
    return {'default'}


def build_widget(payload: TradingViewInput, output_dir: Path = GENERATED) -> dict:
    tool = renderer()
    if payload.widget not in tool.CATALOG:
        raise ValueError('不支持的 TradingView 组件')
    if payload.preset and ((payload.preset=='intraday' and payload.widget!='symbol-overview') or (payload.preset in {'forex','crypto-pairs'} and payload.widget!='screener')):
        raise ValueError('该组件不支持指定的预设。')
    values = list(dict.fromkeys(s.strip() for s in payload.symbols if s.strip()))
    if (payload.preset=='intraday' or (payload.widget not in MARKETS|GROUPS|CURRENCY_WIDGETS|BROKER_WIDGETS)) and len(values) != 1:
        raise ValueError('该组件需要且只支持一个标的。')
    symbols = values if payload.widget in MARKETS|CURRENCY_WIDGETS|BROKER_WIDGETS else list(dict.fromkeys(resolve_symbol(s, payload.symbolMarket) for s in values))
    config = {}
    symbol = None
    if payload.widget in MARKETS:
        if symbols:
            raise ValueError('该组件按市场展示，无需填写股票代码。')
        allowed = allowed_markets(payload.widget)
        if payload.market not in allowed:
            raise ValueError('请选择列表中支持的市场范围。')
        if payload.widget == 'screener':
            config['market'] = {'forex':'forex','crypto-pairs':'crypto'}.get(payload.preset,'america') if payload.market=='default' else payload.market
        elif payload.widget in {'stock-market','market-summary'}:
            config['exchange'] = 'US' if payload.market=='default' else payload.market
        elif payload.widget == 'economic-calendar' and payload.market != 'default':
            config['countryFilter'] = payload.market
    elif payload.widget in CURRENCY_WIDGETS:
        currencies=list(dict.fromkeys(v.upper() for v in values))
        supported={'USD','EUR','GBP','JPY','CHF','AUD','CAD','NZD','CNY','CNH','HKD','SGD','SEK','NOK','DKK','ZAR','MXN','TRY','RUB','PLN','HUF','CZK','INR','KRW','BRL'}
        if currencies and (len(currencies)<2 or len(currencies)>10 or any(v not in supported for v in currencies)):
            raise ValueError('请输入 2 到 10 个支持的货币代码，例如 USD、EUR、JPY。')
        if currencies: config['currencies']=currencies
    elif payload.widget in BROKER_WIDGETS:
        if not values or values in [['全球'],['default'],['经纪商评分'],['经纪商评论']]:
            values=[tool.CATALOG[payload.widget]['defaults']['broker']]
        symbols=values
        import re
        if len(values)!=1 or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,49}',values[0].lower()):
            raise ValueError('请输入 TradingView 经纪商标识，例如 easymarkets。')
        config['broker']=values[0].lower()
    elif payload.preset == 'intraday':
        config.update(symbols=[[symbols[0]+'|1']], dateRanges=['1d|1'], chartType='area')
    elif payload.widget in GROUPS:
        if not symbols and payload.widget!='market-data':
            raise ValueError('请至少填写一个标的代码。')
        if payload.widget == 'symbol-overview':
            config['symbols'] = [[s+'|1D'] for s in symbols]
        elif payload.widget == 'market-data' and symbols:
            config['symbolsGroups'] = [{'name': '关注标的' if payload.language.startswith('zh') else 'Watchlist',
                                        'symbols': [{'name': s} for s in symbols]}]
        elif payload.widget!='market-data':
            config['symbols'] = [{'proName': s} for s in symbols]
    else:
        if len(symbols) != 1:
            raise ValueError('该组件需要且只支持一个标的代码。')
        symbol = symbols[0]
    if payload.interval and payload.interval not in {'advanced-chart':{'D','W','M','60'},'technical-analysis':{'1D','1W','1M','1h'}}.get(payload.widget,set()):
        raise ValueError('该组件不支持此周期。')
    built = tool.build_config(payload.widget, symbol=symbol, interval=payload.interval, theme=payload.theme,
                             language=payload.language, config=config)
    catalogue = json.loads((ROOT/'app/static/widget-catalog.json').read_text())
    item = next((c for c in catalogue if c.get('widget') == payload.widget and c.get('preset') == payload.preset), None)
    if item is None:
        raise ValueError('该组件已从看板库移除。')
    labels = {'america':'美股','china':'中国 A 股','hongkong':'港股','japan':'日本','uk':'英国','germany':'德国','us':'美国','cn':'中国','eu':'欧元区','gb':'英国','jp':'日本'}
    suffix = ', '.join(symbols) if symbols else labels.get(payload.market, item.get('defaultScope', ''))
    title = item['title'] + (' · '+suffix if suffix else '')
    height = 160 if payload.widget in {'ticker-tape', 'single-ticker', 'tickers'} else 560
    document = tool.render(payload.widget, built, title, height, payload.language, preset=payload.preset)
    # The content hash makes repeated additions reusable and updates on renderer changes.
    digest = hashlib.sha256(document.encode()).hexdigest()[:24]
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir/f'widget-tradingview-{digest}.html'
    if not target.exists():
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=output_dir, suffix='.tmp', delete=False) as stream:
            stream.write(document)
            temporary = Path(stream.name)
        temporary.replace(target)
    return {'title': title, 'url': '/generated/'+target.name, 'provider': 'TradingView',
            'widget': payload.widget, 'config': built, 'mode': 'direct'}


@router.post('/api/widgets/tradingview')
def add_tradingview(payload: TradingViewInput):
    try:
        return build_widget(payload)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get('/api/widgets/symbols')
def find_symbols(query: str = Query(min_length=1, max_length=80), market: Literal['us','hk','cn','auto'] = 'us'):
    try:
        return {'results': search_symbols(query, market)}
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get('/api/widgets/default-boards')
def default_boards():
    """Editable starter boards inspired by the official asset-class solutions."""
    definitions=[
        ('stocks','股票','NASDAQ:AAPL',['symbol-info','advanced-chart','company-profile','fundamental-data','technical-analysis','top-stories']),
        ('crypto','加密货币','BITSTAMP:BTCUSD',['symbol-info','advanced-chart','company-profile','technical-analysis','top-stories','crypto-heatmap','crypto-mkt-screener']),
        ('forex','外汇','OANDA:EURUSD',['symbol-info','advanced-chart','company-profile','technical-analysis','top-stories','economic-calendar','forex-cross-rates']),
    ]
    boards=[]
    for key,title,symbol,widgets in definitions:
        cards=[];y=0
        for index,widget in enumerate(widgets):
            full=index<2 or index>=5
            w=12 if full else 6
            h=12 if widget=='symbol-info' else 26 if widget=='advanced-chart' else 24
            symbols=[] if widget in MARKETS|CURRENCY_WIDGETS else [symbol]
            result=build_widget(TradingViewInput(widget=widget,symbols=symbols))
            # Paired supporting details share a row; primary charts span the canvas.
            x=6 if index==3 else 0
            cards.append({'id':key+'-'+widget,'component':'tv-'+widget,'title':result['title'],
                          'url':result['url'],'status':'ready','x':x,'y':y,'w':w,'h':h,
                          'parameters':{'symbols':symbols,'market':'default',**({'interval':result['config']['interval']} if result['config'].get('interval') else {})}})
            if index!=2:y+=h+1
        boards.append({'id':'starter-'+key,'title':title,'focusSymbol':symbol,'cards':cards,'messages':[],
                       'sourceUrl':f'https://www.tradingview.com/widget-docs/solutions/{key}-dark/'})
    return {'version':1,'boards':boards}


@router.post('/api/widgets/presets/{component_id}')
def add_preset(component_id: str):
    """Add a ready-to-use component without asking for parameters or calling a model."""
    catalog=json.loads((ROOT/'app/static/widget-catalog.json').read_text())
    item=next((row for row in catalog if row['id']==component_id),None)
    if not item:
        raise HTTPException(status_code=404,detail='图表已从图表库移除。')
    if item.get('provider')=='TradingView':
        directory=json.loads((ROOT/'app/static/tradingview-directory.json').read_text())
        meta=next(row for row in directory['widgets'] if row['widget']==item['widget'])
        symbols=meta['symbols']
        if item.get('preset')=='intraday':symbols=['NASDAQ:AAPL']
        if item.get('preset') in {'forex','crypto-pairs'}:symbols=[]
        result=build_widget(TradingViewInput(widget=item['widget'],symbols=symbols,preset=item.get('preset')))
        result['parameters']={'symbols':symbols,'market':'default',**({'interval':result['config']['interval']} if result['config'].get('interval') else {})}
        return result
    manifest=json.loads((ROOT/'app/static/cases/inspiration/manifest.json').read_text())
    case=next((row for row in manifest['cases'] if row['id']=='business-'+component_id),None)
    if not case:
        raise HTTPException(status_code=404,detail='该图表的预制内容暂不可用。')
    cached=json.loads((ROOT/'app'/case['conversationUrl'].lstrip('/')).read_text())
    artifact=cached['answer']['reportArtifacts'][0]
    from urllib.parse import urlparse
    source=(ROOT/'app'/urlparse(artifact['url']).path.lstrip('/')).resolve()
    if not source.is_relative_to(ROOT/'app/static/cases') or not source.is_file():
        raise HTTPException(status_code=404,detail='预制图表暂不可用。')
    content=source.read_bytes()
    target=GENERATED/('widget-preset-'+hashlib.sha256(content).hexdigest()[:24]+'.html')
    GENERATED.mkdir(parents=True,exist_ok=True)
    if not target.exists():target.write_bytes(content)
    symbol=case['title'].split(' · ')[0].strip()
    return {'title':case['title'],'url':'/generated/'+target.name,'mode':'preset','cachedDate':case['cachedDate'],
            'parameters':{'symbols':[symbol],'market':'default'}}
