# Ordered public streaming

The DeepSeek adapter forwards real public `text-delta` chunks immediately.
`agent/assistant-stream` is transient and is not forwarded by the current SDK's
durable-session JSON-RPC bridge, so `app/dsh_public_stream.cjs` forwards an
application-owned `mentora.public-stream` notification on the same transport.
Only public text and `visualize_show_widget` argument deltas cross that bridge.
Reasoning chunks, completed reasoning blocks, and other tool arguments do not.

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

The Codex CLI adapter forwards public item snapshots/updates as supplied by the
CLI, without inventing token-level updates. Its granularity depends on that CLI.
The independent Deal workflow retains its own existing stage-event contract;
this change does not turn its synchronous internal model calls into deltas.

Verification:

```
python -m pytest tests/test_public_stream.py tests/test_chat_sessions.py
node --test tests/stream-answer-order.test.mjs tests/public-stream-bridge.test.cjs
python tests/fixtures/run_dsh_widget_probe.py
```

The last command exercises the installed Harness tool dispatcher without an LLM
call and requires the normal runtime dependencies and a prepared generated dir.
