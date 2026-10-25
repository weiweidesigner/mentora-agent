"""Concurrent read-only market queries over the installed data adapters.

No account/service initialization, orders, source substitutions or inferred assets.
The cache namespace is supplied per agent turn by the runtime; standalone callers
can explicitly share a cache directory. Errors are never cached.
"""
from __future__ import annotations

import copy
import fcntl
import hashlib
import json
import math
import os
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from app.hk_market_data import is_hk_symbol,normalize_hk_symbol


def stamp():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def cache_lock(directory, key):
    if directory is None:
        yield None
        return
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    # The lock file is deliberately stable across atomic cache-file replacement.
    with (directory / (key + '.lock')).open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield directory / (key + '.json')
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def cached_read(directory, identity, read, *, refresh=False, max_age=60):
    key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    with cache_lock(directory, key) as file:
        if file and not refresh:
            try:
                entry = json.loads(file.read_text())
                age = time.time() - entry['createdAt']
                if 0 <= age < max_age:
                    return entry['value'], True, age
            except (OSError, ValueError, KeyError, TypeError):
                pass
        value = read()  # failures leave the last successful observation untouched
        if file:
            descriptor, temporary = tempfile.mkstemp(dir=file.parent, prefix='.read-')
            try:
                with os.fdopen(descriptor, 'w') as handle:
                    json.dump({'createdAt': time.time(), 'value': value}, handle, allow_nan=False)
                os.replace(temporary, file)
            finally:
                Path(temporary).unlink(missing_ok=True)
        return value, False, 0


class MarketReader:
    def __init__(self):
        self.adapters = {}

    def prepare(self, requests):
        # Construct once before threads start; imports have side effects and the
        # CN adapter owns the upstream rate limiter shared by this batch.
        if any(not re.fullmatch(r'\d{6}\.(SH|SZ|BJ)', row['symbol']) and not is_hk_symbol(row['symbol']) for row in requests):
            from app.portfolio import MarketData
            self.adapters['US'] = MarketData()
        if any(re.fullmatch(r'\d{6}\.(SH|SZ|BJ)', row['symbol']) or is_hk_symbol(row['symbol']) for row in requests):
            from app.portfolio_data import MarketDataHub
            hub=MarketDataHub()
            self.adapters['CN'] = hub
            self.adapters['HK'] = hub

    def read(self, operation, symbol, asset):
        market = 'HK' if is_hk_symbol(symbol) else 'CN' if re.fullmatch(r'\d{6}\.(SH|SZ|BJ)', symbol) else 'US'
        adapter = self.adapters[market]
        # Each uncached query reaches the adapter. Freshness checks and CN source
        # throttling remain in the original implementation.
        if operation == 'quote':
            if market=='HK':return adapter.favorite_quote(symbol,fresh=True)
            return adapter.quote(symbol, asset=asset, fresh=True)
        return adapter.history(symbol)


def normalize_requests(requests):
    result = []
    for item in requests:
        if not isinstance(item, dict) or set(item) - {'symbol', 'asset'}:
            raise ValueError('Each request must contain symbol and optional asset only')
        symbol = str(item.get('symbol', '')).strip().upper()
        if is_hk_symbol(symbol):symbol=normalize_hk_symbol(symbol)
        if not is_hk_symbol(symbol) and not re.fullmatch(r'[A-Z][A-Z0-9.-]{0,9}|\d{6}\.(?:SH|SZ|BJ)', symbol):
            raise ValueError('Use a US ticker or fully qualified mainland symbol, e.g. 600519.SH')
        asset = item.get('asset', 'stocks')
        if asset not in {'stocks', 'etf', 'index'}:
            raise ValueError('asset must be stocks, etf or index')
        if re.fullmatch(r'\d{6}\.(SH|SZ|BJ)', symbol) and asset != 'stocks':
            raise ValueError('Mainland symbols require asset=stocks')
        if symbol.endswith(('.T', '.L')):
            raise ValueError('This adapter supports US, mainland China and Hong Kong listings only')
        result.append({'symbol': symbol, 'asset': asset})
    if not result:
        raise ValueError('At least one symbol is required')
    return result


def read_batch(requests, *, operation='quote', workers=4, cache_dir=None,
               refresh=False, max_age=None, reader=None):
    if operation not in {'quote', 'history'} or not 1 <= workers <= 8:
        raise ValueError('operation must be quote/history and workers must be 1..8')
    requests = normalize_requests(requests)
    max_age = (60 if operation == 'quote' else 1800) if max_age is None else max_age
    if not math.isfinite(max_age) or max_age < 0:
        raise ValueError('max_age must be finite and nonnegative')
    reader = reader or MarketReader()
    supported = [row for row in requests if not (row['asset']=='index' and (operation=='history' or is_hk_symbol(row['symbol'])))]
    reader.prepare(supported)
    started = stamp()

    def one(item):
        if item['asset']=='index' and (operation=='history' or is_hk_symbol(item['symbol'])):
            return {**item, 'ok': False,
                    'error': 'Index history is not supported by the installed history adapter'}
        identity = {'adapter': 'mentora-market-v1', 'operation': operation, **item}
        try:
            value, cached, age = cached_read(cache_dir, identity,
                lambda: reader.read(operation, **item), refresh=refresh, max_age=max_age)
            return {**item, 'ok': True, 'cached': cached,
                    'cacheAgeSeconds': round(age, 3), 'data': value}
        except Exception as error:
            return {**item, 'ok': False, 'error': str(error)}

    # One network operation per distinct request even for --refresh. Keep caller
    # order (and duplicate positions) in the returned JSON.
    unique = list(dict.fromkeys((row['symbol'], row['asset']) for row in requests))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        values = list(pool.map(one, ({'symbol': s, 'asset': a} for s, a in unique)))
    by_key = dict(zip(unique, values))
    results = [copy.deepcopy(by_key[(row['symbol'], row['asset'])]) for row in requests]
    return {'operation': operation, 'startedAt': started, 'completedAt': stamp(),
            'results': results, 'errors': sum(not row['ok'] for row in results)}
