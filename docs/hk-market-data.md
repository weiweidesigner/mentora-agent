# Hong Kong research history

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
- Research returns `researchOnly=true`, `executionAuthorized=false`. Raw/adjusted
  historical prices must not reach the paper-order path. Existing order symbol,
  currency, decision and account checks continue to reject HK orders.
