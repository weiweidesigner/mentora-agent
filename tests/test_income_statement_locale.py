import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'app/skills/business-chart-recall/scripts/income_statement.py'
spec = importlib.util.spec_from_file_location('income_locale', SCRIPT)
income = importlib.util.module_from_spec(spec)
spec.loader.exec_module(income)


def test_translation_preserves_financial_values_and_localizes_all_views():
    original = income.sample_payload()
    for language, title, metric in [('zh-CN', '利润表', '净利润'), ('zh-Hant', '利潤表', '淨利潤'), ('en', 'Income Statement', 'Net Income')]:
        payload = income.apply_language(original, language)
        assert payload['title'] == title
        assert payload['trendMetrics'][0]['label'] == metric
        for key, view in payload['views'].items():
            assert view['label'] == income.language_bundle(language)[key]
            assert view['trendRecords'] == original['views'][key]['trendRecords']
        html = income.render_html(payload)
        assert f'lang="{language}"' in html
        assert '<span class="tip-name">YoY</span>' not in html


def test_cli_preserves_payload_locale_and_supports_theme_override(tmp_path):
    payload = income.apply_language(income.sample_payload(), 'zh-Hant')
    source = tmp_path / 'input.json'
    output = tmp_path / 'output.html'
    source.write_text(json.dumps(payload))
    subprocess.run([sys.executable, str(SCRIPT), '--payload', str(source), '--theme', 'dark', '--output', str(output)], check=True, capture_output=True)
    html = output.read_text()
    assert 'data-theme="dark"' in html
    assert '利潤表' in html
    assert "grid: 'var(--grid)'" in html
    assert "payload.i18n.yoy" in html
