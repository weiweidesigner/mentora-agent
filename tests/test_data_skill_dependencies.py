from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_data_skills_are_pinned_repository_links():
    for repository, skill in [('yahoo-market-data', 'yahoo-data'), ('data-code-interpreter', 'code-interpreter')]:
        manifest = json.loads((ROOT / f'{repository}.lock.json').read_text())
        checkout = ROOT / manifest['checkout']
        link = ROOT / f'app/skills/{skill}'
        assert link.is_symlink()
        assert link.resolve() == (checkout / f'app/skills/{skill}').resolve()
        assert subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], text=True).strip() == manifest['revision']
        subprocess.run([sys.executable, str(ROOT / f'scripts/sync_{repository.replace("-", "_")}.py'), '--check'], check=True, capture_output=True)


def test_host_classification_and_schema_lookup_survive_repository_links(monkeypatch):
    from app import main
    assert main.skill_name_for_script_filename('yahoo_data.py') == 'yahoo-data'
    assert main.skill_name_for_script_filename('code_interpreter.py') == 'code-interpreter'
    assert main.script_tool_category('yahoo_data.py') == 'yahoo_data'
    assert main.script_tool_category('code_interpreter.py') == 'code_interpreter'
    script = ROOT / 'app/skills/code-interpreter/scripts/code_interpreter.py'
    spec = importlib.util.spec_from_file_location('host_interpreter', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.chdir(ROOT)
    assert module.target_schema_for_chart_type('line')['script'] == 'line_chart.py'
    assert module.target_schema_for_chart_type('kline') == json.loads((ROOT / 'app/skills/business-chart-recall/schemas/kline.schema.json').read_text())


def test_host_invokes_linked_interpreter_offline(tmp_path):
    output = tmp_path / 'result.json'
    subprocess.run([sys.executable, str(ROOT / 'app/skills/code-interpreter/scripts/code_interpreter.py'),
                    '--data-json', '[{"value":10},{"value":20}]', '--transform-code',
                    'def transform(raw_data, question):\n    return {"total": sum(row["value"] for row in raw_data)}',
                    '--question', '计算总和', '--output', str(tmp_path / 'result.html'), '--payload-output', str(output)],
                   cwd=ROOT, check=True, capture_output=True, text=True)
    payload = json.loads(output.read_text())
    assert payload['result'] == {'total': 30}
    assert 'chartPayload' not in payload
