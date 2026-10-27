# Hong Kong research history

## Unadjusted snapshots

Research reads and `ExecutionMarket` now share `fetch_snapshot` and the fixed
Tencent `https://sqt.gtimg.cn/utf8/q=r_hkNNNNN` contract, as implemented by
[easyquotation's primary HKQuote source](https://github.com/shidenggui/easyquotation/blob/master/easyquotation/hkquote.py).
Do not use the delayed `hkNNNNN` quote channel as a realtime fallback. Both the
response variable and code field must identify the requested HK listing. Keep
the provider's original trade timestamp and report its age separately from the
fetch timestamp. A successful HTTP read is not proof of a current quote. No
request retries, alternate-channel guessing, fresh timestamp synthesis or
unadjusted daily-close substitutions are allowed. Research snapshots remain HKD
and nontradable; execution independently applies the unchanged three-minute
intraday check, exchange calendar, FX, account, JEV and order checks.

## Forward-adjusted historical evidence

`market-data`, `portfolio-data history` and `portfolio-backtest` share
`app.hk_market_data.fetch_history`. This does not enable Hong Kong paper orders.

- Accepted explicit identity: `0700.HK`, `00700.HK`, `HKEX:700`; canonical `0700.HK`.
  Provider identity is `hk00700`; the response must contain that exact key.
- Provider contract: Tencent's HTTPS `appstock/app/hkfqkline/get`, as documented by
  [AKShare's primary implementation](https://github.com/akfamily/akshare/blob/main/akshare/stock/stock_zh_ah_tx.py).
  One fixed-endpoint request per symbol, no retry, market guessing, ADR substitution,
  Yahoo fallback, HTML scraping, `eval`, or browser impersonation.
- `param`: `hkNNNNN,day,start-date,end-date,640,qfq`; fixed JSONP callback or JSON.
  Require successful status and `qfqday`; never label unadjusted `day` as adjusted.
- Values are date/open/close/high/low/volume. Reject invalid OHLC, nonfinite data,
  negative volume or conflicting duplicate dates. Do not fill missing sessions.
- Price currency remains HKD; all OHLC share the provider's forward adjustment.
  Volume stays in provider-reported units, not an inferred shares/lot conversion.
- Filter on the installed XHKG calendar, `Asia/Hong_Kong`, through session close
  plus ten minutes to conservatively cover the
  [HKEX closing auction](https://www.hkex.com.hk/Services/Trading-hours-and-Severe-Weather-Arrangements/Trading-Hours/Securities-Market?sc_lang=en),
  including half days. Exclude unfinished, future and non-session records.
- Default latest 132 completed rows; new listings can have fewer. The existing
  strategy engine determines required history; no fabricated minimum is filled.
- `asOf`, `expectedAsOf`, `stale`, `fetchedAt`, source and adjustment remain attached
  to reads and backtests. Cache TTL remains 1800 seconds. Errors are never cached.
- History returns `researchOnly=true`, `executionAuthorized=false`: this applies
  to historical evidence, never grants order authority. Account execution now
  accepts HK symbols through `ExecutionMarket` using unadjusted snapshots and
  validated HKD/USD conversion, with XHKG freshness and normal JEV/account gates.
  Adjusted history must never be used as an order mark. Account quantities use
  integer shares, not a claim of exchange board-lot or broker matching behavior.
