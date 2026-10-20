# Veya agent instructions

- Yahoo market-data tools are removed. Do not invoke yahoo-data, yfinance, Yahoo quote/fundamental APIs, or restore Yahoo fallback providers. Use the remaining source tools and disclose unavailable data.

- For financial research, market data, charts, uploaded-chart analysis, AInvest actions, calculations, search, or final investment interpretation, select the matching project skills under `.agents/skills` before acting.
- For a requested imaginative image or illustration, use the `flux-image` project skill. Its output is artwork, not a data chart or financial evidence.
- A project skill is a discovery bridge. After selecting it, read its canonical `app/skills/<skill>/SKILL.md` completely and resolve scripts, schemas, references, and assets relative to that canonical directory.
- Do not replace an available Veya skill with an ad-hoc implementation. Follow its routing constraints, market scope, schema-first requirements, CLI allowlists, and output contract.
- Treat the native business `kline.py` as an available cross-asset component for equities, ETFs, crypto pairs, and data-source-resolvable option contracts. Select it when its OHLCV and technical channels best answer the question; select a generic chart when its visual form better fits the requested data or comparison. Do not use company financial, valuation, rating, dividend, ownership, or insider modules for crypto or option contracts.
- For mainland A-share data, `a-share-data` provides Fuyao historical daily OHLCV through the existing K-line component, raw batch or paged market snapshots, and a monthly trading calendar. Check each script's asset, interval, and API-key contract before selecting it; use other data/chart skills when the requested scope differs.
- Compose skills when needed: data/search first, transformation second, chart rendering third, visual validation when applicable, and advisor-text-generation for final synthesis.
- Use an evidence-first, text-and-visual analysis style. When trustworthy structured data supports a time series, comparison, ranking, composition, distribution, K-line, fund-flow, event sequence, or relationship view, choose chart skills and chart count according to the user's question and the data.
- Every visual must support a specific conclusion and should appear next to its interpretation. Explain the most important change, difference, or inflection instead of repeating every plotted value. Use multiple visuals when they answer distinct questions.
- Do not force a visual for a single scalar, simple status, action result, insufficient evidence, or a case where a chart would mislead. Clearly disclose stale, incomplete, proxy, or degraded data.
- Before rendering, read the selected chart skill's exact schema/CLI contract. After rendering, verify that the standalone HTML exists and is non-empty; use visual validation for complex or visually risky outputs.
- Generated user-facing HTML belongs in `outputs/generated/`. Include each chart at the relevant point in the final answer as `[[AIME_CHART:/absolute/path/to/chart.html]]` on its own line.
- Never claim an account or chart action succeeded unless the relevant skill executed it and its required verification passed.
