import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('language,suffix', [('en', 'K-line'), ('zh-CN', 'K线'), ('zh-Hant', 'K線')])
def test_a_share_entry_passes_question_language_to_native_kline(monkeypatch, tmp_path, language, suffix):
    script = ROOT / 'app/skills/a-share-data/scripts/historical_kline.py'
    spec = importlib.util.spec_from_file_location('a_share_presentation', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'fetch_historical', lambda *args: {'code': 0, 'data': {'item': [{'date_ms': 1791810000000, 'open_price': 100, 'high_price': 102, 'low_price': 99, 'close_price': 101, 'volume': 1000}]}})
    rendered = {}
    def render(payload, output):
        rendered.update(payload)
        output.write_text('<html></html>')
    monkeypatch.setattr(module, 'render_chart', render)
    output = tmp_path / 'kline.html'
    monkeypatch.setattr(module.sys, 'argv', [str(script), '--thscode', '600519.SH', '--name', '样例', '--start', '2026-10-12', '--end', '2026-10-13', '--language', language, '--theme', 'dark', '--output', str(output)])
    assert module.main() == 0
    props = rendered['component']['props']
    assert props['language'] == language
    assert props['themeMode'] == 'dark'
    assert props['market'] == 'CN'
    assert props['candleColors'] == 'red_up_green_down'
    assert rendered['component']['title'].endswith(suffix)


def test_repository_data_entry_renders_with_pinned_native_kline(monkeypatch, tmp_path):
    script = ROOT / 'app/skills/a-share-data/scripts/historical_kline.py'
    assert script.parent.parent.is_symlink()
    spec = importlib.util.spec_from_file_location('a_share_repository_binding', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.HOST_ROOT == ROOT
    renderer = module.renderer_script()
    assert renderer == ROOT / '.dependencies/us-trading-charts/app/skills/business-chart-recall/scripts/kline.py'
    monkeypatch.setattr(module, 'fetch_historical', lambda *args: {'code': 0, 'data': {'item': [
        {'date_ms': 1791810000000, 'open_price': 100, 'high_price': 102,
         'low_price': 99, 'close_price': 101, 'volume': 1000, 'turnover': 101000},
    ]}})
    output = tmp_path / 'native-kline.html'
    monkeypatch.setattr(module.sys, 'argv', [str(script), '--thscode', '600519.SH',
        '--name', '样例', '--start', '2026-10-12', '--end', '2026-10-13',
        '--language', 'zh-CN', '--theme', 'dark', '--output', str(output)])
    assert module.main() == 0
    document = output.read_text()
    assert 'data-theme="dark"' in document
    assert '600519.SH' in document
    payload = json.loads(output.with_suffix('.json').read_text())
    assert payload['component']['data'][0]['time'] == 1791810000000
    assert payload['component']['data'][0]['close'] == 101
    assert payload['source']['adjust'] == 'forward'
