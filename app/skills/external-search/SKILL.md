---
name: external-search
description: Kimi-grounded web answer skill for non-AInvest information. The search script returns Kimi's final answer after its Formula tool loop; citations are supporting metadata, not reconstructed search-engine output. URL reading remains a separate capability.
---

# External Search

Use this skill when a request needs external web evidence or content from specific URLs.

## Scripts

- `external_info_search.py`: uses the existing Moonshot Formula tools/fibers loop, and writes Kimi's final `message.content` as the primary `answer` observation.
- `url_content_reader.py`: reads user-provided URLs; it does not discover new pages.

## Routing Notes

Use `external_info_search.py` for web discovery, current facts, event dates, news, announcements, and non-AInvest sources. Downstream reasoning must consume payload `answer` first. `articles` only contains citations/references extracted from Kimi's final response when available.

Do not call legacy search engines, crawl returned pages, or rebuild Kimi's answer from tool arguments. Execute requested Formula fibers, submit their outputs as tool messages, continue the model loop, and consume the final answer.

Use `url_content_reader.py` only when the user provides one or more URLs and asks to read, summarize, extract, or analyze them.

The Kimi script is pinned through `kimi-search.lock.json` to the public `weiweidesigner/kimi-search` repository. Credentials remain in the host ignored `.env` or process environment. `url_content_reader.py` is separately pinned through `url-content-reader.lock.json` to the public `weiweidesigner/url-content-reader` repository. Its logical host entry and URL-reading output contract remain unchanged.
