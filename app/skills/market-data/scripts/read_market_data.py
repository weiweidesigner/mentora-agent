#!/usr/bin/env python3
"""Read arbitrary US/mainland quote or daily-history batches, without an account."""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from app.market_reads import read_batch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation', choices=['quote', 'history'], required=True)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--symbols', nargs='+', help='Tickers; use --input for mixed asset classes')
    source.add_argument('--input', help='JSON array of {symbol, asset}; asset=stocks/etf/index')
    parser.add_argument('--asset', choices=['stocks', 'etf', 'index'], default='stocks')
    parser.add_argument('--workers', type=int, choices=range(1, 9), default=4)
    parser.add_argument('--refresh', action='store_true', help='Explicitly bypass cached observations')
    parser.add_argument('--cache-dir', default=os.getenv('MENTORA_MARKET_CACHE_DIR'))
    parser.add_argument('--no-cache', action='store_true')
    parser.add_argument('--max-age', type=float, help='Cache TTL seconds; defaults: quote 60/history 1800')
    parser.add_argument('--output', required=True, help='JSON result path; complete data stays in this file')
    args = parser.parse_args()
    try:
        rows = json.loads(Path(args.input).read_text()) if args.input else [
            {'symbol': symbol, 'asset': args.asset} for symbol in args.symbols]
        if not isinstance(rows, list):
            raise ValueError('--input must contain a JSON array')
        result = read_batch(rows, operation=args.operation, workers=args.workers,
            cache_dir=None if args.no_cache else args.cache_dir, refresh=args.refresh,
            max_age=args.max_age)
    except (ValueError, OSError, ImportError) as error:
        parser.exit(2, f'market-data: {error}\n')
    output = Path(args.output).expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'output': str(output), 'items': len(result['results']), 'errors': result['errors']}))
    # A partial batch is usable evidence. Keep row errors in JSON and reserve a
    # failing process status for a batch with no successful observation.
    return 1 if result['errors'] == len(result['results']) else 0


if __name__ == '__main__':
    raise SystemExit(main())
