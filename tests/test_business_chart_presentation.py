"""Offline coverage for each business renderer's actual presentation contract."""
from __future__ import annotations

import copy
import importlib.util
import inspect
import json
import re
import sys
from functools import lru_cache
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'app/skills/business-chart-recall/scripts'
NAMES = [p.stem for p in sorted(SCRIPTS.glob('*.py')) if p.stem not in {'kline', 'multi_intraday', 'multi_kline'}]


@lru_cache(None)
def load(name):
    sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location('presentation_' + name, SCRIPTS / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture(name, module):
    sample = getattr(module, 'build_sample_payload', getattr(module, 'sample_payload', None))
    if sample:
        signature = inspect.signature(sample)
        return sample() if all(p.default != inspect.Parameter.empty for p in signature.parameters.values()) else sample('SAMPLE')
    if name == 'eps_estimate':
        return {'name': 'Earnings Estimate', 'title': 'Earnings Estimate', 'code': 'SAMPLE', 'data': [{'label': "Q1 '26", 'actual': 1.0, 'estimate': 0.9, 'statusKey': 'Beat', 'date': 'Mar 31, 2026', 'surprise': 0.1, 'surprisePercent': 11.1}]}
    if name == 'key_statistics':
        return {'name': '关键统计数据', 'items': [{'key': '最新价格', 'value': '100', 'unit': 'USD'}, {'key': '收入(FY 2025)', 'value': '200', 'unit': 'USD'}]}
    if name in {'revenue_geography', 'revenue_sources'}:
        return {'name': 'Revenue Breakdown by Geography' if name == 'revenue_geography' else 'Revenue Breakdown by Source / Business', 'title': 'Revenue Breakdown by Geography' if name == 'revenue_geography' else 'Revenue Breakdown by Source / Business', 'props': {'height': 360, 'items': [{'label': 'United States', 'rawLabel': 'United States', 'value': 100, 'displayValue': '100 USD'}]}, 'source': {'symbol': 'SAMPLE', 'unit': 'USD'}}
    if name == 'capital_structure':
        return {'name': '资本结构', 'title': '资本结构', 'type': 'waterfall', 'data': [{'label': '市值', 'value': 100}, {'label': '负债', 'value': 10}, {'label': '现金等价物', 'value': -5}, {'label': '企业价值', 'value': 105, 'type': 'total'}], 'props': {'height': 320}}
    if name == 'valuation':
        return {'type': 'double-ring-pie', 'name': 'Valuation', 'title': 'Valuation', 'props': {'base': {'label': 'Market Cap', 'value': 100, 'displayValue': '100 USD'}, 'rings': [{'label': 'Revenue', 'value': 20, 'displayValue': '20 USD'}], 'centerLabel': '100 USD', 'height': 430}, 'source': {'symbol': 'SAMPLE'}}
    if name == 'dividend_yield':
        return {'title': 'Dividend Yield', 'code': 'SAMPLE', 'series': [{'date': '2026-01-01', 'yield': 0.03}, {'date': '2026-02-01', 'yield': 0.04}]}
    if name == 'payout_ratio':
        return {'title': 'Payout Ratio', 'code': 'SAMPLE', 'series': [{'year': '2025', 'netProfit': 100, 'cashDividend': 20, 'payoutRatio': 0.2}]}
    raise AssertionError('Missing offline fixture: ' + name)


@pytest.mark.parametrize('name', NAMES)
@pytest.mark.parametrize('language', ['en', 'zh-CN', 'zh-Hant'])
def test_every_renderer_honors_locale_and_dark_theme_without_fetching(name, language):
    module = load(name)
    payload = fixture(name, module)
    payload.update(language=language, theme='dark')
    before = copy.deepcopy(payload)
    render = getattr(module, 'render_html', getattr(module, 'render_document', None))
    if name == 'capital_structure':
        render = module.render_capital_structure_document
    elif name == 'valuation':
        render = module._render_with_title
    document = render(payload)
    assert f'lang="{language}"' in document
    assert 'data-theme="dark"' in document
    assert ':root[data-theme="dark"]' in document
    assert payload == before, 'Rendering must not mutate its input financial payload'
    assert '__LANG__' not in document and '__THEME__' not in document


@pytest.mark.parametrize('name', ['about_company', 'congress_trades', 'executive_profile', 'fundamental_investment_rating', 'institution_trades', 'key_financial_indicators', 'key_statistics', 'related_section', 'volume_profile', 'capital_structure'])
def test_previously_ignored_language_is_now_applied_to_component_ui(name):
    module = load(name)
    original = fixture(name, module)
    chinese = module._prepare_component_payload({**original, 'language': 'zh-CN'})
    english = module._prepare_component_payload({**original, 'language': 'en'})
    assert chinese['language'] == 'zh-CN'
    assert english['language'] == 'en'
    assert chinese.get('source') == original.get('source')
    assert any(chinese['componentUi'][key] != value for key, value in english['componentUi'].items())


def test_query_language_overrides_planner_default_for_business_components():
    from app.main import add_language_arg_if_supported
    from types import SimpleNamespace
    selected = SimpleNamespace(filename='about_company.py')
    args = add_language_arg_if_supported(selected, ['--language', 'en', '--code', 'AAPL'], 'zh-CN', force=True)
    assert args[args.index('--language') + 1] == 'zh-CN'
    assert args.count('--language') == 1


def test_geography_saved_payload_can_switch_languages_without_changing_revenues():
    module = load('revenue_geography')
    payload = fixture('revenue_geography', module)
    chinese = module.apply_language(payload, 'zh-CN')
    english = module.apply_language(chinese, 'en')
    assert chinese['props']['items'][0]['label'] == '美国'
    assert english['props']['items'][0]['label'] == 'United States'
    assert chinese['props']['items'][0]['value'] == english['props']['items'][0]['value'] == 100
