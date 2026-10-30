---
name: business-chart-recall
description: Generate structured financial business charts and market overviews. Bond YTM versus remaining maturity scatter and sample-median quadrants use bond_scatter.py (no equity symbol required; dated 20-bond sample membership, refreshed quotes), not a Treasury yield curve. Crypto Fear & Greed sentiment (index/BTCUSD history lines with native tooltip and time range) uses fear_greed.py; it is not the CNN US-equity index. Market Momentum / market breadth strength (advancing-declining, new high-low, above/below SMA50 and SMA200 counts/ratios) uses market_momentum.py, with no symbol required. For major US ETFs today / intraday price trends, market_trackers.py --category etfs reads the official ETF list and real minute prices, with selectable quote cards and periods. Single-instrument technical analysis uses K-lines. K-lines support equities, ETFs, crypto assets, and resolvable option contracts; company fundamentals and other business modules remain limited to applicable US-listed securities.
---

# Veya skill bridge

Before acting, read `../../../app/skills/business-chart-recall/SKILL.md` completely and follow it as the canonical instruction file. Resolve scripts, schemas, and resources relative to `app/skills/business-chart-recall/`.
