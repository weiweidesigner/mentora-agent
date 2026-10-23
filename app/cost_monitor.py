"""Persist provider usage without ever storing or returning API credentials."""
from __future__ import annotations

import datetime as dt
import json
import os
import secrets
import sqlite3
import threading
import uuid
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, RedirectResponse


PROVIDERS = {
    "deepseek": {"label": "DeepSeek", "keys": ("DEEPSEEK_API_KEY", "AICHART_STREAMVIZ_API_KEY", "VISION_API_KEY")},
    "kimi": {"label": "Kimi / Moonshot", "keys": ("MOONSHOT_API_KEY",)},
    "typesafe": {"label": "JEV / TypeSafe", "keys": ("TYPESAFE_API_KEY",)},
    "openrouter": {"label": "OpenRouter", "keys": ("OPENROUTER_API_KEY", "AICHART_WIDGET_JEV_API_KEY")},
    "ark": {"label": "火山方舟", "keys": ("ARK_API_KEY",)},
    "fuyao": {"label": "扶摇数据", "keys": ("FUYAO_API_KEY",), "costVisible": False},
    "tavily": {"label": "Tavily Search", "keys": ("TAVILY_API_KEY",)},
    "serper": {"label": "Serper Search", "keys": ("SERPER_API_KEY",)},
}


def _number(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _usage_value(usage: Any, name: str) -> int:
    if isinstance(usage, dict):
        return _number(usage.get(name))
    return _number(getattr(usage, name, 0))


class CostMonitor:
    def __init__(self, directory: Path | None = None) -> None:
        root = directory or Path(os.getenv("VEYA_COST_DATA_DIR", Path(__file__).resolve().parents[1] / "outputs" / "cost-monitor"))
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / "usage.sqlite3"
        self.guard = threading.Lock()
        self.account_guard = threading.Lock()
        self.account_cache: dict[str, Any] = {}
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS usage_events(
                id TEXT PRIMARY KEY, provider TEXT NOT NULL, service TEXT NOT NULL, model TEXT NOT NULL,
                operation TEXT NOT NULL, status TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0,
                cached_input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
                billable_requests INTEGER NOT NULL DEFAULT 1, cost_cny REAL, pricing_note TEXT NOT NULL DEFAULT '',
                created TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}')""")
            columns = {str(row[1]) for row in db.execute("PRAGMA table_info(usage_events)")}
            for name, declaration in (
                ("reasoning_tokens", "INTEGER NOT NULL DEFAULT 0"),
                ("conversation_id", "TEXT NOT NULL DEFAULT ''"),
                ("conversation_title", "TEXT NOT NULL DEFAULT ''"),
            ):
                if name not in columns:
                    db.execute(f"ALTER TABLE usage_events ADD COLUMN {name} {declaration}")
            db.execute("CREATE INDEX IF NOT EXISTS usage_events_created ON usage_events(created)")
            db.execute("CREATE INDEX IF NOT EXISTS usage_events_conversation ON usage_events(conversation_id, created)")
            db.execute(
                """UPDATE usage_events
                   SET cost_cny=0, pricing_note='当前使用免费额度；成功请求同时计入额度消耗'
                   WHERE provider IN ('tavily','serper') AND status='success' AND cost_cny IS NULL"""
            )

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    @staticmethod
    def _deepseek_cost(created: dt.datetime, model: str, input_tokens: int, cached: int, output_tokens: int) -> tuple[float | None, str]:
        if not any(name in model.lower() for name in ("deepseek", "flash", "v4")):
            return None, "该模型未配置单价"
        if input_tokens + output_tokens <= 0:
            return None, "调用已记录，但提供商未返回 Token usage"
        local = created.astimezone(ZoneInfo("Asia/Shanghai"))
        peak = local.weekday() < 5 and ((9 <= local.hour < 12) or (14 <= local.hour < 18))
        hit_rate, miss_rate, output_rate = ((.04, 2.0, 8.0) if peak else (.02, 1.0, 4.0))
        miss = max(0, input_tokens - cached)
        cost = (cached * hit_rate + miss * miss_rate + output_tokens * output_rate) / 1_000_000
        return cost, "按 DeepSeek Flash 当前%s公开价估算" % ("高峰" if peak else "空闲")

    @staticmethod
    def _configured_cost(provider: str, input_tokens: int, cached: int, output_tokens: int, requests: int) -> tuple[float | None, str]:
        if provider in {"tavily", "serper"}:
            return 0.0, "当前使用免费额度；成功请求同时计入额度消耗"
        prefix = "AICHART_COST_" + provider.upper()
        values = [os.getenv(prefix + suffix, "") for suffix in ("_INPUT_CNY_PER_M", "_CACHED_INPUT_CNY_PER_M", "_OUTPUT_CNY_PER_M", "_REQUEST_CNY")]
        if not any(v.strip() for v in values):
            return None, "提供商返回用量；单价尚未配置"
        try:
            input_rate = float(values[0] or 0); cached_rate = float(values[1] or input_rate)
            output_rate = float(values[2] or 0); request_rate = float(values[3] or 0)
        except ValueError:
            return None, "单价配置无效"
        miss = max(0, input_tokens - cached)
        return ((miss * input_rate + cached * cached_rate + output_tokens * output_rate) / 1_000_000 + requests * request_rate), "按项目配置单价估算"

    def record(self, *, provider: str, service: str, model: str = "", operation: str = "", status: str = "success",
               input_tokens: int = 0, cached_input_tokens: int = 0, output_tokens: int = 0,
               reasoning_tokens: int = 0, conversation_id: str = "", conversation_title: str = "",
               billable_requests: int = 1, metadata: dict[str, Any] | None = None,
               created: dt.datetime | None = None) -> str:
        provider = provider.strip().lower() or "unknown"
        created = created or dt.datetime.now(dt.timezone.utc)
        input_tokens, cached_input_tokens, output_tokens, reasoning_tokens = map(
            _number, (input_tokens, cached_input_tokens, output_tokens, reasoning_tokens)
        )
        requests = _number(billable_requests)
        if status != "success":
            cost, note = 0.0, "失败调用未计入估算费用"
        elif provider == "deepseek":
            cost, note = self._deepseek_cost(created, model, input_tokens, cached_input_tokens, output_tokens)
        else:
            cost, note = self._configured_cost(provider, input_tokens, cached_input_tokens, output_tokens, requests)
        event_id = uuid.uuid4().hex
        with self.guard, self.connect() as db:
            db.execute("""INSERT INTO usage_events(
                id, provider, service, model, operation, status, input_tokens, cached_input_tokens,
                output_tokens, billable_requests, cost_cny, pricing_note, created, metadata,
                reasoning_tokens, conversation_id, conversation_title
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                event_id, provider, service[:120], model[:160], operation[:160], status[:20], input_tokens,
                cached_input_tokens, output_tokens, requests, cost, note, created.isoformat(),
                json.dumps(metadata or {}, ensure_ascii=False, default=str)[:8000], reasoning_tokens,
                str(conversation_id or "")[:240], str(conversation_title or "")[:500],
            ))
        return event_id

    def record_response(self, response: Any, *, provider: str, service: str, operation: str = "", model: str = "",
                        conversation_id: str = "", conversation_title: str = "") -> str:
        usage = getattr(response, "usage", None) or {}
        details = getattr(usage, "prompt_tokens_details", None) or (usage.get("prompt_tokens_details", {}) if isinstance(usage, dict) else {})
        completion_details = getattr(usage, "completion_tokens_details", None) or (
            usage.get("completion_tokens_details", {}) if isinstance(usage, dict) else {}
        )
        cached = _usage_value(usage, "prompt_cache_hit_tokens") or _usage_value(details, "cached_tokens")
        return self.record(provider=provider, service=service, operation=operation,
                           model=str(getattr(response, "model", "") or model),
                           input_tokens=_usage_value(usage, "prompt_tokens") or _usage_value(usage, "input_tokens"),
                           cached_input_tokens=cached,
                           output_tokens=_usage_value(usage, "completion_tokens") or _usage_value(usage, "output_tokens"),
                           reasoning_tokens=_usage_value(usage, "reasoning_tokens") or _usage_value(completion_details, "reasoning_tokens"),
                           conversation_id=conversation_id, conversation_title=conversation_title)

    @staticmethod
    def configurations() -> list[dict[str, Any]]:
        jev_provider = os.getenv("AICHART_JEV_PROVIDER", os.getenv("AICHART_WIDGET_JEV_PROVIDER", "typesafe")).strip().lower()
        rows = []
        for provider, spec in PROVIDERS.items():
            configured = [name for name in spec["keys"] if os.getenv(name, "").strip()]
            active = (
                provider != "ark"
                and (provider != "typesafe" or jev_provider != "openrouter")
                and (provider != "openrouter" or jev_provider == "openrouter")
            )
            rows.append({"provider": provider, "label": spec["label"], "configured": bool(configured),
                         "active": active, "costVisible": spec.get("costVisible", True),
                         "mode": "manual" if provider == "kimi" else "automatic",
                         "credentials": len(configured), "keyLabels": configured})
        return rows

    def deepseek_account(self) -> dict[str, Any] | None:
        """Read the official account balance while keeping credentials server-side."""
        key = next((os.getenv(name, "").strip() for name in PROVIDERS["deepseek"]["keys"] if os.getenv(name, "").strip()), "")
        if not key:
            return None
        now = dt.datetime.now(dt.timezone.utc)
        cached = self.account_cache.get("deepseek")
        if cached and (now - cached["fetched"]).total_seconds() < 60:
            return cached["value"]
        with self.account_guard:
            cached = self.account_cache.get("deepseek")
            if cached and (now - cached["fetched"]).total_seconds() < 60:
                return cached["value"]
            request = urllib.request.Request(
                "https://api.deepseek.com/user/balance",
                headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    payload = json.load(response)
                info = next((item for item in payload.get("balance_infos", []) if item.get("currency") == "CNY"), None)
                if not info:
                    return None
                value = {
                    "provider": "deepseek", "label": "DeepSeek 平台", "currency": "CNY",
                    "isAvailable": bool(payload.get("is_available")),
                    "totalBalance": float(info.get("total_balance") or 0),
                    "grantedBalance": float(info.get("granted_balance") or 0),
                    "toppedUpBalance": float(info.get("topped_up_balance") or 0),
                    "syncedAt": now.isoformat(), "source": "DeepSeek 官方 /user/balance", "stale": False,
                }
                self.account_cache["deepseek"] = {"fetched": now, "value": value}
                return value
            except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError):
                if cached:
                    return {**cached["value"], "stale": True}
                return None

    def openrouter_account(self) -> dict[str, Any] | None:
        """Read usage and credit limits exposed for the configured OpenRouter key."""
        key = next((os.getenv(name, "").strip() for name in PROVIDERS["openrouter"]["keys"] if os.getenv(name, "").strip()), "")
        if not key:
            return None
        now = dt.datetime.now(dt.timezone.utc)
        cached = self.account_cache.get("openrouter")
        if cached and (now - cached["fetched"]).total_seconds() < 300:
            return cached["value"]
        with self.account_guard:
            cached = self.account_cache.get("openrouter")
            if cached and (now - cached["fetched"]).total_seconds() < 300:
                return cached["value"]
            headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
            try:
                requests = []
                for endpoint in ("key", "credits"):
                    request = urllib.request.Request(f"https://openrouter.ai/api/v1/{endpoint}", headers=headers)
                    with urllib.request.urlopen(request, timeout=5) as response:
                        requests.append(json.load(response).get("data") or {})
                key_info, credits = requests
                value = {
                    "provider": "openrouter", "label": "OpenRouter", "currency": "USD",
                    "isAvailable": not bool(key_info.get("disabled")),
                    "isManagementKey": bool(key_info.get("is_management_key")),
                    "usageToday": float(key_info.get("usage_daily") or 0),
                    "usageWeek": float(key_info.get("usage_weekly") or 0),
                    "usageMonth": float(key_info.get("usage_monthly") or 0),
                    "totalUsage": float(credits.get("total_usage") or key_info.get("usage") or 0),
                    "totalCredits": float(credits.get("total_credits") or 0),
                    "limit": float(key_info["limit"]) if key_info.get("limit") is not None else None,
                    "limitRemaining": float(key_info["limit_remaining"]) if key_info.get("limit_remaining") is not None else None,
                    "syncedAt": now.isoformat(), "source": "OpenRouter 官方 /key 与 /credits", "stale": False,
                }
                self.account_cache["openrouter"] = {"fetched": now, "value": value}
                return value
            except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError):
                if cached:
                    return {**cached["value"], "stale": True}
                return None

    def kimi_account(self) -> dict[str, Any] | None:
        """Read the official Kimi balance exposed for the configured China-platform key."""
        key = next((os.getenv(name, "").strip() for name in PROVIDERS["kimi"]["keys"] if os.getenv(name, "").strip()), "")
        if not key:
            return None
        now = dt.datetime.now(dt.timezone.utc)
        cached = self.account_cache.get("kimi")
        if cached and (now - cached["fetched"]).total_seconds() < 300:
            return cached["value"]
        with self.account_guard:
            cached = self.account_cache.get("kimi")
            if cached and (now - cached["fetched"]).total_seconds() < 300:
                return cached["value"]
            request = urllib.request.Request(
                "https://api.moonshot.cn/v1/users/me/balance",
                headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    payload = json.load(response)
                info = payload.get("data") or {}
                value = {
                    "provider": "kimi", "label": "Kimi 开放平台", "currency": "CNY",
                    "isAvailable": float(info.get("available_balance") or 0) > 0,
                    "availableBalance": float(info.get("available_balance") or 0),
                    "cashBalance": float(info.get("cash_balance") or 0),
                    "voucherBalance": float(info.get("voucher_balance") or 0),
                    "manualOnly": True,
                    "syncedAt": now.isoformat(),
                    "source": "Kimi 官方 /v1/users/me/balance", "stale": False,
                }
                self.account_cache["kimi"] = {"fetched": now, "value": value}
                return value
            except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError):
                if cached:
                    return {**cached["value"], "stale": True}
                return None

    def tavily_account(self) -> dict[str, Any] | None:
        """Synchronize Tavily's current billing-cycle credit usage."""
        key = next((os.getenv(name, "").strip() for name in PROVIDERS["tavily"]["keys"] if os.getenv(name, "").strip()), "")
        if not key:
            return None
        now = dt.datetime.now(dt.timezone.utc)
        cached = self.account_cache.get("tavily")
        if cached and (now - cached["fetched"]).total_seconds() < 300:
            return cached["value"]
        with self.account_guard:
            cached = self.account_cache.get("tavily")
            if cached and (now - cached["fetched"]).total_seconds() < 300:
                return cached["value"]
            request = urllib.request.Request(
                "https://api.tavily.com/usage",
                headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    payload = json.load(response)
                account, key_usage = payload.get("account") or {}, payload.get("key") or {}
                limit = _number(account.get("plan_limit"))
                used = _number(account.get("plan_usage"))
                value = {
                    "provider": "tavily", "label": "Tavily 免费额度",
                    "isAvailable": limit == 0 or used < limit,
                    "plan": str(account.get("current_plan") or "Free"),
                    "quotaLimit": limit, "quotaUsed": used,
                    "quotaRemaining": max(0, limit - used) if limit else None,
                    "searchUsage": _number(account.get("search_usage")),
                    "recordedUsage": self._recorded_credit_usage("tavily"),
                    "keyUsage": _number(key_usage.get("usage")),
                    "quotaCycle": "每月", "estimated": False,
                    "syncedAt": now.isoformat(), "source": "Tavily 官方 /usage", "stale": False,
                }
                self.account_cache["tavily"] = {"fetched": now, "value": value}
                return value
            except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError):
                if cached:
                    return {**cached["value"], "stale": True}
                return None

    def _recorded_credit_usage(self, provider: str) -> int:
        with self.connect() as db:
            row = db.execute(
                "SELECT COALESCE(SUM(billable_requests), 0) AS used FROM usage_events WHERE provider=? AND status='success'",
                (provider,),
            ).fetchone()
        return _number(row["used"] if row else 0)

    def serper_account(self) -> dict[str, Any] | None:
        """Expose a clearly-labelled local estimate because Serper has no balance API."""
        key = next((os.getenv(name, "").strip() for name in PROVIDERS["serper"]["keys"] if os.getenv(name, "").strip()), "")
        if not key:
            return None
        now = dt.datetime.now(dt.timezone.utc)
        limit = _number(os.getenv("AICHART_SERPER_FREE_CREDITS", "2500")) or 2500
        used = self._recorded_credit_usage("serper")
        return {
            "provider": "serper", "label": "Serper 免费额度",
            "isAvailable": used < limit,
            "quotaLimit": limit, "quotaUsed": used, "quotaRemaining": max(0, limit - used),
            "searchUsage": used, "recordedUsage": used, "quotaCycle": "初始赠送", "estimated": True,
            "syncedAt": now.isoformat(),
            "source": "Mentora 成功调用记录（Serper 未开放账户余额 API）", "stale": False,
        }

    def summary(self, days: int = 30) -> dict[str, Any]:
        days = min(365, max(1, days))
        now = dt.datetime.now(dt.timezone.utc); start = now - dt.timedelta(days=days - 1)
        with self.connect() as db:
            rows = [dict(row) for row in db.execute("SELECT * FROM usage_events WHERE created>=? ORDER BY created DESC", (start.isoformat(),))]
        configs = {row["provider"]: row for row in self.configurations()}
        rows = [row for row in rows if configs.get(row["provider"], {}).get("costVisible", True)]
        providers: dict[str, dict[str, Any]] = {}
        daily: dict[str, dict[str, Any]] = {}
        for row in rows:
            provider = row["provider"]
            item = providers.setdefault(provider, {"provider": provider, "label": configs.get(provider, {}).get("label", provider),
                "calls": 0, "failed": 0, "inputTokens": 0, "cachedInputTokens": 0, "outputTokens": 0,
                "reasoningTokens": 0, "knownCostCny": 0.0, "unpricedCalls": 0})
            item["calls"] += 1; item["failed"] += row["status"] != "success"
            item["inputTokens"] += row["input_tokens"]; item["cachedInputTokens"] += row["cached_input_tokens"]
            item["outputTokens"] += row["output_tokens"]
            item["reasoningTokens"] += row.get("reasoning_tokens", 0)
            if row["cost_cny"] is None: item["unpricedCalls"] += 1
            else: item["knownCostCny"] += row["cost_cny"]
            try:
                day = dt.datetime.fromisoformat(row["created"]).astimezone(ZoneInfo("Asia/Shanghai")).date().isoformat()
            except ValueError:
                day = row["created"][:10]
            point = daily.setdefault(day, {"day": day, "knownCostCny": 0.0, "calls": 0})
            point["calls"] += 1; point["knownCostCny"] += row["cost_cny"] or 0
        for provider, config in configs.items():
            item = providers.setdefault(provider, {"provider": provider, "label": config["label"], "calls": 0, "failed": 0,
                "inputTokens": 0, "cachedInputTokens": 0, "outputTokens": 0, "knownCostCny": 0.0, "unpricedCalls": 0})
            item.setdefault("reasoningTokens", 0)
            item.update({"configured": config["configured"], "active": config["active"],
                         "costVisible": config["costVisible"], "credentials": config["credentials"],
                         "keyLabels": config["keyLabels"], "mode": config["mode"]})
        start_day = start.astimezone(ZoneInfo("Asia/Shanghai")).date()
        series = []
        for offset in range(days):
            day = (start_day + dt.timedelta(days=offset)).isoformat()
            series.append(daily.get(day, {"day": day, "knownCostCny": 0.0, "calls": 0}))
        known = sum((row["cost_cny"] or 0) for row in rows)
        accounts = {item["provider"]: item for item in (self.deepseek_account(), self.kimi_account()) if item}
        conversations = []
        for row in rows:
            conversation_id = str(row.get("conversation_id") or "").strip()
            if not conversation_id:
                continue
            conversations.append({
                "id": row["id"], "conversationId": conversation_id,
                "title": str(row.get("conversation_title") or row["operation"] or "未命名对话"),
                "provider": row["provider"], "model": row["model"], "status": row["status"],
                "inputTokens": row["input_tokens"], "cachedInputTokens": row["cached_input_tokens"],
                "outputTokens": row["output_tokens"], "reasoningTokens": row.get("reasoning_tokens", 0),
                "costCny": row["cost_cny"], "created": row["created"],
            })
        return {"periodDays": days, "asOf": now.isoformat(), "knownCostCny": known, "calls": len(rows),
                "failed": sum(row["status"] != "success" for row in rows),
                "unpricedCalls": sum(row["cost_cny"] is None for row in rows), "providers": list(providers.values()),
                "accounts": accounts,
                "reasoningTokens": sum(row.get("reasoning_tokens", 0) for row in rows),
                "conversations": conversations[:200],
                "daily": series, "events": [{"id": row["id"], "provider": row["provider"], "service": row["service"],
                    "model": row["model"], "operation": row["operation"], "status": row["status"],
                    "inputTokens": row["input_tokens"], "cachedInputTokens": row["cached_input_tokens"],
                    "outputTokens": row["output_tokens"], "reasoningTokens": row.get("reasoning_tokens", 0),
                    "conversationId": row.get("conversation_id", ""), "conversationTitle": row.get("conversation_title", ""),
                    "billableRequests": row["billable_requests"],
                    "costCny": row["cost_cny"], "pricingNote": row["pricing_note"], "created": row["created"]} for row in rows[:100]]}


COSTS = CostMonitor()


def create_router(monitor: CostMonitor = COSTS) -> APIRouter:
    router = APIRouter()

    def authorized(request: Request) -> bool:
        expected = os.getenv("COST_DASHBOARD_TOKEN", "").strip()
        actual = request.cookies.get("mentora_cost_access", "")
        return bool(expected and actual and secrets.compare_digest(expected, actual))

    @router.get("/api/costs/access", include_in_schema=False)
    def cost_access(token: str = Query(..., min_length=24)) -> RedirectResponse:
        expected = os.getenv("COST_DASHBOARD_TOKEN", "").strip()
        if not expected or not secrets.compare_digest(expected, token):
            raise HTTPException(status_code=404, detail="Not found")
        response = RedirectResponse(url="/costs", status_code=302)
        response.set_cookie("mentora_cost_access", expected, max_age=60 * 60 * 24 * 30,
                            httponly=True, secure=True, samesite="strict", path="/")
        return response

    @router.get("/costs", include_in_schema=False)
    def cost_dashboard(request: Request) -> FileResponse:
        if not authorized(request):
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(
            Path(__file__).resolve().parent / "static" / "costs.html",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )

    @router.get("/api/costs/summary")
    def cost_summary(request: Request, days: int = Query(30, ge=1, le=365)) -> dict[str, Any]:
        if not authorized(request):
            raise HTTPException(status_code=404, detail="Not found")
        return monitor.summary(days)

    return router
