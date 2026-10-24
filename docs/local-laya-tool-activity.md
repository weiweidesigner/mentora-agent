# Local Laya tool-activity semantics

The DeepSeek Harness stream adapter classifies root tool invocations through the existing local Laya service. It does not use Typesafe/hosted JEV, an API key, the Agent's proposed title, or private reasoning as the classification source.

Laya selects an activity stage. The application maps that stage to a localized presentation label; these labels are not free-form model prose. A bounded hierarchy of 2–3 option decisions respects the sidecar's option limit. `confidence` is the minimum selected-branch probability, not a calibrated correctness or trading probability.

Configuration:

- `LAYA_DECISION_URL`: the existing local decision endpoint; required to enable activity classification.
- `LAYA_ACTIVITY_MODEL`: defaults to `LAYA_VISUAL_MODEL`, then `convaiinnovations/laya-multilingual`.
- `LAYA_ACTIVITY_TIMEOUT_SECONDS`: per-request timeout, default 3 seconds.
- `LAYA_ACTIVITY_ROUTING_ENABLED`: defaults to true; false explicitly disables classification.

Activity classification runs in a per-run background worker. The actual Agent/tool execution and public answer deltas are never held for it. Start/result events share a call ID and one semantic decision. The adapter publishes a `semanticUpdate` of the existing step, retaining its current lifecycle state, command, output, and file changes. An older classification cannot replace a newer tool/progress title. Answer streaming, automatic thinking collapse, chart placement, and public progress routing are unchanged.

Successful `tool_step.activitySemantics` stores `provider=local-laya`, `status=classified`, `stage`, `providerModel`, `confidence`, and `labelSource=stage-label`. This metadata survives durable stream-block reduction and replay. Only successful decisions enter the bounded cache, keyed by redacted actual invocation arguments, excluding Agent descriptions and private/payload contents.

Pending classification is internal metadata, never a new user-visible activity. Pending/fallback decisions retain the tool's existing public description (or no title); failure/source details remain in `activitySemantics`, not prefixes or waiting/error titles in the thinking stream. Model failure opens a per-run circuit; it never calls hosted JEV or labels fallback metadata as a Laya decision. If a run ends before a decision is ready, finalization records `classification-not-ready` without delaying the answer or applying late mutations. Cancellation closes the background worker through a generator `finally` block. After the first answer delta, late tool/semantic updates only update activity history and cannot replace the collapsed duration header with a live title.

Registered script labels and their introductory capability sentence enrich the invocation; Agent-supplied capability claims are discarded. The shell wrapper is not included as semantic evidence when a command exists. A selected-branch probability below 0.6 yields `laya-uncertain`, does not enter the cache, and does not open the outage circuit. This is an abstention guard, not a calibrated accuracy guarantee.

Verification covers the local-only client contract, candidate bounds, secret redaction, asynchronous/non-blocking behavior, completion-state reuse, cache reuse, fallback provenance, root-only Harness integration, and existing UI lifecycle/Markdown/chart regressions.
