---
name: external-search
description: Live web retrieval with automatic Tavily then Serper fallback, an explicitly selectable Kimi route, and separate URL reading.
---

# External Search

Use this skill when a request needs external web evidence or content from specific URLs.

## Scripts

- `external_info_search.py`: searches Tavily first, then Serper. It writes the first successful provider's evidence to the common payload contract for the agent's reasoning stage.
- `url_content_reader.py`: reads user-provided URLs; it does not discover new pages.

## Routing Notes

Use `external_info_search.py` for web discovery, current facts, event dates, news, announcements, and non-AInvest sources. Downstream reasoning consumes payload `answer` and uses `articles` as traceable source metadata.

## Exact CLI and output

```sh
python3 app/skill_runner.py execute --script external_info_search.py -- --query "<research question>" --source auto --output outputs/data/search.json
```

When the minimum evidence condition needs several independent angles, write one JSON file such as
`{"queries":["angle one","angle two","angle three"]}` and make one batched call:

```sh
python3 app/skill_runner.py execute --script external_info_search.py -- \
  --queries-file outputs/data/search-queries.json --source auto \
  --output outputs/data/search-batch.json
```

The batch accepts at most six deduplicated queries and executes them concurrently. Prefer this over
several serial `--query` calls. Treat successful rows as usable partial evidence; only retry a failed
row when it leaves a user-required field missing.

The default `--source auto` order is Tavily → Serper. A provider fails over when it is unconfigured, rejects the request, exhausts quota, times out, or returns no results. `fallback_attempts` records every attempted provider and `source` records the provider that succeeded. Kimi is not an automatic fallback because it performs an additional model synthesis. Use `--source kimi` only when the user requests Kimi or the Agent explicitly chooses it for the task.

`--site <domain>` may repeat. `--limit 1..10` controls the result count. `--timeout` controls each retrieval request. `--source tavily|serper|kimi|moonshot` selects one provider; `moonshot` is a compatibility alias for Kimi. `--freshness-context` accepts a JSON object string and is passed to Kimi when that source is selected.

The JSON output includes `source`, `model`, `answer`, `articles`, `article_count`, `usage`, and `fallback_attempts`. Missing credentials and provider errors stay in `fallback_attempts`; do not describe an unattempted provider as failed or a failed route as successful.

Use `url_content_reader.py` only when the user provides one or more URLs and asks to read, summarize, extract, or analyze them.

## Evidence reuse and stopping

One successful discovery result is the reusable observation for that research question. Consume its `answer` and `articles` directly; do not open result URLs with `web_fetch`, `curl`, or ad-hoc HTTP code merely to confirm the same fact. Run at most one narrower follow-up search when the first result has the wrong date or lacks an essential field. A blocked or failed direct URL read is terminal for that route in the current turn: keep the limitation and continue with available structured/search evidence instead of trying more domains.

Tavily uses `TAVILY_API_KEY`; Serper uses `SERPER_API_KEY`; Kimi uses `MOONSHOT_API_KEY`. Credentials stay in the host environment. The Kimi implementation remains pinned through `kimi-search.lock.json`; URL reading remains pinned separately through `url-content-reader.lock.json`.
