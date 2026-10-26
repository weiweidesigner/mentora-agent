# Manual execution and favorites

The updated manual-run UI sends and persists `executionMode=execute`, using the same
decision/order/observation path as scheduled workflows. Saved older trials
without this marker remain previews; reading history never places orders.
Older cached clients omitting the mode still preview until refreshed, avoiding
an unexpected change from preview to execution in a stale browser tab.
No existing workflow is started or replayed by deployment. Confidence, quote,
cash, sizing, position and owner checks are unchanged. Cancelling after a fill
does not undo the fill; rerunning is a new execution, not an automatic rollback.

HK account execution uses unadjusted HKD snapshots, dated HKD/USD reference FX,
USD account marks and retained native prices. XHKG sessions, half-day close plus
auction buffer, lunch, stale/future quotes and stale FX are checked. The account
uses integer-share quantities and existing fee/slippage settings; it does not
claim broker or exchange board-lot matching. No broker connector is involved.

Favorite import validates identity from the local universe or existing symbol
resolver, then saves without waiting for quotes. Existing favorites are
idempotent. Client import uses at most four requests concurrently with progress,
retains failures for retry, and reloads only favorites after completion. Missing
quotes remain empty until the normal refresh; adding is not an order operation.

The portfolio-data Skill is an intentional host-owned override of the pinned
dependency directory, keeping the execution currency and supported-market
contract aligned with the adapter. Other dependency files stay unchanged.
