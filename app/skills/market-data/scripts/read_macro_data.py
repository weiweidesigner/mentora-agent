#!/usr/bin/env python3
"""Read AInvest macroeconomic data as JSON; no rendering or display sampling."""
import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import time
import uuid
import requests

BASE = 'https://extquote.ainvest.com/index_api/indicator/v2/'
CATALOG = 'https://fundamental.ainvest.com/indicators/macro/v1/catalog/'
FIELDS = ['macro_last', 'macro_unit', 'macro_country_code', 'macro_country_name',
          'macro_forecast', 'macro_next_release', 'macro_observation_period']
METRICS = {'unemployment': ('USUR', 'percent'), 'interest-rate': ('USINTR', 'percent'),
           'trade-balance': ('USBOT', 'USD')}


def request(session, url, body=None):
    try:
        r = (session.get(url, params={'catalog_type': 'countries', 'group_by':
             'macro_country_classification', 'lang': 'en'}, timeout=20, allow_redirects=False)
             if body is None else session.post(url, json=body, timeout=20, allow_redirects=False))
        r.raise_for_status()
        value = r.json()
        if value.get('status_code') not in (0, '0') or not isinstance(value.get('data'), dict):
            raise ValueError()
        return value['data']
    except (requests.RequestException, ValueError, AttributeError):
        raise RuntimeError('AInvest macro source unavailable or invalid response') from None


def visitor(session):
    try:
        device = str(uuid.uuid4())
        extra = json.loads(os.getenv('AINVEST_HEADERS_JSON', '{}'))
        if not isinstance(extra, dict):
            raise ValueError()
        session.headers.update({'Origin': 'https://www.ainvest.com', 'Referer': 'https://www.ainvest.com/',
            'X-Auth-Version': '1.0', 'X-Auth-Progid': '7047', 'X-Auth-Select-Market-Level': 'uus:level0',
            'Accept-Language': 'en', 'fingerprint': device, **extra})
        r = session.post('https://user.ainvest.com/auth/visitor/login',
                         data={'udid': device, 'clientType': 'WEB'}, timeout=20, allow_redirects=False)
        r.raise_for_status()
        if not r.json().get('data', {}).get('userId') or not session.cookies:
            raise ValueError()
    except (requests.RequestException, ValueError, AttributeError, TypeError):
        raise RuntimeError('AInvest visitor session unavailable') from None


def countries(data, group=None):
    if not isinstance(data.get('groups'), list):
        raise ValueError('Missing country catalog')
    rows = {}
    for item in data['groups']:
        if group and group.lower() not in (str(item.get('group_key', '')).lower(),
                                          str(item.get('group_name', '')).lower()):
            continue
        for row in item.get('rows', []):
            code = str(row.get('country_code', '')).upper()
            if len(code) == 2 and code.isalpha() and code != 'WW':
                rows[code] = row.get('country_name') or code
    if not rows:
        raise ValueError('No countries in requested source group')
    return rows


def snapshot_body(symbols, fields, symbol_type='macro_metric', limit=None, sort=False):
    body = {'symbol': [{'type': symbol_type, 'value': symbols}],
            'indicator': [{'id': f, 'req_unique_id': f} for f in fields],
            'page': {'begin': 0, 'count': limit or len(symbols)}}
    if sort:
        body['sort'] = [{'pos': 0, 'order': 'desc'}]
    return body


def normalize_snapshot(data, expected):
    definitions, records = data.get('indicator'), data.get('data')
    if not isinstance(definitions, list) or not isinstance(records, list):
        raise ValueError('Invalid snapshot response')
    ids = [i.get('req_unique_id') or i.get('id') for i in definitions]
    if any(field not in ids for field in expected):
        raise ValueError('Missing requested snapshot fields')
    rows = []
    for record in records:
        cells = record.get('value', [])
        rows.append({'symbol': record['symbol_code'], **{field:
            cells[ids.index(field)].get('v') if ids.index(field) < len(cells) and
            isinstance(cells[ids.index(field)], dict) else None for field in expected}})
    return rows


def normalize_series(data, symbol):
    definitions = data.get('indicator', [])
    ids = [i.get('req_unique_id') or i.get('id') for i in definitions]
    if ids.count('macro_last') != 1 or not isinstance(data.get('data'), list):
        raise ValueError('Missing macro_last series')
    index = ids.index('macro_last')
    points = []
    found = False
    for row in data['data']:
        if row.get('symbol_code') == symbol:
            found = True
            cells = row.get('value', [])
            if index >= len(cells) or not isinstance(cells[index].get('value'), list):
                raise ValueError('Invalid series observations')
            # Keep original observations, including nulls and duplicate timestamps.
            points.extend(cells[index]['value'])
    if not found:
        raise ValueError('Requested macro series missing')
    return points


def fetch(args, session):
    endpoints = []
    def get(url, body=None):
        endpoints.append(url)
        return request(session, url, body)
    op = args.operation
    result = {'type': 'macro-data', 'operation': op, 'rendered': False}
    if op in ('countries', 'inflation', 'gdp-growth'):
        catalog = get(CATALOG)
        names = countries(catalog, args.group or ('G20' if op == 'gdp-growth' else None))
        result['scope'] = {'group': args.group or ('G20' if op == 'gdp-growth' else 'all source countries'),
                           'countryCount': len(names)}
        if op == 'countries':
            result['rows'] = [{'countryCode': k, 'country': v} for k, v in names.items()]
        else:
            gdp = op == 'gdp-growth'
            fields = ['GDPYY', 'GDP'] if gdp else FIELDS
            symbols = list(names) if gdp else [k + 'IRYY' for k in names]
            raw = get(BASE + 'snapshot', snapshot_body(symbols, fields,
                'macro_region' if gdp else 'macro_metric', args.limit, gdp))
            rows = normalize_snapshot(raw, fields)
            result['rows'] = [{**row, 'countryCode': row['symbol'] if gdp else row['symbol'][:2],
                'country': names.get(row['symbol'] if gdp else row['symbol'][:2])} for row in rows]
            result['units'] = {'GDPYY': 'percent', 'GDP': 'USD'} if gdp else {'macro_last': 'percent'}
            result['sourceTotal'] = raw.get('page', {}).get('total')
            returned = {row['symbol'] for row in rows}
            result['coverage'] = {'requested': len(symbols), 'returned': len(rows),
                'requestedLimit': args.limit,
                'missingSymbols': [symbol for symbol in symbols if symbol not in returned] if args.limit is None else None}
            if not rows:
                raise ValueError('No macro snapshot rows returned')
    else:
        symbol, unit = METRICS[op]
        result.update(symbol=symbol, units={'macro_last': unit})
        result['rows'] = normalize_snapshot(get(BASE + 'snapshot', snapshot_body([symbol], FIELDS)), FIELDS)
        end = args.end_time if args.end_time is not None else int(time.time() * 1000)
        begin = args.begin_time if args.begin_time is not None else end - int(args.years * 365.25 * 86400000)
        if begin >= end:
            raise ValueError('begin-time must precede end-time')
        body = {'symbol': {'type': 'macro_metric', 'value': [symbol]},
                'indicator': [{'id': 'macro_last', 'req_unique_id': 'macro_last'}],
                'time_range': {'type': 'begin_end', 'begin_time': begin, 'end_time': end,
                               'time_period': args.period}}
        result['series'] = normalize_series(get(BASE + 'series', body), symbol)
        result['requestedRange'] = body['time_range']
    result['source'] = {'provider': 'AInvest', 'endpoints': endpoints,
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'notes': 'fetchedAt is retrieval time, not observation period. GDP region snapshot does not define a common quarter/year. Percent values are already percent (4.2 means 4.2%), not fractions. Missing values remain null; no display sampling or unit conversion.'}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--schema', action='store_true')
    parser.add_argument('--operation', choices=['countries', 'inflation', 'gdp-growth', *METRICS])
    parser.add_argument('--output')
    parser.add_argument('--group', help='Source country group; GDP defaults to G20')
    parser.add_argument('--limit', type=int, help='Optional snapshot row limit; default all source countries')
    parser.add_argument('--years', type=float, default=2)
    parser.add_argument('--period', choices=['day_1', 'month_1', 'year_1'], default='month_1')
    parser.add_argument('--begin-time', type=int, help='Epoch milliseconds')
    parser.add_argument('--end-time', type=int, help='Epoch milliseconds')
    args = parser.parse_args()
    if args.schema:
        print(Path(__file__).resolve().parents[1].joinpath('schemas/read_macro_data.schema.json').read_text())
        return 0
    if not args.operation or not args.output:
        parser.error('--operation and --output are required')
    if not math.isfinite(args.years) or args.years <= 0 or (args.limit is not None and args.limit <= 0):
        parser.error('--years and --limit must be positive')
    if Path(args.output).suffix.lower() != '.json':
        parser.error('--output must be a JSON file')
    if args.begin_time is not None and args.end_time is not None and args.begin_time >= args.end_time:
        parser.error('begin-time must precede end-time')
    started = time.monotonic()
    try:
        with requests.Session() as session:
            visitor(session)
            result = fetch(args, session)
        result['timingsMs'] = {'total': round((time.monotonic() - started) * 1000)}
        output = Path(args.output).expanduser()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
        summary = {k: result[k] for k in ('operation', 'units', 'scope', 'coverage', 'source') if k in result}
        summary.update(rowCount=len(result.get('rows', [])), observationCount=len(result.get('series', [])))
        if 'series' not in result:
            summary['rows'] = result.get('rows', [])[:20]
        else:
            summary['latestSnapshot'] = result['rows']
        print(json.dumps({'output': str(output), 'artifactKind': 'data', 'rendered': False,
                          'summary': summary, 'timingsMs': result['timingsMs']}, ensure_ascii=False))
        return 0
    except (RuntimeError, ValueError, OSError, KeyError, TypeError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
