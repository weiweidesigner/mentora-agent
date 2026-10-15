# TradingViewChart integration

`trading-view-chart.lock.json` pins the independent `weiweidesigner/trading-view-chart` repository. Run `python scripts/sync_trading_view_chart.py`, or the common `scripts/setup_dependencies.py`, to install it. Offline verification: `python scripts/sync_trading_view_chart.py --check`.

The host registers `TradingViewChart` / `trading_view_chart.py`, exposes its canonical skill through `.agents/skills/trading-view-chart`, and includes it in the JEV visual candidate catalog. Hosted widgets generate ordinary HTML/JSON artifacts and use the existing chart cards. No API key or package dependencies are added. Market values stay in TradingView's iframe; native data tools remain necessary for numerical analysis.
