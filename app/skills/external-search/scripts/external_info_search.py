#!/usr/bin/env python3
"""Search the live web through Tavily, then Serper; Kimi is explicit."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


TAVILY_URL = "https://api.tavily.com/search"
SERPER_URL = "https://google.serper.dev/search"
PROJECT_ROOT = Path(__file__).resolve().parents[4]
KIMI_SCRIPT = PROJECT_ROOT / ".dependencies/kimi-search/app/skills/external-search/scripts/external_info_search.py"


class SearchProviderError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search Tavily, then Serper. Kimi is explicitly selectable.")
    parser.add_argument("--query", "--topic", "--keyword", dest="query", default="")
    parser.add_argument(
        "--queries-file",
        help="UTF-8 JSON file containing a queries array; independent queries run concurrently.",
    )
    parser.add_argument("--site", action="append", default=[])
    parser.add_argument("--source", choices=["auto", "tavily", "serper", "kimi", "moonshot"], default="auto")
    parser.add_argument("--limit", type=int, default=6)
    parser.add_argument("--max-details", type=int, default=5)
    parser.add_argument("--freshness-context")
    parser.add_argument("--timeout", type=float, default=20)
    parser.add_argument("--format", choices=["json"], default="json")
    parser.add_argument("--output", required=True)
    parser.add_argument("--payload-output")
    args, _unknown = parser.parse_known_args()
    return args


def normalized_domains(sites: list[str]) -> list[str]:
    domains: list[str] = []
    for raw in sites:
        value = str(raw or "").strip()
        if not value:
            continue
        parsed = urlsplit(value if "://" in value else f"https://{value}")
        domain = (parsed.hostname or "").lower().removeprefix("www.")
        if domain and domain not in domains:
            domains.append(domain)
    return domains


def search_query(query: str, sites: list[str]) -> str:
    clean = " ".join(str(query or "").split())
    return " ".join([clean, *(f"site:{domain}" for domain in normalized_domains(sites))]).strip()


def request_json(url: str, *, body: dict[str, Any], headers: dict[str, str], timeout: float, provider: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            value = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[-900:]
        for secret in headers.values():
            if len(secret) > 12:
                detail = detail.replace(secret, "[redacted]")
        raise SearchProviderError(f"{provider} HTTP {exc.code}: {detail}") from None
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise SearchProviderError(f"{provider} request failed: {exc}") from None
    if not isinstance(value, dict):
        raise SearchProviderError(f"{provider} returned a non-object response")
    if isinstance(value.get("error"), str) and value["error"]:
        raise SearchProviderError(f"{provider}: {value['error']}")
    return value


def article(url: str, title: str, summary: str = "", published_at: str = "", score: Any = 0) -> dict[str, Any]:
    return {
        "url": str(url or "").strip(),
        "title": str(title or "").strip(),
        "source": (urlsplit(str(url or "")).hostname or "").removeprefix("www."),
        "summary": re.sub(r"\s+", " ", str(summary or "")).strip(),
        "content_text": re.sub(r"\s+", " ", str(summary or "")).strip(),
        "published_at": str(published_at or "").strip(),
        "published_date": str(published_at or "").strip(),
        "relevance_score": float(score or 0),
    }


def answer_from_articles(articles: list[dict[str, Any]], prefix: str = "") -> str:
    lines = [prefix.strip()] if prefix.strip() else []
    for index, item in enumerate(articles, 1):
        lines.append(f"{index}. {item['title']}\n{item['summary']}\n{item['url']}")
    return "\n\n".join(lines).strip()


def search_tavily(query: str, sites: list[str], limit: int, timeout: float) -> dict[str, Any]:
    key = os.getenv("TAVILY_API_KEY", "").strip()
    if not key:
        raise SearchProviderError("Tavily is not configured")
    body: dict[str, Any] = {
        "query": query,
        "search_depth": "basic",
        "topic": "general",
        "max_results": limit,
        "include_answer": False,
        "include_raw_content": False,
    }
    domains = normalized_domains(sites)
    if domains:
        body["include_domains"] = domains
    raw = request_json(TAVILY_URL, body=body, headers={"Authorization": f"Bearer {key}"}, timeout=timeout, provider="Tavily")
    articles = [
        article(item.get("url", ""), item.get("title", ""), item.get("content", ""), item.get("published_date", ""), item.get("score", 0))
        for item in raw.get("results") or [] if isinstance(item, dict) and item.get("url")
    ][:limit]
    if not articles:
        raise SearchProviderError("Tavily returned no search results")
    return {
        "source": "tavily",
        "model": "tavily-search-basic",
        "answer": answer_from_articles(articles),
        "articles": articles,
        "usage": {"billable_requests": 1, "credits": 1, "response_time": raw.get("response_time")},
    }


def search_serper(query: str, sites: list[str], limit: int, timeout: float) -> dict[str, Any]:
    key = os.getenv("SERPER_API_KEY", "").strip()
    if not key:
        raise SearchProviderError("Serper is not configured")
    is_chinese = bool(re.search(r"[\u3400-\u9fff]", query))
    raw = request_json(
        SERPER_URL,
        body={"q": search_query(query, sites), "num": limit, "gl": "cn" if is_chinese else "us", "hl": "zh-cn" if is_chinese else "en"},
        headers={"X-API-KEY": key}, timeout=timeout, provider="Serper",
    )
    articles = [
        article(item.get("link", ""), item.get("title", ""), item.get("snippet", ""), item.get("date", ""), 1 / max(1, int(item.get("position") or 1)))
        for item in raw.get("organic") or [] if isinstance(item, dict) and item.get("link")
    ][:limit]
    if not articles:
        raise SearchProviderError("Serper returned no search results")
    context: list[str] = []
    answer_box = raw.get("answerBox") if isinstance(raw.get("answerBox"), dict) else {}
    knowledge = raw.get("knowledgeGraph") if isinstance(raw.get("knowledgeGraph"), dict) else {}
    for value in (answer_box.get("answer"), answer_box.get("snippet"), knowledge.get("description")):
        if str(value or "").strip():
            context.append(str(value).strip())
    return {
        "source": "serper",
        "model": "serper-google-search",
        "answer": answer_from_articles(articles, "\n".join(context)),
        "articles": articles,
        "usage": {"billable_requests": 1, "credits": 1},
    }


def search_kimi(args: argparse.Namespace, query: str, limit: int, timeout: float) -> dict[str, Any]:
    if not KIMI_SCRIPT.is_file():
        raise SearchProviderError("Kimi search dependency is missing")
    with tempfile.TemporaryDirectory(prefix="mentora-kimi-search-") as directory:
        output = Path(directory) / "result.json"
        command = [
            sys.executable, str(KIMI_SCRIPT), "--query", query, "--source", "kimi",
            "--limit", str(limit), "--max-details", str(args.max_details),
            "--timeout", str(max(30, timeout)), "--output", str(output),
        ]
        for site in args.site:
            command.extend(["--site", site])
        if args.freshness_context:
            command.extend(["--freshness-context", args.freshness_context])
        process = subprocess.run(
            command, cwd=PROJECT_ROOT, env=dict(os.environ), capture_output=True, text=True,
            timeout=max(60, timeout + 30),
        )
        if process.returncode or not output.is_file():
            detail = (process.stderr or process.stdout or "Kimi search failed")[-900:]
            key = os.getenv("MOONSHOT_API_KEY", "").strip()
            if key:
                detail = detail.replace(key, "[redacted]")
            raise SearchProviderError(detail.strip())
        value = json.loads(output.read_text(encoding="utf-8"))
    if not str(value.get("answer") or "").strip():
        raise SearchProviderError("Kimi returned no answer")
    value["source"] = "kimi"
    return value


def record_search(payload: dict[str, Any]) -> None:
    provider = str(payload.get("source") or "").strip()
    if provider not in {"tavily", "serper"}:
        return
    try:
        if str(PROJECT_ROOT) not in sys.path:
            sys.path.insert(0, str(PROJECT_ROOT))
        from app.cost_monitor import COSTS
        usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
        COSTS.record(
            provider=provider, service="联网搜索", operation=f"{provider.title()} 搜索",
            model=str(payload.get("model") or ""), billable_requests=int(usage.get("billable_requests") or 1),
            metadata={"freeCredits": int(usage.get("credits") or 1)},
        )
    except Exception:
        pass


def safe_error(exc: Exception) -> str:
    value = str(exc)
    for name in ("TAVILY_API_KEY", "SERPER_API_KEY", "MOONSHOT_API_KEY"):
        secret = os.getenv(name, "").strip()
        if secret:
            value = value.replace(secret, "[redacted]")
    return value[-900:]


def write_json(path: str, payload: dict[str, Any]) -> None:
    target = Path(path).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_queries(args: argparse.Namespace) -> list[str]:
    values: list[Any] = []
    if args.queries_file:
        path = Path(args.queries_file).expanduser().resolve()
        raw = json.loads(path.read_text(encoding="utf-8"))
        values = raw.get("queries", []) if isinstance(raw, dict) else raw
        if not isinstance(values, list):
            raise ValueError("--queries-file must contain a JSON array or an object with a queries array")
    elif str(args.query or "").strip():
        values = [args.query]
    queries: list[str] = []
    for value in values:
        query = " ".join(str(value or "").split())
        if query and query not in queries:
            queries.append(query)
    if len(queries) > 6:
        raise ValueError("--queries-file accepts at most 6 independent queries")
    return queries


def run_query(args: argparse.Namespace, query: str, limit: int, source: str) -> dict[str, Any]:
    providers = [source] if source != "auto" else ["tavily", "serper"]
    attempts: list[dict[str, str]] = []
    result: dict[str, Any] | None = None
    for provider in providers:
        try:
            if provider == "tavily":
                result = search_tavily(query, args.site, limit, args.timeout)
            elif provider == "serper":
                result = search_serper(query, args.site, limit, args.timeout)
            else:
                result = search_kimi(args, query, limit, args.timeout)
            attempts.append({"provider": provider, "status": "success"})
            break
        except (SearchProviderError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
            attempts.append({"provider": provider, "status": "failed", "error": safe_error(exc)})
            if source != "auto":
                break
    if result is None:
        return {
            "ok": False,
            "requested_query": query,
            "query": search_query(query, args.site),
            "fallback_attempts": attempts,
            "error": "All external search providers failed",
        }
    payload = {
        "ok": True,
        "type": "external-info-search",
        "query": search_query(query, args.site),
        "requested_query": query,
        "source": result.get("source"),
        "model": result.get("model", ""),
        "freshness_context": json.loads(args.freshness_context) if args.freshness_context else {},
        "answer": str(result.get("answer") or "").strip(),
        "article_count": len(result.get("articles") or []),
        "articles": result.get("articles") or [],
        "usage": result.get("usage") or {},
        "fallback_attempts": attempts,
    }
    record_search(payload)
    return payload


def main() -> int:
    args = parse_args()
    try:
        queries = load_queries(args)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Invalid search queries: {safe_error(exc)}", file=sys.stderr)
        return 2
    if not queries:
        print("Missing --query or --queries-file.", file=sys.stderr)
        return 2
    limit = max(1, min(int(args.limit), 10))
    source = "kimi" if args.source == "moonshot" else args.source
    if len(queries) == 1:
        payload = run_query(args, queries[0], limit, source)
        if not payload.get("ok"):
            print("All external search providers failed: " + json.dumps(payload["fallback_attempts"], ensure_ascii=False), file=sys.stderr)
            return 1
        payload.pop("ok", None)
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(queries)) as executor:
            futures = [executor.submit(run_query, args, query, limit, source) for query in queries]
            results = [future.result() for future in futures]
        successful = [item for item in results if item.get("ok")]
        if not successful:
            print("All external search providers failed for every query.", file=sys.stderr)
            return 1
        payload = {
            "type": "external-info-search-batch",
            "queries": queries,
            "query_count": len(queries),
            "success_count": len(successful),
            "results": results,
        }
    write_json(args.output, payload)
    if args.payload_output and Path(args.payload_output).expanduser().resolve() != Path(args.output).expanduser().resolve():
        write_json(args.payload_output, payload)
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
