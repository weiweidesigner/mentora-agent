---
name: market-data
description: Read-only batch quotes and completed daily OHLCV for arbitrary US-listed stocks/ETFs/indices and mainland stocks. Independent reads run concurrently; repeated reads can reuse timestamped cache. No account or trading service required.
---

# Market data

Use `scripts/read_market_data.py` for quote/history batches, including a single symbol. It calls the installed Mentora market adapters; no account, owner, paper-trading service, or `execute(service, owner, ...)` is needed. Do not reverse-engineer `app.portfolio` or generate your own serial HTTP loops for these supported reads. Other data ranges, markets, intervals and fundamental fields require a matching skill.

## Exact CLI

```sh
python3 app/skill_runner.py execute --script read_market_data.py -- --operation quote --symbols AAPL MSFT --output outputs/data/quotes.json
python3 app/skill_runner.py execute --script read_market_data.py -- --operation history --symbols AAPL MSFT --output outputs/data/history.json
python3 app/skill_runner.py execute --script read_market_data.py -- --operation quote --input outputs/data/requests.json --output outputs/data/snapshot.json
```

`--input` is a UTF-8 JSON array, e.g. `[{"symbol":"SPY","asset":"etf"},{"symbol":"AAPL","asset":"stocks"},{"symbol":"COMP","asset":"index"}]`. `--symbols` uses one `--asset stocks|etf|index` (default stocks); never infer an ETF's asset class from its ticker. Mainland symbols require the exchange suffix, e.g. `600519.SH`, and use the stock adapter. Markets supported here are US listings and mainland China; do not use foreign listings or Yahoo. US index history is returned as a per-item unsupported error while supported stocks and ETFs in the same mixed batch still run. History is the existing adapter's recent completed daily bars (approximately 132 US sessions, at least 65), forward adjusted; it is not an arbitrary date/interval query. Use the original K-line skill for different history contracts.

## Concurrency, reuse and freshness

`--workers 1..8` defaults to 4. It controls independent read concurrency, not the agent's reasoning or tool budget. Mainland requests retain the existing Fuyao throttle. The runtime supplies a separate cache directory per agent turn. Outside the runtime, use `--cache-dir outputs/data/<request-cache>` to share observations across CLI calls; otherwise there is no persistent cache. `--no-cache` disables it. Duplicate items in one batch share one read, including refreshed reads.

Default cache validity: quotes 60 seconds, history 1800 seconds. `--max-age <seconds>` changes that validity; `--refresh` explicitly fetches again. Cache hits retain the original source and data timestamps and report `cached` and `cacheAgeSeconds`. Reuse a valid observation when scope and timing match; refresh when the user's question or actual market changes require it. A batch records start/completion times; concurrently fetched quotes are not an atomic exchange snapshot. Do not label the batch completion time as every quote's trade time. Failures are not cached or replaced with stale values.

## Output and errors

`--output` is required. JSON: `{operation, startedAt, completedAt, results, errors}`. Each result keeps input order and includes `{symbol, asset, ok, cached, cacheAgeSeconds, data}` on success or `{symbol, asset, ok:false, error}` on failure. `data` retains the installed adapter's source, timestamps, freshness and adjustment metadata. Only a short file/count summary prints to stdout; read selected fields or calculate from the file instead of dumping full history to context. Exit 0 means the batch contains at least one usable observation, including a partial batch; inspect `errors` and every row's `ok` value. Exit 1 means every requested item failed, while exit 2 means invalid input or unavailable installation. Do not rerun an entire partial batch: reuse successful rows and make at most one narrower request only when the missing field is essential.
