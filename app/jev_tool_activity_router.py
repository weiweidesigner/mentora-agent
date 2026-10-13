from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Callable

from typesafe_sdk import Choice, TypeSafeClient


class JevToolActivityRouterError(RuntimeError):
    pass


@dataclass(frozen=True)
class JevToolActivityDecision:
    stage: str
    confidence: float
    provider_model: str


class JevToolActivityRouter:
    """Map a concrete CLI invocation to a safe, user-facing activity stage."""

    STAGES = {
        "inspect-contract": "Read a Skill, schema, component contract, or supported CLI options before execution.",
        "inspect-environment": "Inspect files, directories, runtime availability, or project state.",
        "retrieve-market-data": "Retrieve structured prices, fundamentals, statements, calendars, or market data.",
        "retrieve-evidence": "Search or retrieve news, filings, webpages, events, or other source evidence.",
        "transform-data": "Clean, normalize, join, filter, reshape, or prepare data for analysis.",
        "calculate-metrics": "Calculate returns, growth, correlations, rankings, statistics, or derived metrics.",
        "render-chart": "Render or export a chart, table, dashboard, or standalone HTML visualization.",
        "validate-visual": "Inspect, screenshot, or validate the chart's visual result and semantic correctness.",
        "account-action": "Perform an explicitly requested account, watchlist, alert, or settings action.",
        "synthesize-answer": "Combine verified evidence and visuals into the user-facing conclusion.",
        "execute-step": "Execute a necessary step that does not fit the more specific activity stages.",
    }

    SUMMARIES = {
        "inspect-contract": "正在确认组件规范与数据契约",
        "inspect-environment": "正在确认项目与运行环境",
        "retrieve-market-data": "正在获取分析所需的市场数据",
        "retrieve-evidence": "正在检索并核对相关证据",
        "transform-data": "正在整理数据并统一分析口径",
        "calculate-metrics": "正在计算关键指标与对比关系",
        "render-chart": "正在把分析结果转换为图表",
        "validate-visual": "正在检查图表表达是否准确",
        "account-action": "正在执行你请求的账户操作",
        "synthesize-answer": "正在汇总结论与关键证据",
        "execute-step": "正在推进当前分析步骤",
    }

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
        client_factory: Callable[..., Any] = TypeSafeClient,
    ) -> None:
        self.api_key = (api_key if api_key is not None else os.getenv("TYPESAFE_API_KEY", "")).strip()
        self.model = (model if model is not None else os.getenv("TYPESAFE_MODEL", "jev-latest")).strip() or "jev-latest"
        self.timeout = timeout if timeout is not None else float(os.getenv("TYPESAFE_ACTIVITY_TIMEOUT_SECONDS", "3"))
        self.client_factory = client_factory

    @property
    def configured(self) -> bool:
        enabled = os.getenv("TYPESAFE_ACTIVITY_ROUTING_ENABLED", "true").strip().lower()
        return bool(self.api_key) and enabled not in {"0", "false", "off", "no"}

    def route(self, *, script: str, arguments: Any) -> JevToolActivityDecision:
        if not self.configured:
            raise JevToolActivityRouterError("JEV 工具活动映射未配置")
        state = {
            "script": str(script or "")[:240],
            "cli": self._safe_cli_text(arguments),
            "goal": "Map this real tool invocation to one concise user-facing activity stage.",
        }
        try:
            with self.client_factory(api_key=self.api_key, model=self.model, timeout=self.timeout) as client:
                response = client.system_one(
                    state=state,
                    questions={
                        "activity_stage": Choice(
                            instructions=(
                                "Choose the single stage that best describes the purpose of this script and its CLI arguments. "
                                "Classify the user-visible intent, not the shell mechanism. A bash command that runs a chart "
                                "renderer is render-chart; a Python transform that computes returns is calculate-metrics."
                            ),
                            criteria=self.STAGES,
                        )
                    },
                )
        except Exception as exc:
            raise JevToolActivityRouterError(f"JEV 工具活动映射失败：{exc}") from exc
        answer = response.answers.get("activity_stage")
        stage = str(getattr(answer, "choice", "") or "")
        if stage not in self.STAGES:
            raise JevToolActivityRouterError("JEV 未返回有效的工具活动阶段")
        try:
            confidence = float(getattr(answer, "confidence", 0.0) or 0.0)
        except (TypeError, ValueError):
            confidence = 0.0
        return JevToolActivityDecision(
            stage=stage,
            confidence=max(0.0, min(confidence, 1.0)),
            provider_model=str(getattr(response, "model", "") or self.model),
        )

    @classmethod
    def summary(cls, decision: JevToolActivityDecision) -> str:
        return cls.SUMMARIES.get(decision.stage, cls.SUMMARIES["execute-step"])

    @staticmethod
    def _safe_cli_text(arguments: Any) -> str:
        if isinstance(arguments, str):
            raw = arguments
        else:
            try:
                raw = json.dumps(arguments, ensure_ascii=False)
            except (TypeError, ValueError):
                raw = str(arguments or "")
        raw = re.sub(
            r"(?i)(api[_-]?key|authorization|token|cookie|secret)(\s*[=:]\s*|[\"']?\s*:\s*[\"']?)([^\s,;\"']+)",
            r"\1\2[REDACTED]",
            raw,
        )
        return raw.replace("\x00", " ")[:4000]
