---
name: ashare-minute
description: Read recent Shanghai/Shenzhen stock and index minute prices on demand without a server quote cache; render native charts by trading day. Sina is the default provider.
---

# 沪深股票与指数近五日分时

Use for A股分时、上证/深证指数分时、最近五个交易日每天分时. This is separate from Fuyao daily data and generic AInvest K-lines.

Read `schemas/ashare_intraday.schema.json`, then execute the registered capability:

```sh
python3 app/skill_runner.py execute --script ashare_intraday.py -- --symbol 000001.SH --days 5 --interval 1m --theme dark --language zh-CN --output outputs/generated/shanghai-five-day-intraday.html
```

The default `--provider sina` uses the documented Sina `stock_zh_a_minute` stock/index contract: `quotes.sina.cn/cn/api/jsonp_v2.php/=/CN_MarketDataService.getKLineData`, `symbol=sh000001`, `scale=1|5`, `ma=no`, `datalen=1970`. Parse the JSONP envelope strictly as JSON; never execute source text. No daily/adjustment fetch is needed for unadjusted prices. `auto` and `1m` use real one-minute bars; `5m` explicitly selects real five-minute bars. A failed source stays failed: no alias retries, host cycling, user-agent cycling, hidden provider substitution or fabricated prices.

`--provider eastmoney` explicitly selects the earlier Eastmoney adapter. Its `auto` mode may try the documented five-minute K-line route once when the one-minute route fails or has insufficient valid OHLC coverage. Strict `1m` never downgrades. Eastmoney may return historical rows with zero OHLC fields; these are not valid candles and must not be counted as absent source dates or silently repaired with invented OHLC values. The receipt distinguishes source dates from usable OHLC dates.

Use explicit exchange identity: `000001.SH` or `SSE:000001` is the Shanghai Composite; `399001.SZ` is Shenzhen Component; `600519.SH` is a stock. Bare `000001` is the Shenzhen stock. Never substitute its exchange when a source fails.

`--days 1..5` defaults to five recent returned sessions. `--dates` selects comma-separated dates from those sessions. Outside-window requests fail. Preserve the actual source, interval, returned dates and bar counts. Five returned dates do not guarantee every minute exists: do not interpolate missing bars or claim a complete tick path. Native performance uses each day's opening price, not the previous close. Keep dates and the lunch break separate when aggregating.

Only verified volume conventions may drive a volume chart. Sina prices/OHLC are used directly; its source volume is preserved without a guessed multiplier, marked source-unverified, and the volume subchart is hidden. Missing turnover is not estimated from closing price.

No server memory/disk quote cache, background collection, schedule or extra model call is created. Only the requested HTML report is written. Successful rows use the native `multi_intraday.py` renderer, one chart per trading date, Asia/Shanghai, unadjusted CNY. Verify the receipt and non-empty HTML. Use the receipt for reasoning and emit the HTML with `[[AIME_CHART:/absolute/path.html]]`; no HTML file download.

Source contracts: https://akshare.akfamily.xyz/data/stock/stock_quote.html#id32 (`stock_zh_a_minute`, Sina stock/index minutes); AKShare 1.20.1 `akshare/stock/quote/stock_zh_a_sina.py`; https://github.com/akfamily/akshare/blob/main/akshare/index/index_zh_em.py (Eastmoney).
