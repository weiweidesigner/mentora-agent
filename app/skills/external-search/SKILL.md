---
name: external-search
description: Search the web or find existing images/photos with source links through Tavily and Serper. Kimi is explicitly selected and web-only. URL reading is separate; image generation is not image search.
---

# External Search

Use this skill when a request needs external web evidence or content from specific URLs.
Also use it for finding existing images, photos, logos or reference pictures, not generating new artwork.

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

## Image search

Use the same script with `--mode images`. It reuses the existing keys and the
Tavily → Serper fallback, without an embedded Agent or model synthesis. Do not
route image search to Kimi or to FLUX. Existing web mode is unchanged.

```sh
python3 app/skill_runner.py execute --script external_info_search.py -- --mode images --query "Apple Park aerial photo" --limit 6 --output outputs/generated/image-search-unique.html --payload-output outputs/data/image-search-unique.json
```

Use a unique output basename for each search. For data only, `--output` may be
a JSON path. Image mode accepts `--limit 1..50`, `--site`, `--source auto|tavily|serper`,
`--page 1..100`, `--timeout`, and the existing query batch input. Limits are requested
counts, not guarantees. Tavily has no pagination: page >1 fails that route and
auto can proceed to Serper. Explicit Tavily fails rather than silently changing
providers. No automatic multi-page scraping. Keep provider/failed attempts visible.

Results add `images`, `image_count`, `page`, `mode`, and optional `gallery_path`.
Each image keeps `image_url`, `thumbnail_url`, `source_url`, `title`, `description`,
`width`, `height`, `source`, `provider`, `license`, and `availability`.
Missing fields remain empty/null. Tavily result-level images inherit that result's
source URL; standalone images without a source page remain unattributed. Never
guess a source page from the image host. URLs are deduplicated; no image bytes or
base64 enter the reasoning context, and no original images are downloaded server-side.

For a visual answer, emit the returned gallery using the existing
`[[AIME_CHART:/absolute/path/to/image-search-unique.html]]` marker. It is an iframe
gallery, not a generated-image artifact and not a financial chart. Do not label
external search results as AI-generated art or interpret their contents without
actually viewing them. The gallery uses browser-side previews, click-to-enlarge,
source/original links and copy-link controls; each failed image degrades independently.
The gallery displays at most **six unique results per answer**: the first four
are a two-column, two-row photo grid, and results five/six are compact thumbnail
list rows. Display photo, provider-returned title and source; omit heavy cards,
dimensions and repeated action bars. Photos fill a fixed-height crop with
`object-fit:cover`; clicking opens the uncropped original. The component itself
has zero horizontal padding and stays aligned with the answer text at every width.
This photo-cropping rule does not apply to financial chart axes or data marks.

The full search payload may retain more candidates, but the gallery's
`displayed_count` is the visible count: never say all `image_count` results are
displayed. Do not expand beyond six by adding more galleries or recreating the
layout with StreamViz. Use the gallery directly. After the visual, invite the user
to specify scene, era, aspect ratio or resolution when useful; do not fabricate
photo content, dates, descriptions or source names. Gallery refinement buttons
only prepare a composer draft; a new search requires the user's next message.
Search metadata is not proof that a URL still loads or that an image is genuine,
current, licensed, or commercially reusable. License remains unknown unless verified.

Provider references: [Tavily source-linked images](https://www.tavily.com/blog/better-image-retrieval)
and [Serper Images response](https://serper.dev/).

## Evidence reuse and stopping

One successful discovery result is the reusable observation for that research question. Consume its `answer` and `articles` directly; do not open result URLs with `web_fetch`, `curl`, or ad-hoc HTTP code merely to confirm the same fact. Run at most one narrower follow-up search when the first result has the wrong date or lacks an essential field. A blocked or failed direct URL read is terminal for that route in the current turn: keep the limitation and continue with available structured/search evidence instead of trying more domains.

Tavily uses `TAVILY_API_KEY`; Serper uses `SERPER_API_KEY`; Kimi uses `MOONSHOT_API_KEY`. Credentials stay in the host environment. The Kimi implementation remains pinned through `kimi-search.lock.json`; URL reading remains pinned separately through `url-content-reader.lock.json`.
