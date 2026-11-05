#!/usr/bin/env python3
"""Check every available native AInvest component has a usable Widget entry."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Retained for old artifacts/commands; not independent live AInvest components.
EXCLUDED = {'capital_structure':'Yahoo auto-fetch retired', 'key_statistics':'legacy Yahoo component',
            'us_unemployment_rate':'macro_indicator compatibility alias',
            'us_interest_rate':'macro_indicator compatibility alias',
            'us_trade_balance':'macro_indicator compatibility alias'}


def audit(root=ROOT):
    native = root/'app/skills/business-chart-recall'
    supported = {p.stem for p in (native/'scripts').glob('*.py') if p.stem not in EXCLUDED and not p.stem.startswith('_')}
    if not supported:
        raise ValueError('Pinned business component dependency is not installed')
    tiles = json.loads((root/'app/static/widget-catalog.json').read_text())
    business = [r for r in tiles if r.get('provider')=='business' and r.get('libraryVisible') is not False]
    ids = {r['id'] for r in business}
    registry = {r['script'] for r in json.loads((root/'app/module_registry.json').read_text())}
    return {'supported':len(supported),'listed':len(business),
            'missing':sorted(supported-ids),'extra':sorted(ids-supported),
            'duplicateIds':sorted({r['id'] for r in tiles if sum(x['id']==r['id'] for x in tiles)>1}),
            'unregistered':sorted(r['id'] for r in business if r.get('script') not in registry),
            'missingSchemas':sorted(r['id'] for r in business if not (native/'schemas'/(Path(r['script']).stem+'.schema.json')).is_file()),
            'excluded':EXCLUDED}


if __name__ == '__main__':
    result=audit(); print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(any(result[k] for k in ['missing','extra','duplicateIds','unregistered','missingSchemas']))
