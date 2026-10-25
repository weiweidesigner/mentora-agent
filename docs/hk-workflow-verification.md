# HK research and workflow flow-state verification

Baseline: host `62135d86c0d0ce299b3bcc309ea1676d927b4a63`, overlay
`9588b1152aa000271164cc288ff130974855ce67`.

Focused verification:

```sh
python3 -m pytest tests/test_hk_market_data.py tests/test_market_reads.py tests/test_workflows.py .dependencies/mentora-deal/tests/test_hk_research.py -q
node --test tests/workflows.test.mjs tests/workflow-observations.test.mjs
python3 tests/browser_workflow_description_qa.py
```

- 86 focused Python checks pass, including identity, no source substitution,
  adjustment, currency, duplicates, malformed/nonfinite OHLCV, stale history,
  full/half-day closing auction, research persistence and order rejection.
- 20 focused Node checks pass, including branch activation, partial upstreams,
  saved scheduled-run polling and removal of motion after terminal status.
- Real Chromium at 1280/390px: two-line clipping at four zoom levels; moving
  dash offset; light/dark contrast; reduced-motion stops animation; terminal
  state removes the moving overlay.
- Registered `read_market_data.py` live check for two explicit HK listings:
  132 rows each through 2026-10-23, native HKD, forward-adjusted, not stale.
  Reused those exact observations in the registered backtest dispatcher:
  both computed, with research-only metadata preserved. No orders submitted.

Full legacy suites were also run, and are **not all green**:

```sh
python3 -m pytest tests/test_portfolio.py tests/test_portfolio_laya.py tests/test_portfolio_research.py tests/test_portfolio_skills.py tests/test_portfolio_workflow.py -q
node --test --test-force-exit tests/portfolio.test.mjs
```

Both modified and independently archived baseline source trees return the same
17 Python failures (146 pass) and 7 legacy UI failures (14 pass). These existing
failures concern confidence-policy expectations, compact-state/test fixtures,
legacy task defaults and old UI labels/selectors. No confidence thresholds or
trading policy were changed to make these tests pass. Fixing that pre-existing
suite drift is outside this HK/history/edge-animation change.
