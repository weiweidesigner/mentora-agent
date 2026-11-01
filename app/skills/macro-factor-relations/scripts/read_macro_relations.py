"""Read only the three AInvest investment-graph resources used by its public UI."""
import argparse
import datetime as dt
import json
from pathlib import Path
import sys
from urllib.parse import urlencode
import requests

BASE = 'https://extquote.ainvest.com/market-analysis/investment_graphs/v1/'
CAUTION = 'Source descriptions can conflict with source signs; assess both before interpretation. Provider relationship labels and pass_score are not validated causality, correlation coefficients or confidence probabilities. Numeric histories and forecasts are excluded; use existing macro/market capabilities for observations.'


def normalize(operation, envelope, factor_id=None, direction='all'):
    if not isinstance(envelope, dict) or envelope.get('status_code') != 0:
        raise ValueError('AInvest rejected the request: ' + str(envelope.get('status_msg') if isinstance(envelope, dict) else 'invalid envelope'))
    data = envelope.get('data')
    if not isinstance(data, dict):
        raise ValueError('Missing structured source data')
    if operation == 'factor-sets':
        sets = data.get('factor_sets')
        if not isinstance(sets, list) or any(not isinstance(s, dict) or s.get('id') is None for s in sets):
            raise ValueError('Unexpected factor-set schema')
        return {'factorSets': sets}
    if operation in ('directory', 'search'):
        factors, edges = data.get('factors'), data.get('edges')
        if not isinstance(factors, list) or not isinstance(edges, list):
            raise ValueError('Unexpected graph schema')
    else:
        detail = data.get('factor_data')
        if not isinstance(detail, dict) or str(detail.get('id')) != str(factor_id):
            raise ValueError('Missing or mismatched source factor ID')
        center = {k: v for k, v in detail.items() if k not in ('history', 'forecast', 'influencing', 'influenced', 'edges')}
        incoming, outgoing, edges = (detail.get(k) for k in ('influencing', 'influenced', 'edges'))
        if any(not isinstance(items, list) for items in (incoming, outgoing, edges)):
            raise ValueError('Unexpected factor relation schema')
        factors = [center] + incoming + outgoing
        if any(not isinstance(f, dict) or f.get('id') is None for f in factors):
            raise ValueError('Source factor lacks identity')
        if any(not isinstance(e, dict) or e.get('from') is None or e.get('to') is None for e in edges):
            raise ValueError('Source edge lacks endpoint identity')
        if direction != 'all':
            endpoint = 'to' if direction == 'influencing' else 'from'
            edges = [e for e in edges if str(e.get(endpoint)) == str(factor_id)]
        ids = {str(e.get(k)) for e in edges for k in ('from', 'to')} | {str(factor_id)}
        factors = [f for f in factors if str(f.get('id')) in ids]
    if any(not isinstance(e, dict) or e.get('from') is None or e.get('to') is None for e in edges):
        raise ValueError('Source edge lacks endpoint identity')
    # Deduplicate identities only, never names. Preserve source edge multiplicity.
    nodes = {}
    for factor in factors:
        if not isinstance(factor, dict) or factor.get('id') is None:
            raise ValueError('Source factor lacks identity')
        key = str(factor['id'])
        nodes[key] = {**nodes.get(key, {}), **factor}
    result_edges = []
    dangling = 0
    for edge in edges:
        item = dict(edge)
        item['sourceLabel'] = {'+': 'positive_influence', '-': 'negative_influence'}.get(edge.get('corr_sign'), 'unspecified')
        item['description'] = edge.get('description', edge.get('relation_desc'))
        if any(str(edge.get(k)) not in nodes for k in ('from', 'to')):
            dangling += 1
        result_edges.append(item)
    return {'factors': list(nodes.values()), 'edges': result_edges, 'kernelFactorId': data.get('kernel_factor_id'), 'selectedFactorId': factor_id, 'direction': direction, 'quality': {'danglingEdges': dangling}, 'numericDataExcluded': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation', choices=['factor-sets', 'directory', 'search', 'relations'], required=True)
    parser.add_argument('--factor-set', default='all', help='Exact source set ID from factor-sets')
    parser.add_argument('--factor-id', help='Exact source factor ID from directory/search')
    parser.add_argument('--query')
    parser.add_argument('--direction', choices=['all', 'influencing', 'influenced'], default='all')
    parser.add_argument('--pass-score-min', type=float, default=0.8)
    parser.add_argument('--source-input', help='Reuse a raw source envelope JSON without HTTP')
    parser.add_argument('--directory-input', help='Reuse a normalized directory result for search without HTTP')
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--offset', type=int, default=0)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if not 0 <= args.pass_score_min <= 1 or not 1 <= args.limit <= 100 or args.offset < 0:
        parser.error('score must be 0..1, limit 1..100, offset nonnegative')
    if args.operation == 'relations' and not args.factor_id:
        parser.error('relations requires --factor-id from source directory')
    if args.operation == 'search' and not (args.query or '').strip():
        parser.error('search requires --query')
    if args.directory_input and args.operation != 'search':
        parser.error('--directory-input is for search only')
    if args.directory_input and args.source_input:
        parser.error('choose one input')
    resource = 'factor_sets' if args.operation == 'factor-sets' else 'factor_data' if args.operation == 'relations' else 'graph'
    params = {} if resource == 'factor_sets' else {'factor' if resource == 'factor_data' else 'factor_set': args.factor_id if resource == 'factor_data' else args.factor_set, 'pass_score_min': args.pass_score_min}
    url = BASE + resource + ('?' + urlencode(params) if params else '')
    if args.directory_input:
        result = json.loads(Path(args.directory_input).read_text())
        if not isinstance(result, dict) or result.get('operation') != 'directory' or not isinstance(result.get('factors'), list):
            raise ValueError('Expected a saved directory result')
        provenance = result.get('source', {})
    else:
        if args.source_input:
            envelope = json.loads(Path(args.source_input).read_text())
        else:
            response = requests.get(url, headers={'Accept': 'application/json'}, timeout=30, allow_redirects=False)
            response.raise_for_status()
            if 'json' not in response.headers.get('Content-Type', '').lower():
                raise ValueError('Expected JSON; source route ended')
            envelope = response.json()
        result = normalize(args.operation, envelope, args.factor_id, args.direction)
        provenance = {'url': url, 'fetchedAt': None if args.source_input else dt.datetime.now(dt.timezone.utc).isoformat(), 'processedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'transport': 'reused-envelope' if args.source_input else 'https', 'passScoreMin': args.pass_score_min}
    if args.operation == 'search':
        query = args.query.casefold().strip()
        matches = [f for f in result['factors'] if any(query in str(f.get(k, '')).casefold() for k in ('id', 'name', 'name_en'))]
        total = len(matches)
        result = {'factors': matches[args.offset:args.offset + args.limit], 'total': total, 'hasMore': args.offset + args.limit < total, 'offset': args.offset, 'query': args.query}
    result.update({'source': provenance, 'limitations': CAUTION, 'operation': args.operation})
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    summary = {'operation': args.operation, 'factorCount': len(result.get('factors', [])), 'edgeCount': len(result.get('edges', [])), 'factorSetCount': len(result.get('factorSets', [])), 'selectedFactorId': result.get('selectedFactorId'), 'direction': result.get('direction'), 'quality': result.get('quality'), 'limitations': CAUTION}
    if args.operation == 'search':
        summary.update({k: result[k] for k in ('factors', 'total', 'hasMore', 'offset', 'query')})
    elif args.operation == 'factor-sets':
        summary['factorSetsPreview'] = result['factorSets'][:10]
    print(json.dumps({'ok': True, 'output': str(output), 'summary': summary}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, requests.RequestException) as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False))
        sys.exit(1)
