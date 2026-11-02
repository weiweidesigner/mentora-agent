"""The data screener is discoverable and executable through the application."""
import json
from pathlib import Path

import pytest
from app.capability_index import CapabilityIndex
from app.skill_runner import _registered_script

ROOT = Path(__file__).resolve().parents[1]


def test_screener_script_is_registered():
    script, metadata = _registered_script('screen.py', ROOT)
    assert script == ROOT / 'app/skills/ainvest-screener/scripts/screen.py'
    assert script.is_file()
    assert metadata['name'] == 'ainvest_screener'


@pytest.mark.parametrize('question', [
    '帮我筛选科技或能源行业的 ETF，费率不超过0.5%、日成交量至少10万，按资产规模从大到小，用表格展示',
    '帮我选市盈率低于20、ROE至少15%的美股',
    '今天涨的比较好的ETF有哪些？用表格展示给我',
    '使用 ainvest-screener，筛选科技或能源行业的 ETF',
])
def test_natural_language_screening_discovers_data_tool(tmp_path, question):
    # Build an installation-independent catalog, retaining competing heatmap data.
    entries = json.loads((ROOT / 'app/module_registry.json').read_text())
    registry = tmp_path / 'app/module_registry.json'
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps(entries))
    for name in ['ainvest-screener', 'business-chart-recall']:
        canonical = tmp_path / 'app/skills' / name / 'scripts'
        canonical.mkdir(parents=True)
        (canonical / ('screen.py' if name == 'ainvest-screener' else 'etf_heatmap.py')).write_text('')
        bridge = tmp_path / '.agents/skills' / name / 'SKILL.md'
        bridge.parent.mkdir(parents=True)
        text = (ROOT / '.agents/skills/ainvest-screener/SKILL.md').read_text() if name == 'ainvest-screener' else '---\nname: business-chart-recall\ndescription: ETF heatmap, sector and AUM market charts.\n---\n'
        bridge.write_text(text)
    shortlist = CapabilityIndex(tmp_path).shortlist(question)
    assert 'screen.py' in [item['script'] for item in shortlist.modules]
    assert 'ainvest-screener' in [item['name'] for item in shortlist.skills]
