# Ordered public streaming

The DeepSeek adapter forwards real public `text-delta` chunks immediately.
`agent/assistant-stream` is transient and is not forwarded by the current SDK's
durable-session JSON-RPC bridge, so `app/dsh_public_stream.cjs` forwards an
application-owned `mentora.public-stream` notification on the same transport.
Only public text and `visualize_show_widget` argument deltas cross that bridge.
Reasoning chunks, completed reasoning blocks, and other tool arguments do not.
The SDK is required for this route; a missing SDK is a configuration error, not
a silent fallback to buffered headless stdout.

`visualize_show_widget` runs in the same Agent loop. Its argument deltas drive
StreamViz while the model generates them; execution validates and saves a
portable artifact. There is no gateway-triggered second model pass. Ordinary
script-generated HTML appears as a completed iframe, not simulated deltas.

The browser keeps separate text blocks and per-call visual/tool slots in event
order. Finalization preserves the live DOM instead of flattening/reordering it.
The server stores each event with a sequence cursor; terminal responses include
compact `streamBlocks` containing text, tool states and durable artifact URLs.
Session replay uses these blocks, including on errors. Existing sessions without
ordered blocks retain their legacy renderer; their missing original deltas
cannot be reconstructed.

The Codex adapter now uses app-server's `item/agentMessage/delta` stream, with
per-item settlement deduplication and started/completed tool notifications.
The workspace-write sandbox, model/provider selection, images and thread resume
are preserved. Interactive approval requests are rejected, never auto-approved.
An explicitly configured legacy `AICHART_CODEX_TRANSPORT=exec` remains available
for compatibility tests; it is not the production default or a silent fallback.

Deal's planning loop and scheduled reports consume real Chat Completions streams.
`public_text` is optional public narration before continuing with a tool; `reason`
is the public report in the planner, not private chain-of-thought. Report calls
opt into `title` and `overview`. Only these explicitly selected JSON string paths
are incrementally decoded; nested values, reasoning_content and internal JEV
classification/strategy parameters are never displayed as answer prose.
Deal can invoke the same native widget renderer inside its own planning loop;
widget arguments stream before execution and a validated artifact URL settles
that same visual slot afterward. Charts do not wait for the final report.
Format-repair attempts retract their provisional blocks before retrying. Business
validation still precedes all paper-trading actions. Actual execution receipts
and unstreamed deterministic final notices are appended once after execution.
Closing a Deal stream signals cancellation and prevents further Skill actions.

Chat and scheduled-task history both store compact chronological `streamBlocks`.
Completed script-generated charts appear immediately as iframe modules; native
DeepSeek widget arguments are incremental. A completed HTML file is never sliced
into fake generation frames. Internal scoring calls are not user-answer streams.

Protocol reference: https://developers.openai.com/codex/app-server/

Verification:

```
python -m pytest tests/test_public_stream.py tests/test_chat_sessions.py
python -m pytest tests/test_public_json.py tests/test_codex_stream_bridge.py tests/test_deal_streaming.py
node --test tests/stream-answer-order.test.mjs tests/public-stream-bridge.test.cjs
python tests/fixtures/run_dsh_widget_probe.py
```

The last command exercises the installed Harness tool dispatcher without an LLM
call and requires the normal runtime dependencies and a prepared generated dir.
