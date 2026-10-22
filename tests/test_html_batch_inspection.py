import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'app/skills/streamviz/scripts/inspect_html.py'
spec = importlib.util.spec_from_file_location('html_batch_inspection', SCRIPT)
inspection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspection)


def test_batches_themes_and_viewports_without_changing_the_artifact(tmp_path):
    page = tmp_path / 'table.html'
    page.write_text('''<!doctype html><html><head><style>
      *{box-sizing:border-box}body{margin:0;padding:12px}
      .scroll{overflow:auto;max-width:100%}table{width:800px}
      </style></head><body><h1>Comparison</h1><div class="scroll">
      <table><tr><td>Verified input</td><td>42</td></tr></table></div></body></html>''')
    original = hashlib.sha256(page.read_bytes()).hexdigest()
    report = asyncio.run(inspection.inspect_html(page, widths=[390, 1000], screenshots_dir=tmp_path / 'shots'))
    assert report['ok'] is True
    assert report['scope'] == 'runtime-and-layout-only'
    assert {(case['width'], case['theme']) for case in report['cases']} == {
        (390, 'light'), (1000, 'light'), (390, 'dark'), (1000, 'dark')}
    for case in report['cases']:
        assert case['measurements']['theme'] == case['theme']
        assert Path(case['screenshot']).stat().st_size > 0
        assert case['errors'] == []
    assert hashlib.sha256(page.read_bytes()).hexdigest() == original


def test_reports_runtime_failures_and_page_overflow_together(tmp_path):
    page = tmp_path / 'broken.html'
    page.write_text('''<!doctype html><body><div style="width:900px">Overflow</div>
                      <script>throw new Error('actual runtime failure')</script></body>''')
    report = asyncio.run(inspection.inspect_html(page, widths=[390], themes=['light']))
    assert report['ok'] is False
    codes = {error['code'] for error in report['cases'][0]['errors']}
    assert codes == {'page-overflow', 'javascript-error'}


def test_clipped_text_is_evidence_for_review_not_an_automatic_failure(tmp_path):
    page = tmp_path / 'clipped.html'
    page.write_text('''<!doctype html><div class="label" style="width:30px;overflow:hidden;white-space:nowrap">
      A long data label</div><div style="width:30px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      Intentional ellipsis</div><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">
      Accessible label</span>''')
    report = asyncio.run(inspection.inspect_html(page, widths=[390], themes=['light']))
    assert report['ok'] is True
    warning = report['cases'][0]['warnings'][0]
    assert warning['code'] == 'clipped-text'
    assert warning['count'] == 1
    assert warning['examples'][0]['selector'] == 'div.label'


def test_missing_artifact_is_not_reported_as_a_success(tmp_path):
    result = subprocess.run([sys.executable, str(SCRIPT), '--input', str(tmp_path / 'missing.html')],
                            text=True, capture_output=True)
    report = json.loads(result.stdout)
    assert result.returncode != 0
    assert report['ok'] is False and report['available'] is False
