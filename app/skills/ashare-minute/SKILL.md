---
name: ashare-minute
description: Read Shanghai/Shenzhen stock and index minute prices for the most recent five trading sessions from Eastmoney, on demand without a server market-data cache; render separate native charts by trading day.
---

# 沪深股票与指数近五日分时

Use this capability for A股分时、上证指数/深证指数分时、最近五个交易日每天分时. It is distinct from Fuyao's daily-only A-share/index history and the generic AInvest K-line source. Do not conclude that all minute data is unavailable merely because either daily/AInvest route does not provide it.

Read `schemas/ashare_intraday.schema.json`, then run the registered script:

```sh
python3 app/skill_runner.py execute --script ashare_intraday.py -- --symbol 000001.SH --days 5 --theme dark --language zh-CN --output outputs/generated/shanghai-five-day-intraday.html
```

`--symbol` identifies the exchange explicitly: `000001.SH` or `SSE:000001` is the Shanghai Composite index, `399001.SZ` is the Shenzhen Component, and `600519.SH` is a stock. Bare `000001` is a Shenzhen stock; never substitute it for the Shanghai index. `.SS` is normalized to `.SH` locally without using Yahoo.

`--days 1..5` defaults to 5. `--dates YYYY-MM-DD,...` can select actual returned trading dates; requesting absent dates fails explicitly. Data is a rolling recent-five-session window, not arbitrary historical minute coverage, and may contain fewer sessions. The receipt preserves actual interval/dates/counts and a coverage warning. Never label fewer returned days as complete five-day coverage.

`--interval auto|1m|5m` defaults to `auto`. Auto tries the documented `trends2/get` one-minute contract once. If it disconnects or covers fewer requested sessions, it may make one request to the documented Eastmoney `kline/get` contract (`klt=5`, unadjusted `fqt=0`). Use the five-minute result only when it adds requested session coverage or one-minute data is unavailable. The receipt preserves actual `interval`, attempts and a visible resolution notice; every five-minute card is labeled 五分钟走势. Never put 5m bars under a 1m key or interpolate missing minute prices. `--interval 1m` is strict and never downgrades; `--interval 5m` directly selects five-minute data.

There is no server memory/disk quote cache or alternate provider. If both documented routes fail, return the failure; do not rerun with exchange aliases or inspect/debug the network inside a research task; do not probe alternate hosts, cycle user agents, or fabricate minute paths from daily OHLC. Successful rows are composed through the existing `multi_intraday.py` native renderer, one chart per trading date, Asia/Shanghai, unadjusted CNY; volumes convert the existing source lot convention to shares. Native minute performance is relative to that day's opening price, not previous close. Lunch and separate trading dates remain distinct; no interpolation or overnight volume bucket.

Only the requested HTML report is written. No background collection, historical cache database, automatic schedule or extra model call is created. Use the short CLI receipt for reasoning and emit the resulting HTML through `[[AIME_CHART:/absolute/path.html]]`; do not offer non-StreamViz chart HTML as a download.

Source contract: https://github.com/akfamily/akshare/blob/master/akshare/index/index_zh_em.py (`index_zh_a_hist_min_em`, `ndays=5`).
