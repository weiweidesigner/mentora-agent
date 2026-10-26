"""Direct manual TradingView embedding. No planner, model, or quote-data fetch."""
from __future__ import annotations

import hashlib
import copy
import importlib.util
import json
import re
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from app.security_symbols import resolve_symbol, search_symbols
from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / 'outputs' / 'generated'
router = APIRouter()


class TradingViewInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    widget: str = Field(min_length=1, max_length=60)
    symbols: list[str] = Field(default_factory=list, max_length=30)
    market: str = Field(default='default', max_length=30)
    preset: Literal['intraday','forex','crypto-pairs'] | None = None
    symbolMarket: Literal['auto', 'us', 'hk', 'cn'] = 'auto'
    theme: Literal['dark', 'light'] = 'dark'
    language: Literal['zh-CN', 'zh-Hant', 'en'] = 'zh-CN'
    interval: str | None = Field(default=None, max_length=10)
    config: dict[str, Any] | None = None
    followTheme: bool = True
    studies: list[Any] | None = None
    style: str | None = Field(default=None, max_length=40)
    compareSymbols: list[str] | None = Field(default=None, max_length=8)
    watchlist: list[str] | None = Field(default=None, max_length=30)
    timezone: str | None = Field(default=None, max_length=64)
    allowSymbolChange: bool | None = None
    showDrawingToolbar: bool | None = None
    showTopToolbar: bool | None = None
    showLegend: bool | None = None
    showVolume: bool | None = None
    showDetails: bool | None = None
    showHotlist: bool | None = None
    showDateRanges: bool | None = None
    showCalendar: bool | None = None
    saveImage: bool | None = None


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
STUDY_ALIASES = {
    'macd': 'MACD@tv-basicstudies',
    'moving average convergence divergence': 'MACD@tv-basicstudies',
    'rsi': 'RSI@tv-basicstudies',
    'relative strength index': 'RSI@tv-basicstudies',
    'roc': 'ROC@tv-basicstudies',
    'rate of change': 'ROC@tv-basicstudies',
    'stochastic rsi': 'StochasticRSI@tv-basicstudies',
    'stochasticrsi': 'StochasticRSI@tv-basicstudies',
    'sma': 'MASimple@tv-basicstudies',
    'simple moving average': 'MASimple@tv-basicstudies',
}
ADVANCED_CHART_INTERVALS = frozenset({'1','5','15','30','60','120','240','D','W','M'})
TECHNICAL_ANALYSIS_INTERVALS = frozenset({'1m','5m','15m','30m','1h','2h','4h','1D','1W','1M'})
INTERVAL_ALIASES = {
    '1m':'1','5m':'5','15m':'15','30m':'30','60m':'60','1h':'60','2h':'120','4h':'240',
    '1d':'D','day':'D','daily':'D','日线':'D','1w':'W','week':'W','weekly':'W','周线':'W',
    '1mo':'M','month':'M','monthly':'M','月线':'M',
}
CHART_STYLE_ALIASES = {
    '0':'0','bar':'0','bars':'0','美国线':'0','棒形图':'0',
    '1':'1','candle':'1','candles':'1','candlestick':'1','candlesticks':'1','k线':'1','蜡烛图':'1',
    '2':'2','line':'2','line chart':'2','折线':'2','折线图':'2',
    '3':'3','area':'3','area chart':'3','面积':'3','面积图':'3',
    '4':'4','renko':'4','砖型图':'4',
    '5':'5','kagi':'5','卡吉图':'5',
    '6':'6','point and figure':'6','point & figure':'6','pnf':'6','点数图':'6',
    '7':'7','line break':'7','新价线':'7',
    '8':'8','heikin ashi':'8','heikin-ashi':'8','平均k线':'8',
    '9':'9','hollow candle':'9','hollow candles':'9','空心k线':'9',
    '10':'10','baseline':'10','基准线':'10',
}
ADVANCED_CHART_OPTION_FIELDS = frozenset({
    'style','compareSymbols','watchlist','timezone','allowSymbolChange','showDrawingToolbar',
    'showTopToolbar','showLegend','showVolume','showDetails','showHotlist','showDateRanges',
    'showCalendar','saveImage',
})


def normalize_studies(values: list[Any] | None) -> list[Any]:
    normalized = []
    for raw in values or []:
        value = raw.strip() if isinstance(raw, str) else copy.deepcopy(raw)
        canonical = STUDY_ALIASES.get(value.lower(), value) if isinstance(value, str) else value
        if canonical not in normalized:
            normalized.append(canonical)
    return normalized


OPTION_KEYS = {
    'symbols':'symbol', 'interval':'interval', 'studies':'studies', 'style':'style',
    'compareSymbols':'compareSymbols', 'watchlist':'watchlist', 'timezone':'timezone',
    'allowSymbolChange':'allow_symbol_change', 'showDetails':'details', 'showHotlist':'hotlist',
    'showDateRanges':'withdateranges', 'showCalendar':'calendar', 'saveImage':'save_image',
    'showDrawingToolbar':'hide_side_toolbar', 'showTopToolbar':'hide_top_toolbar',
    'showLegend':'hide_legend', 'showVolume':'hide_volume',
}


def merge_tradingview_parameters(previous: dict, patch: dict) -> dict:
    """Merge config patches without allowing a stale shorthand to undo an edit."""
    merged = copy.deepcopy(previous)
    merged.update(copy.deepcopy(patch))
    if 'config' in previous or 'config' in patch:
        def merge(left,right):
            result=copy.deepcopy(left)
            for key,value in right.items():
                result[key]=merge(result[key],value) if isinstance(result.get(key),dict) and isinstance(value,dict) else copy.deepcopy(value)
            return result
        config = merge(previous.get('config') or {},patch.get('config') or {})
        raw_patch=patch.get('config') or {}
        if 'symbols' in patch:
            for key in ('symbol','symbols','symbolsGroups','currencies','broker'):
                if key not in raw_patch:config.pop(key,None)
        if 'market' in patch:
            for key in ('market','exchange','countryFilter'):
                if key not in raw_patch:config.pop(key,None)
        for shorthand, key in OPTION_KEYS.items():
            if shorthand in patch and key not in (patch.get('config') or {}):
                config.pop(key, None)
            elif key in (patch.get('config') or {}):
                merged.pop(shorthand, None)
        merged['config'] = config
    return merged


def validate_tradingview_config(widget: str, config: dict) -> dict:
    """Validate safe JSON; the official widget owns its settings API."""
    renderer().build_config(widget, config=config)
    return copy.deepcopy(config)


def normalize_interval(value: str | None) -> str | None:
    if value is None:
        return None
    raw = value.strip()
    if raw in ADVANCED_CHART_INTERVALS:
        return raw
    normalized = INTERVAL_ALIASES.get(raw.lower())
    if normalized:
        return normalized
    raise ValueError('高级图表周期支持 1/5/15/30 分钟、1/2/4 小时、日线、周线和月线。')


def normalize_chart_style(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = CHART_STYLE_ALIASES.get(value.strip().lower())
    if not normalized:
        raise ValueError('高级图表不支持该图表样式。')
    return normalized

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
    raw_config = validate_tradingview_config(payload.widget, payload.config or {})
    values = list(dict.fromkeys(s.strip() for s in payload.symbols if s.strip()))
    if not values and payload.widget not in MARKETS and isinstance(raw_config.get('symbol'), str):
        values = [raw_config['symbol']]
    if not values and payload.config is not None and payload.widget not in MARKETS|GROUPS|CURRENCY_WIDGETS|BROKER_WIDGETS:
        default_symbol=tool.CATALOG[payload.widget]['defaults'].get('symbol')
        if default_symbol:values=[default_symbol]
    if (payload.preset=='intraday' or (payload.widget not in MARKETS|GROUPS|CURRENCY_WIDGETS|BROKER_WIDGETS)) and len(values) != 1:
        raise ValueError('该组件需要且只支持一个标的。')
    symbols = values if payload.widget in MARKETS|CURRENCY_WIDGETS|BROKER_WIDGETS else list(dict.fromkeys(resolve_symbol(s, payload.symbolMarket) for s in values))
    config = {}
    studies = normalize_studies(payload.studies)
    if payload.studies is not None and payload.widget != 'advanced-chart':
        raise ValueError('只有 TradingView 高级图表支持预设技术指标。')
    advanced_values = {field: getattr(payload, field) for field in ADVANCED_CHART_OPTION_FIELDS if getattr(payload, field) is not None}
    if (advanced_values or payload.studies is not None) and payload.widget != 'advanced-chart':
        raise ValueError('这些图表设置只支持 TradingView 高级图表。')
    if payload.widget == 'advanced-chart':
        config['studies'] = studies
        if payload.style is not None:
            config['style'] = normalize_chart_style(payload.style)
        if payload.compareSymbols is not None:
            config['compareSymbols'] = list(dict.fromkeys(resolve_symbol(value, payload.symbolMarket) for value in payload.compareSymbols if value.strip()))
        if payload.watchlist is not None:
            config['watchlist'] = list(dict.fromkeys(resolve_symbol(value, payload.symbolMarket) for value in payload.watchlist if value.strip()))
        if payload.timezone is not None:
            timezone = payload.timezone.strip()
            if not re.fullmatch(r'(?:exchange|Etc/UTC|[A-Za-z_]+(?:/[A-Za-z0-9_+\-]+)+)', timezone):
                raise ValueError('请使用 TradingView 支持的时区，例如 exchange、Etc/UTC 或 Asia/Shanghai。')
            config['timezone'] = timezone
        switches = {
            'allowSymbolChange':'allow_symbol_change','showDetails':'details','showHotlist':'hotlist',
            'showDateRanges':'withdateranges','showCalendar':'calendar','saveImage':'save_image',
        }
        for source, target in switches.items():
            value = getattr(payload, source)
            if value is not None:
                config[target] = value
        inverted = {
            'showDrawingToolbar':'hide_side_toolbar','showTopToolbar':'hide_top_toolbar',
            'showLegend':'hide_legend','showVolume':'hide_volume',
        }
        for source, target in inverted.items():
            value = getattr(payload, source)
            if value is not None:
                config[target] = not value
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
        if len(values)!=1 or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,49}',values[0].lower()):
            raise ValueError('请输入 TradingView 经纪商标识，例如 easymarkets。')
        config['broker']=values[0].lower()
    elif payload.preset == 'intraday':
        config.update(symbols=[[symbols[0]+'|1']], dateRanges=['1d|1'], chartType='area')
    elif payload.widget in GROUPS:
        if not symbols and payload.widget!='market-data' and payload.config is None:
            raise ValueError('请至少填写一个标的代码。')
        if payload.widget == 'symbol-overview' and symbols:
            config['symbols'] = [[s+'|1D'] for s in symbols]
        elif payload.widget == 'market-data' and symbols:
            config['symbolsGroups'] = [{'name': '关注标的' if payload.language.startswith('zh') else 'Watchlist',
                                        'symbols': [{'name': s} for s in symbols]}]
        elif payload.widget!='market-data' and symbols:
            config['symbols'] = [{'proName': s} for s in symbols]
    else:
        if len(symbols) != 1:
            raise ValueError('该组件需要且只支持一个标的代码。')
        symbol = symbols[0]
    # Raw Skill config is canonical; legacy convenience fields remain adapters.
    config.update(raw_config)
    symbol = config.get('symbol', symbol)
    interval = normalize_interval(payload.interval) if payload.interval and payload.widget == 'advanced-chart' else payload.interval
    if interval and interval not in {'advanced-chart':ADVANCED_CHART_INTERVALS,'technical-analysis':TECHNICAL_ANALYSIS_INTERVALS}.get(payload.widget,set()):
        raise ValueError('该组件不支持此周期。')
    theme=payload.theme if payload.followTheme else config.get('colorTheme',config.get('theme',payload.theme))
    language=config.get('locale',config.get('lang',payload.language))
    built = tool.build_config(payload.widget, symbol=symbol, interval=config.get('interval', interval), theme=theme,
                             language=language, config=config)
    catalogue = json.loads((ROOT/'app/static/widget-catalog.json').read_text())
    item = next((c for c in catalogue if c.get('widget') == payload.widget and c.get('preset') == payload.preset), None)
    if item is None:
        raise ValueError('该组件已从看板库移除。')
    labels = {'america':'美股','china':'中国 A 股','hongkong':'港股','japan':'日本','uk':'英国','germany':'德国','us':'美国','cn':'中国','eu':'欧元区','gb':'英国','jp':'日本'}
    if isinstance(built.get('symbol'),str):symbols=[built['symbol']]
    elif payload.widget=='symbol-overview':symbols=[entry[-1].split('|')[0] for entry in built.get('symbols',[]) if isinstance(entry,list) and entry and isinstance(entry[-1],str)]
    suffix = ', '.join(symbols) if symbols else labels.get(payload.market, item.get('defaultScope', ''))
    title = item['title'] + (' · '+suffix if suffix else '')
    height = 160 if payload.widget in {'ticker-tape', 'single-ticker', 'tickers'} else 560
    document = tool.render(payload.widget, built, title, height, language, preset=payload.preset,
                          follow_theme=payload.followTheme,preserve_styles=raw_config.keys())
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
    # Native components must collect current source data through their Skill.
    # Cached gallery examples are never a substitute for a successful refresh.
    raise HTTPException(status_code=409,detail='此组件需要实时取数生成，请通过组件库或对话添加。')
