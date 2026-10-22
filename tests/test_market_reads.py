import json
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from app.market_reads import cached_read, read_batch, normalize_requests


class Reader:
    def __init__(self, barrier=None):
        self.calls = []
        self.barrier = barrier

    def prepare(self, requests):
        self.requests = requests

    def read(self, operation, symbol, asset):
        self.calls.append((operation, symbol, asset))
        if self.barrier:
            self.barrier.wait(timeout=3)
        if symbol == 'FAIL':
            raise RuntimeError('upstream timeout')
        return {'symbol': symbol, 'price': 123, 'source': 'fixture', 'priceAt': 'original-time'}


def test_batch_overlaps_independent_reads_preserves_order_and_partial_failures():
    reader = Reader(threading.Barrier(3))
    result = read_batch([{'symbol': s} for s in ['MSFT', 'FAIL', 'AAPL']], reader=reader, workers=3)
    assert [r['symbol'] for r in result['results']] == ['MSFT', 'FAIL', 'AAPL']
    assert result['errors'] == 1
    assert result['results'][1] == {'symbol': 'FAIL', 'asset': 'stocks', 'ok': False, 'error': 'upstream timeout'}
    assert result['results'][0]['data']['priceAt'] == 'original-time'


def test_duplicate_items_share_one_read_even_with_refresh(tmp_path):
    reader = Reader()
    result = read_batch([{'symbol': 'AAPL'}, {'symbol': 'AAPL'}], reader=reader,
                        cache_dir=tmp_path, refresh=True)
    assert len(reader.calls) == 1
    assert len(result['results']) == 2
    assert result['results'][0] == result['results'][1]
    assert not result['results'][0]['cached']


def test_reuse_is_keyed_by_operation_asset_and_preserves_source_timestamps(tmp_path):
    reader = Reader()
    def run(**kwargs):
        return read_batch([{'symbol': 'SPY', 'asset': kwargs.pop('asset', 'etf')}],
                          reader=reader, cache_dir=tmp_path, **kwargs)['results'][0]
    assert not run()['cached']
    assert run()['cached']
    assert run()['data']['priceAt'] == 'original-time'
    assert not run(asset='stocks')['cached']
    assert not run(operation='history')['cached']
    assert not run(refresh=True)['cached']
    assert len(reader.calls) == 4


def test_cache_expiration_and_errors_never_return_stale_values(tmp_path, monkeypatch):
    import app.market_reads as market
    clock = [100.0]
    monkeypatch.setattr(market.time, 'time', lambda: clock[0])
    assert cached_read(tmp_path, 'quote', lambda: {'price': 1})[0] == {'price': 1}
    clock[0] = 130
    assert cached_read(tmp_path, 'quote', lambda: {'price': 2})[1: ] == (True, 30)
    clock[0] = 161
    def fail():
        raise RuntimeError('not available')
    with pytest.raises(RuntimeError, match='not available'):
        cached_read(tmp_path, 'quote', fail)
    assert cached_read(tmp_path, 'quote', lambda: {'price': 3}) == ({'price': 3}, False, 0)
    with pytest.raises(RuntimeError):
        cached_read(tmp_path, 'quote', fail, refresh=True)


def test_cache_inflight_deduplication_across_cli_processes(tmp_path):
    # Separate native shell calls cannot share a Python object; file locks must
    # coalesce the actual upstream operation across process boundaries.
    code = '''
import sys,time
from pathlib import Path
from app.market_reads import cached_read
root=Path(sys.argv[1])
def fetch():
 with (root/'calls').open('a') as f:f.write('fetch\\n')
 time.sleep(.15)
 return {'source':'original'}
value,cached,age=cached_read(root,'same-query',fetch)
print(cached)
'''
    root = Path(__file__).resolve().parents[1]
    calls = [subprocess.Popen([sys.executable, '-c', code, str(tmp_path)], cwd=root,
                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(2)]
    outputs = [call.communicate(timeout=10) for call in calls]
    assert all(call.returncode == 0 for call in calls), outputs
    assert sorted(out.strip() for out, _ in outputs) == ['False', 'True']
    assert (tmp_path / 'calls').read_text().splitlines() == ['fetch']


@pytest.mark.parametrize('requests', [[], [{'symbol': 'a;cat'}], [{'symbol': 'AAPL', 'refresh': True}],
    [{'symbol': '0700.HK'}], [{'symbol': 'AAPL', 'asset': 'guess'}]])
def test_invalid_or_unsupported_requests_fail_before_io(requests):
    with pytest.raises(ValueError):
        read_batch(requests, reader=Reader())


def test_mixed_history_keeps_supported_rows_and_marks_indices_unsupported():
    reader = Reader()
    result = read_batch([
        {'symbol': 'COMP', 'asset': 'index'},
        {'symbol': 'SPY', 'asset': 'etf'},
    ], operation='history', reader=reader)
    assert result['errors'] == 1
    assert result['results'][0]['ok'] is False
    assert result['results'][1]['ok'] is True
    assert reader.calls == [('history', 'SPY', 'etf')]


def test_mainland_symbol_requires_exchange():
    with pytest.raises(ValueError):
        normalize_requests([{'symbol': '600519'}])


@pytest.mark.parametrize('max_age', [-1, float('nan'), float('inf')])
def test_invalid_cache_age_fails_before_io(max_age):
    with pytest.raises(ValueError, match='finite and nonnegative'):
        read_batch([{'symbol': 'AAPL'}], max_age=max_age, reader=Reader())
