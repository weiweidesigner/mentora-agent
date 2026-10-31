---
name: market-data
description: Read-only macroeconomic JSON APIs (US unemployment, interest rates, trade balance; inflation/GDP data for explicit data requests), plus batch quotes and completed daily OHLCV for US listings, mainland stocks and explicit Hong Kong listings. Independent reads run concurrently with timestamped reuse. No account or trading service required.
---

# Market data

Use `scripts/read_market_data.py` for quote/history batches, including a single symbol. It calls the installed Mentora market adapters; no account, owner, paper-trading service, or `execute(service, owner, ...)` is needed. Do not reverse-engineer `app.portfolio` or generate your own serial HTTP loops for these supported reads. Other data ranges, markets, intervals and fundamental fields require a matching skill.

## Exact CLI

```sh
python3 app/skill_runner.py execute --script read_market_data.py -- --operation quote --symbols AAPL MSFT --output outputs/data/quotes.json
python3 app/skill_runner.py execute --script read_market_data.py -- --operation history --symbols AAPL MSFT --output outputs/data/history.json
python3 app/skill_runner.py execute --script read_market_data.py -- --operation quote --input outputs/data/requests.json --output outputs/data/snapshot.json
```

`--input` is a UTF-8 JSON array, e.g. `[{"symbol":"SPY","asset":"etf"},{"symbol":"AAPL","asset":"stocks"},{"symbol":"COMP","asset":"index"}]`. `--symbols` uses one `--asset stocks|etf|index` (default stocks); never infer an ETF's asset class from its ticker. Mainland symbols require the exchange suffix, e.g. `600519.SH`, and use the stock adapter. Markets supported here are US listings, mainland China and explicit Hong Kong listings described below; do not use other foreign listings or Yahoo. Index history and HK index quotes return per-item unsupported errors while supported stocks/ETFs still run. History is the existing adapter's recent completed daily bars (approximately 132 US sessions, at least 65; HK defaults to 132 but newer listings may have fewer), forward adjusted; it is not an arbitrary date/interval query. Use the original K-line skill for different history contracts.

## Concurrency, reuse and freshness

`--workers 1..8` defaults to 4. It controls independent read concurrency, not the agent's reasoning or tool budget. Mainland requests retain the existing Fuyao throttle. The runtime supplies a separate cache directory per agent turn. Outside the runtime, use `--cache-dir outputs/data/<request-cache>` to share observations across CLI calls; otherwise there is no persistent cache. `--no-cache` disables it. Duplicate items in one batch share one read, including refreshed reads.

Default cache validity: quotes 60 seconds, history 1800 seconds. `--max-age <seconds>` changes that validity; `--refresh` explicitly fetches again. Cache hits retain the original source and data timestamps and report `cached` and `cacheAgeSeconds`. Reuse a valid observation when scope and timing match; refresh when the user's question or actual market changes require it. A batch records start/completion times; concurrently fetched quotes are not an atomic exchange snapshot. Do not label the batch completion time as every quote's trade time. Failures are not cached or replaced with stale values.

## Output and errors

`--output` is required. JSON: `{operation, startedAt, completedAt, results, errors}`. Each result keeps input order and includes `{symbol, asset, ok, cached, cacheAgeSeconds, data}` on success or `{symbol, asset, ok:false, error}` on failure. `data` retains the installed adapter's source, timestamps, freshness and adjustment metadata. Only a short file/count summary prints to stdout; read selected fields or calculate from the file instead of dumping full history to context. Exit 0 means the batch contains at least one usable observation, including a partial batch; inspect `errors` and every row's `ok` value. Exit 1 means every requested item failed, while exit 2 means invalid input or unavailable installation. Do not rerun an entire partial batch: reuse successful rows and make at most one narrower request only when the missing field is essential.

## Hong Kong research

The market scope above now also includes explicit HK stocks/ETFs, e.g. `0700.HK`,
`00700.HK`, `HKEX:700` (canonical `0700.HK`). Bare numeric codes are not inferred.
Use the same registered CLI, for example `--operation history --symbols 0700.HK 9988.HK`.
HK index symbols are not supported. Do not replace a HK listing with its ADR.

The shared `app.hk_market_data` adapter uses the documented Tencent HTTPS
`hkfqkline/get` contract: exact provider identity `hkNNNNN`, daily `qfqday`, all
OHLC forward-adjusted in native HKD, source volume units unchanged. The default
is the latest 132 completed sessions (new/suspended listings may have fewer).
It uses XHKG/Asia-Hong_Kong and a ten-minute post-close auction buffer, including
half days; excludes unfinished/non-session bars, flags stale history, validates
finite OHLCV and duplicate dates, and never fills missing prices. Results include
source, `asOf`, `expectedAsOf`, `stale`, adjustment and currency.

HK display quotes use the fixed Tencent HTTPS `sqt.gtimg.cn/utf8/q=r_hkNNNNN`
contract implemented by `app.hk_market_data.fetch_snapshot`, following
[easyquotation HKQuote](https://github.com/shidenggui/easyquotation/blob/master/easyquotation/hkquote.py).
The old `hkNNNNN` quote channel is delayed and is not a freshness fallback.
Require the exact `v_r_hkNNNNN` response identity and matching code field, a finite
positive unadjusted HKD price, and the source timestamp (field 30). Preserve
`priceAt`, `fetchedAt`, `quoteAgeSeconds` and `providerSymbol`; `realTime` is true
only if the timestamp is within three minutes, never merely because the channel
claims realtime. One request, no retry/provider guessing or timestamp replacement.
HTTP errors, HTML, identity mismatch and invalid prices/times fail that item.
These native-currency research quotes remain nontradable; the account adapter
separately validates calendar freshness, FX and all existing order gates.

HK history has `researchOnly=true`, `executionAuthorized=false`; only research
and historical backtests are added. No FX conversion, trade permission, provider
guessing or automatic source fallback is introduced. Errors fail that item with
no retry. See `docs/hk-market-data.md` for source references and exact semantics.

## Macroeconomic data API (World Economy)

For inflation-map and GDP-ranking display requests, use the native business components `inflation_map.py` and `gdp_growth.py` and preserve their styles; do not substitute generic visualizations. Use `scripts/read_macro_data.py` for US unemployment, interest rates and trade balance, or explicit raw-data requests for inflation/GDP. Read `schemas/read_macro_data.schema.json` for the exact contract. It provides data only, with no HTML, fixed style, table, chart type or layout. Select text or the existing generic visualization skills according to the user's question. A raw JSON response is not an already-rendered table. Reuse its file for transformation/rendering rather than fetching again.

```sh
python3 app/skill_runner.py execute --script read_macro_data.py -- --operation inflation --output outputs/data/inflation.json
python3 app/skill_runner.py execute --script read_macro_data.py -- --operation gdp-growth --output outputs/data/gdp.json
python3 app/skill_runner.py execute --script read_macro_data.py -- --operation unemployment --years 2 --period month_1 --output outputs/data/unemployment.json
python3 app/skill_runner.py execute --script read_macro_data.py -- --operation interest-rate --years 12 --period month_1 --output outputs/data/interest-rate.json
python3 app/skill_runner.py execute --script read_macro_data.py -- --operation trade-balance --output outputs/data/trade-balance.json
```

`--operation countries` lists source countries; `--group` selects an exact source group. GDP defaults to the complete live G20 group, sorted by GDPYY, not global rankings or a fixed top six. `--limit` optionally limits snapshot rows. History supports `--years` (default 2), `--period day_1|month_1|year_1` (default month_1), and explicit epoch-ms `--begin-time`/`--end-time`. These request the provider's resolution, without extra month/year display sampling. Series observations preserve source timestamp, observation period, nulls and duplicates. Deduplicate/aggregate explicitly only if the user's analysis requires it.

Output JSON includes rows, optional series, units, source endpoints and fetchedAt; stdout supplies a bounded summary and data path. Percentage values are already percent (4.2 = 4.2%), amounts remain raw USD. GDP region snapshot does not define a shared quarter/year; never label retrieval time as observation period. Missing values stay null, not zero. Anonymous visitor credentials remain in memory; errors stop the source route, with no fallback data. GDP uses a combined GDPYY/GDP request to avoid redundant reads. This API creates no visualization artifact.
