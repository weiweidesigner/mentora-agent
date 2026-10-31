import json
import subprocess
import sys
from tempfile import TemporaryDirectory
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import widget_planner as planner
from app.widget_capabilities import generation_catalogue

ROOT = Path(__file__).resolve().parents[1]


def test_library_contains_only_components_with_sources_and_registered_renderers():
    library = json.loads((ROOT / 'app/static/widget-catalog.json').read_text())
    assert {'ashare-kline', 'ashare-calendar', 'kline', 'multi_kline', 'multi_intraday', 'cash_flow'} <= {c['id'] for c in library}
    assert not any(c.get('requiresDataSource') or c.get('libraryVisible') is False for c in library)
    assert not any(c['id'].startswith('generic-') or c['id'] in {'streamviz', 'capital_structure'} for c in library)
    for component in library:
        if component['provider'] == 'TradingView':
            continue
        base = ROOT / 'app/skills' / component['skill']
        assert (base / 'scripts' / component['script']).is_file()
        assert (base / 'schemas' / (Path(component['script']).stem + '.schema.json')).is_file()


def test_render_only_capabilities_are_dialogue_only_with_explicit_upstream_requirement():
    components = {c['id']: c for c in generation_catalogue()}
    assert len(components) == len(generation_catalogue())
    hidden = [c for c in components.values() if c.get('libraryVisible') is False]
    assert len(hidden) == 17
    assert {'generic-bar_chart', 'generic-line_chart', 'generic-timeline', 'streamviz'} <= components.keys()
    assert all(c['requiresDataSource'] and c['inputMode'] == 'data' for c in hidden)
    assert all((ROOT / 'app/skills' / c['skill'] / 'scripts' / c['script']).is_file() for c in hidden)


@pytest.mark.parametrize('component', ['generic-bar_chart', 'streamviz', 'ashare-calendar'])
def test_data_components_do_not_require_stock_symbols_and_preserve_full_request(component):
    request = '使用我提供的2026年各季度收入数据，单位万元，制作比较组件'
    payload = planner.PlanningInput(message=request, board={'id': 'b', 'title': '收入', 'cards': []})
    result = planner.validate_plan({'reply': '开始生成', 'actions': [{'type': 'add', 'componentId': component, 'request': request}]}, payload, [])
    assert result['actions'][0]['request'] == request
    assert result['components'][0]['id'] == component


def test_follow_up_generation_keeps_original_data_source_and_date_definition():
    payload = planner.PlanningInput(message='改为环比', board={'id': 'b', 'title': '收入', 'cards': [
        {'id': 'c', 'component': 'generic-line_chart', 'request': '用户CSV中的2026年月收入，单位万元'}]})
    cards = [planner.enrich_card(c) for c in payload.board.cards]
    result = planner.validate_plan({'reply': '修改', 'actions': [{'type': 'update', 'cardId': 'c', 'request': None, 'parameters': {'symbols': []}}]}, payload, cards)
    assert '用户CSV中的2026年月收入，单位万元' in result['actions'][0]['request']
    assert '改为环比' in result['actions'][0]['request']


@pytest.mark.parametrize(('component', 'interval'), [('ashare-kline', '1d'), ('kline', '1h'), ('multi_kline', '1w'), ('multi_intraday', '1m')])
def test_native_chart_intervals(component, interval):
    payload = planner.PlanningInput(message='添加行情', board={'id': 'b', 'title': '行情', 'cards': []})
    action = {'type': 'add', 'componentId': component, 'parameters': {'symbols': ['600519.SH' if component == 'ashare-kline' else 'AAPL'], 'interval': interval}}
    assert planner.validate_plan({'reply': '', 'actions': [action]}, payload, [])['actions'][0]['parameters']['interval'] == interval
    action['parameters']['interval'] = '5s'
    with pytest.raises(ValueError, match='周期'):
        planner.validate_plan({'reply': '', 'actions': [action]}, payload, [])


def test_dialogue_catalogue_endpoint():
    app = FastAPI(); app.include_router(planner.router)
    with TestClient(app) as client:
        result = client.get('/api/widgets/generation-catalog')
    assert result.status_code == 200
    assert any(c['id'] == 'streamviz' for c in result.json())


def test_native_kline_exposes_structured_settings_and_accepts_them_in_board_state():
    component = next(item for item in generation_catalogue() if item['id'] == 'kline')
    fields = {field['key']: field for field in component['settingsSchema']['fields']}
    assert {'interval', 'ma', 'subIndicators', 'klineType', 'fromDate', 'toDate', 'drawingTools'} <= fields.keys()
    assert [option[0] for option in fields['interval']['options']] == ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1M', '3M']
    payload = planner.PlanningInput(message='调整参数', board={'id': 'b', 'title': '行情', 'cards': [{
        'id': 'c', 'component': 'kline', 'parameters': {
            'symbols': ['AAPL'], 'interval': '1d', 'ma': [5, 13, 34],
            'subIndicators': ['VOL', 'RSI'], 'klineType': 'line',
            'fromDate': '2025-01-01', 'toDate': '2026-10-26',
            'limit': 800, 'fullHistory': True, 'drawingTools': False,
        },
    }]})
    assert payload.board.cards[0].parameters.ma == [5, 13, 34]


def test_streamviz_is_allowlisted_and_executes_with_an_explicit_test_payload(tmp_path):
    from app.skill_runner import _registered_script
    script, _ = _registered_script('render_streamviz.py', ROOT)
    assert script.parent.parent.name == 'streamviz'
    assert (script.parent.parent / 'schemas/render_streamviz.schema.json').is_file()
    payload = tmp_path / 'input.json'
    payload.write_text(json.dumps({'title': '显式测试数据', 'layout': 'comparison', 'metrics': [{'label': '测试值', 'value': '100'}], 'note': '仅用于渲染器自动化测试，不是市场数据。'}, ensure_ascii=False))
    with TemporaryDirectory(prefix='widget-render-test-', dir=ROOT / 'outputs') as directory:
        output = Path(directory) / 'component.html'
        result = subprocess.run([sys.executable, str(ROOT / 'app/skill_runner.py'), 'execute', '--script', 'render_streamviz.py', '--', '--input', str(payload), '--output', str(output)], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr + result.stdout
        receipt = json.loads(result.stdout)
        assert receipt['ok'] and receipt['artifacts'][0]['verified']
        assert output.stat().st_size > 500


def test_native_capabilities_are_discoverable_by_the_shared_execution_runtime():
    from app.main import ALLOWED_COMPONENTS_BY_FILE, script_path_for_filename
    for filename, skill in [('render_streamviz.py', 'streamviz'), ('historical_kline.py', 'a-share-data')]:
        assert filename in ALLOWED_COMPONENTS_BY_FILE
        assert script_path_for_filename(filename).parent.parent.name == skill


@pytest.mark.parametrize('component_id,question',[('sector_performance','展示美股行业多周期表现'),('market_momentum','看看美股市场动量'),('fear_greed','看看加密市场恐惧贪婪指数'),('bond_scatter','看看债券收益率和期限分布'),('economic_indicators_heatmap','比较各国主要经济指标'),('macro_indicator','看看澳大利亚利率走势')])
def test_source_backed_library_chart_without_symbol_input(monkeypatch,component_id,question):
    from types import SimpleNamespace
    from app import widget_library
    # The unrelated TradingView dependency is not needed to select a native source-backed chart.
    monkeypatch.setattr(widget_library, "renderer", lambda: SimpleNamespace(CATALOG={}))
    component = next(c for c in generation_catalogue() if c['id'] == component_id)
    assert component['script'] == component_id+'.py'
    assert component['sourceLabel'] == 'AInvest' and component['allowEmptySymbols']
    assert component['libraryVisible'] and not component['requiresDataSource']
    payload = planner.PlanningInput(message=question, board={'id':'b','title':'行业','cards':[]})
    result = planner.validate_plan({'reply':'添加行业表现','actions':[{'type':'add','componentId':component_id,'request':question}]},payload,[])
    assert result['actions'][0]['componentId'] == component_id
