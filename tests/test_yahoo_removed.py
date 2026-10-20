import json
from pathlib import Path
from unittest.mock import patch

from app import main


ROOT = Path(__file__).parents[1]


def test_removed_yahoo_tool_is_not_installed_or_registered():
    assert not (ROOT / 'app/skills/yahoo-data').exists()
    assert not (ROOT / '.agents/skills/yahoo-data/SKILL.md').exists()
    assert not (ROOT / 'yahoo-market-data.lock.json').exists()
    registry = json.loads((ROOT / 'app/module_registry.json').read_text())
    assert all(item['script'] != 'yahoo_data.py' for item in registry)
    assert 'yahoo_data.py' not in main.ALLOWED_COMPONENTS_BY_FILE
    assert not main.script_path_for_filename('yahoo_data.py').exists()


def test_legacy_security_lookup_never_requests_yahoo():
    main.yahoo_security_search_candidates.cache_clear()
    with patch.object(main.requests, 'get', side_effect=AssertionError('Yahoo must not be contacted')):
        assert main.yahoo_security_search_candidates('AAPL') == ()


def test_old_skill_selection_cannot_restore_yahoo():
    skills = main.enforce_skill_market_scope('AAPL K线', ['business-chart-recall', 'yahoo-data'])
    assert 'yahoo-data' not in skills
