Mentora Laya adapter

Only the portfolio-jev Skill decision provider is changed. Research generation and
other chart/widget routers have their own provider configuration.

Deployment:
1. Create /home/ubuntu/veya-laya-venv with CPU PyTorch, then install requirements.txt.
2. Place the pinned convaiinnovations/laya-multilingual snapshot at
   /home/ubuntu/veya-laya-model (trial revision 1720e3e3357cfe1e281542e223f8273b0890ca34).
3. Install mentora-laya.service and start it. The inference API binds only to loopback.
4. Check GET http://127.0.0.1:8791/health.
5. Set PORTFOLIO_DECISION_PROVIDER=laya in the main service environment.
   LAYA_DECISION_URL defaults to http://127.0.0.1:8791/predict.
   Restore PORTFOLIO_DECISION_PROVIDER=jev to return to the previous provider.

The model never calculates order quantity. Shared order sizing limits, valuation,
tradable quote flags, lot size, cash reserve, current positions, backtest return and
user drawdown bounds are checked before inference. Missing/non-finite inputs block
an actionable decision. Risk exits also require positive available-to-sell quantity.
The final order planner repeats its checks against current account/quote state.

One compact state per symbol; at most two choice questions (original and reversed
label order). The sidecar refuses state >1400 tokens or truncated state/options.
It serializes inference for predictable CPU memory use.

Acceptance requires matching choices, max probability >=0.85 in both views, margin
>=0.25, and normalized probability confidence >=0.65. These are conservative gates,
not a fitted calibration curve or a claim about financial win rate. Calibration and
model quality still require held-out domain data. Uncertain answers return watch/hold.
Small backtest samples cap entry size at 25%; mature ones at 50% of existing order limits.

Tests: python -m pytest tests/test_portfolio_laya.py tests/test_portfolio_workflow.py tests/test_portfolio.py -q
Trial: work/laya-eval/evaluate_optimized.py (local private evidence files required).
