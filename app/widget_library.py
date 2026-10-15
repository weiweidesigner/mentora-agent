"""Direct manual TradingView embedding. No planner, model, or market-data fetch."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / 'outputs' / 'generated'
router = APIRouter()


class TradingViewInput(BaseModel):
    widget: str = Field(min_length=1, max_length=60)
    symbols: list[str] = Field(default_factory=list, max_length=30)
    market: str = Field(default='default', max_length=30)
    theme: Literal['dark', 'light'] = 'dark'
    language: Literal['zh-CN', 'zh-Hant', 'en'] = 'zh-CN'


@lru_cache(maxsize=1)
def renderer():
    path = ROOT / 'app/skills/trading-view-chart/scripts/trading_view_chart.py'
    spec = importlib.util.spec_from_file_location('widget_library_tradingview', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


GROUPS = {'symbol-overview', 'market-data', 'ticker-tape', 'tickers'}
MARKETS = {'screener', 'crypto-mkt-screener', 'stock-heatmap', 'crypto-heatmap',
           'market-overview', 'economic-calendar', 'top-stories'}
REGIONS = {'default', 'us', 'cn', 'eu', 'gb', 'jp'}
STOCK_MARKETS = {'default', 'america', 'china', 'hongkong', 'japan', 'uk', 'germany'}


def build_widget(payload: TradingViewInput, output_dir: Path = GENERATED) -> dict:
    tool = renderer()
    if payload.widget not in tool.CATALOG:
        raise ValueError('不支持的 TradingView 组件')
    symbols = list(dict.fromkeys(s.strip().upper() for s in payload.symbols if s.strip()))
    if any(not re.fullmatch(r'(?:[A-Z0-9_]+:)?[A-Z0-9_.!/^+\-]{1,80}', s) for s in symbols):
        raise ValueError('请填写股票代码，例如 NASDAQ:AAPL；多个标的用逗号分隔。')
    config = {}
    symbol = None
    if payload.widget in MARKETS:
        if symbols:
            raise ValueError('该组件按市场展示，无需填写股票代码。')
        allowed = STOCK_MARKETS if payload.widget == 'screener' else REGIONS if payload.widget == 'economic-calendar' else {'default'}
        if payload.market not in allowed:
            raise ValueError('请选择列表中支持的市场范围。')
        if payload.widget == 'screener':
            config['market'] = 'america' if payload.market == 'default' else payload.market
        elif payload.widget == 'economic-calendar' and payload.market != 'default':
            config['countryFilter'] = payload.market
    elif payload.widget in GROUPS:
        if not symbols:
            raise ValueError('请至少填写一个标的代码。')
        if payload.widget == 'symbol-overview':
            config['symbols'] = [[s+'|1D'] for s in symbols]
        elif payload.widget == 'market-data':
            config['symbolsGroups'] = [{'name': '关注标的' if payload.language.startswith('zh') else 'Watchlist',
                                        'symbols': [{'name': s} for s in symbols]}]
        else:
            config['symbols'] = [{'proName': s} for s in symbols]
    else:
        if len(symbols) != 1:
            raise ValueError('该组件需要且只支持一个标的代码。')
        symbol = symbols[0]
    built = tool.build_config(payload.widget, symbol=symbol, theme=payload.theme,
                             language=payload.language, config=config)
    catalogue = json.loads((ROOT/'app/static/widget-catalog.json').read_text())
    item = next((c for c in catalogue if c.get('widget') == payload.widget), None)
    if item is None:
        raise ValueError('该组件已从看板库移除。')
    labels = {'america':'美股','china':'中国 A 股','hongkong':'港股','japan':'日本','uk':'英国','germany':'德国','us':'美国','cn':'中国','eu':'欧元区','gb':'英国','jp':'日本'}
    suffix = ', '.join(symbols) if symbols else labels.get(payload.market, item.get('defaultScope', ''))
    title = item['title'] + (' · '+suffix if suffix else '')
    height = 160 if payload.widget in {'ticker-tape', 'single-ticker', 'tickers'} else 560
    document = tool.render(payload.widget, built, title, height, payload.language)
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
