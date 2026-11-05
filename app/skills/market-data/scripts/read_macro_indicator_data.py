#!/usr/bin/env python3
"""Read the existing AInvest macro source without selecting or rendering a chart."""
import argparse
import importlib.util
import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SCHEMA = Path(__file__).resolve().parents[1] / 'schemas/read_macro_indicator_data.schema.json'


@lru_cache(maxsize=1)
def source_module():
    path = ROOT / 'app/skills/business-chart-recall/scripts/macro_indicator.py'
    spec = importlib.util.spec_from_file_location('ainvest_macro_data_source', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_data(args, source=None):
    native = source or source_module()
    if args.symbol and (args.country or args.indicator):
        raise ValueError('Use --symbol or --country/--indicator, not both')
    listing = args.list_countries or args.list_indicators
    if listing and args.source_input:
        raise ValueError('Catalog listing cannot override an explicit data handoff')
    if not listing and not args.source_input and not (args.symbol or (args.country and args.indicator)):
        raise ValueError('Specify --symbol or both --country and --indicator; discover identities with the catalog options')
    raw = json.loads(Path(args.source_input).read_text()) if args.source_input else native.fetch_data(args)
    if raw.get('listing'):
        return {'type': 'macro-catalog', 'rendered': False, **raw,
                'source': {'provider': 'AInvest', 'inputMode': 'live-catalog'}}
    requested = args.symbol or ((args.country + args.indicator) if args.country and args.indicator else None)
    if requested and str(raw.get('symbol', '')).upper() != requested.upper():
        raise ValueError('Macro source identity mismatch')
    payload = native.normalize(raw, args)
    if payload.get('unavailable') or not payload.get('history'):
        raise ValueError('Requested country/indicator has no available source history')
    payload.pop('chartType', None)
    provenance = raw.get('source')
    if not provenance:
        provenance = ({'provider': 'AInvest', 'inputMode': 'source-input',
                       'notes': 'Explicit source handoff; original retrieval time was not supplied'}
                      if args.source_input else native.source_metadata(payload['symbol']))
    return {**payload, 'type': 'macro-data', 'operation': 'history', 'rendered': False, 'source': provenance}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--schema', action='store_true')
    parser.add_argument('--country'); parser.add_argument('--indicator'); parser.add_argument('--symbol')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--list-countries', action='store_true')
    group.add_argument('--list-indicators', action='store_true')
    parser.add_argument('--source-input'); parser.add_argument('--output')
    args = parser.parse_args()
    if args.schema:
        print(SCHEMA.read_text()); return 0
    if not args.output or Path(args.output).suffix.lower() != '.json':
        parser.error('--output must be a JSON path')
    try:
        payload = read_data(args)
        output = Path(args.output).expanduser(); output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False) + '\n')
        summary = {k: payload[k] for k in ('symbol','country','indicator','unit','frequency','observationPeriod','source') if k in payload}
        if payload['type'] == 'macro-catalog':
            summary.update(listing=payload['listing'],countryCount=len(payload['catalog']['countries']),
                           indicatorCount=len(payload['catalog']['indicators']))
        else:
            history = payload['history']
            summary.update(observationCount=len(history),nullCount=sum(p['v'] is None for p in history),
                           firstObservation=history[0],lastObservation=history[-1])
        print(json.dumps({'output': str(output.resolve()), 'artifactKind': 'data', 'rendered': False, 'summary': summary}, ensure_ascii=False))
        return 0
    except (ValueError, RuntimeError, OSError, KeyError, TypeError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False)); return 1


if __name__ == '__main__':
    raise SystemExit(main())
