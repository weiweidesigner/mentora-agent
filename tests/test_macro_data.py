import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'app/skills/market-data/scripts/read_macro_data.py'
spec = importlib.util.spec_from_file_location('macro_data', SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def snap(fields, records):
    return {'indicator': [{'id': f} for f in fields], 'data': [
        {'symbol_code': code, 'value': [{'v': v} for v in values]} for code, values in records.items()]}


def test_snapshot_uses_field_identity_preserves_units_null_zero():
    data = snap(['GDP', 'GDPYY'], {'CN': [19498039388043, 4.5], 'AR': [None, 0]})
    assert m.normalize_snapshot(data, ['GDPYY', 'GDP']) == [
        {'symbol': 'CN', 'GDPYY': 4.5, 'GDP': 19498039388043}, {'symbol': 'AR', 'GDPYY': 0, 'GDP': None}]
    with pytest.raises(ValueError):
        m.normalize_snapshot(data, ['macro_last'])


def test_series_preserves_all_source_observations():
    points = [{'t': 100, 'v': 1}, {'t': 100, 'v': None}, {'t': 200, 'v': -105572000000}]
    raw = {'indicator': [{'id': 'other'}, {'id': 'macro_last'}], 'data': [
        {'symbol_code': 'USBOT', 'value': [{}, {'value': points}]}]}
    assert m.normalize_series(raw, 'USBOT') == points
    with pytest.raises(ValueError):
        m.normalize_series(raw, 'USUR')


def test_gdp_combines_fields_and_requests_full_live_group(monkeypatch):
    catalog = {'groups': [{'group_key': 'G20', 'rows': [
        {'country_code': f'{a}{b}', 'country_name': f'{a}{b}'} for a, b in ['CN','US','DE','AR','AU','BR','CA']]}]}
    calls = []
    def request(session, url, body=None):
        calls.append((url, body))
        return catalog if body is None else snap(['GDPYY', 'GDP'], {'CN': [4.5, 19498039388043]})
    monkeypatch.setattr(m, 'request', request)
    args = argparse.Namespace(operation='gdp-growth', group=None, limit=None)
    result = m.fetch(args, object())
    assert len(calls) == 2
    assert calls[1][1]['page']['count'] == 7
    assert [f['id'] for f in calls[1][1]['indicator']] == ['GDPYY', 'GDP']
    assert result['rendered'] is False and 'presentation' not in result
    assert result['rows'][0]['GDP'] == 19498039388043


def test_network_error_does_not_leak_credentials():
    class Session:
        def get(self, *a, **kw):
            raise m.requests.RequestException('Cookie: secret-token')
    with pytest.raises(RuntimeError) as error:
        m.request(Session(), m.CATALOG)
    assert 'secret-token' not in str(error.value)


def test_schema_and_cli_are_data_only():
    result = subprocess.run([sys.executable, str(SCRIPT), '--schema'], capture_output=True, text=True)
    assert result.returncode == 0
    contract = json.loads(result.stdout)
    assert contract['agentContract']['rendered'] is False
    assert 'presentation' not in contract
    invalid = subprocess.run([sys.executable, str(SCRIPT), '--operation', 'unemployment', '--years', '0',
                              '--output', '/tmp/invalid-macro-data.json'], capture_output=True)
    assert invalid.returncode == 2


def test_active_registry_only_exposes_macro_data_api():
    registry = json.loads((ROOT/'app/module_registry.json').read_text())
    scripts = {r['script'] for r in registry}
    assert 'read_macro_data.py' in scripts
    assert not {'inflation_map.py', 'gdp_growth.py', 'us_unemployment_rate.py',
                'us_interest_rate.py', 'us_trade_balance.py'} & scripts
