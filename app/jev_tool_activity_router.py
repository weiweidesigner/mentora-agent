from __future__ import annotations

import json
import math
import os
import queue
import re
import threading
from dataclasses import dataclass
from typing import Any, Callable

from app.laya_client import Choice, LocalLayaClient


class JevToolActivityRouterError(RuntimeError):
    pass


class LayaActivityUncertain(JevToolActivityRouterError):
    pass


@dataclass(frozen=True)
class JevToolActivityDecision:
    stage: str
    confidence: float
    provider_model: str


class JevToolActivityRouter:
    """Local Laya selects activity semantics; labels are a presentation mapping."""

    STAGES = {
        "inspect-contract": "Read a Skill, schema, renderer source or CLI options to understand a component contract before execution.",
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

    EN_SUMMARIES = {
        "inspect-contract": "Checking component contracts",
        "inspect-environment": "Checking the project environment",
        "retrieve-market-data": "Retrieving market data",
        "retrieve-evidence": "Retrieving supporting evidence",
        "transform-data": "Preparing and normalizing data",
        "calculate-metrics": "Calculating key metrics",
        "render-chart": "Rendering the visualization",
        "validate-visual": "Validating the visualization",
        "account-action": "Performing the requested account action",
        "synthesize-answer": "Summarizing verified evidence",
        "execute-step": "Performing the current step",
    }

    FAMILIES = {
        "读取文件": "读取本地文件、规范、源码或检查环境。",
        "获取数据": "从外部接口获取行情数据或检索信息。",
        "生成产物": "进行计算、绘制图表或修改设置。",
    }
    WORK = {
        "analyze": "Transform data or calculate metrics.",
        "deliver": "Render a visualization, validate it or synthesize an answer.",
        "other": "Modify account settings, watchlists, alerts or perform other maintenance.",
    }
    LEAVES = {
        "inspect": ("inspect-contract", "inspect-environment"),
        "retrieve": ("retrieve-market-data", "retrieve-evidence"),
        "analyze": ("transform-data", "calculate-metrics"),
        "deliver": ("render-chart", "validate-visual", "synthesize-answer"),
        "other": ("account-action", "execute-step"),
    }

    def __init__(
        self,
        *,
        api_key: str | None = None,
        endpoint: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
        client_factory: Callable[..., Any] = LocalLayaClient,
    ) -> None:
        # Compatibility argument only. Never forward a hosted JEV key locally.
        self.api_key = str(api_key or "")
        self.endpoint = (endpoint if endpoint is not None else os.getenv("LAYA_DECISION_URL", "")).strip()
        self.model = (model if model is not None else os.getenv("LAYA_ACTIVITY_MODEL", os.getenv("LAYA_VISUAL_MODEL", "convaiinnovations/laya-multilingual"))).strip()
        self.timeout = timeout if timeout is not None else float(os.getenv("LAYA_ACTIVITY_TIMEOUT_SECONDS", "3"))
        self.client_factory = client_factory

    @property
    def configured(self) -> bool:
        enabled = os.getenv("LAYA_ACTIVITY_ROUTING_ENABLED", "true").strip().lower()
        return bool(self.endpoint) and enabled not in {"0", "false", "off", "no"}

    def route(self, *, script: str, arguments: Any) -> JevToolActivityDecision:
        if not self.configured:
            raise JevToolActivityRouterError("本地 Laya 工具活动映射未配置")
        actual = self.semantic_arguments(arguments)
        command = (actual.get('command') or actual.get('cmd') or actual) if isinstance(actual, dict) else actual
        state = {"command": self._safe_cli_text(command)[:500]}
        if not isinstance(actual, dict) or not (actual.get('command') or actual.get('cmd')):
            state['tool'] = str(script or '')[:100]
        if isinstance(actual,dict) and actual.get('__capability'):
            state['capability']=str(actual['__capability'])[:350]
        try:
            with self.client_factory(endpoint=self.endpoint, model=self.model, timeout=self.timeout) as client:
                decisions = []
                def ask(key, criteria):
                    response = client.system_one(state=state, questions={key: Choice(
                        instructions="此工具调用在做什么？",
                        criteria=criteria)})
                    answer = response.answers.get(key)
                    choice = str(getattr(answer, "choice", "") or "")
                    confidence = float(getattr(answer, "confidence", 0.0) or 0.0)
                    if choice not in criteria or not math.isfinite(confidence) or not 0 <= confidence <= 1:
                        raise ValueError("本地 Laya 工具语义决策无效")
                    decisions.append((confidence, str(getattr(response, "model", "") or self.model)))
                    return choice
                family = ask("activity_family", self.FAMILIES)
                branch = ask("activity_work", self.WORK) if family == "生成产物" else {"读取文件": "inspect", "获取数据": "retrieve"}[family]
                stage = ask("activity_stage", {key: self.STAGES[key] for key in self.LEAVES[branch]})
        except Exception as exc:
            raise JevToolActivityRouterError("本地 Laya 工具活动映射失败") from exc
        if min(item[0] for item in decisions) < 0.6:
            raise LayaActivityUncertain("本地 Laya 工具活动语义不确定")
        return JevToolActivityDecision(
            stage=stage,
            confidence=min(item[0] for item in decisions),
            provider_model=decisions[-1][1],
        )

    @classmethod
    def summary(cls, decision: JevToolActivityDecision, *, chinese: bool = True) -> str:
        labels = cls.SUMMARIES if chinese else cls.EN_SUMMARIES
        return labels.get(decision.stage, labels["execute-step"])

    @staticmethod
    def semantic_arguments(arguments):
        if isinstance(arguments, str):
            try: arguments = json.loads(arguments)
            except (TypeError, ValueError): return arguments
        if isinstance(arguments, dict):
            # Classify the invocation, not an Agent's proposed classification.
            return {key: ({'omitted':True,'characters':len(str(value))} if key in {'content','patch','widget_code','widgetCode','html'} else value)
                    for key, value in arguments.items() if key not in {
                "description", "title", "thoughtSummary", "thought_summary", "reasoning", "analysis",
            }}
        return arguments

    @staticmethod
    def _safe_cli_text(arguments: Any) -> str:
        def scrub(value):
            if isinstance(value,dict):
                return {key: '[REDACTED]' if re.search(r'api[-_]?key|authorization|token|cookie|secret|password',str(key),re.I) else scrub(item) for key,item in value.items()}
            if isinstance(value,(list,tuple)):return [scrub(item) for item in value]
            return value
        if isinstance(arguments, str):
            raw = arguments
        else:
            try:
                raw = json.dumps(scrub(arguments), ensure_ascii=False,sort_keys=True)
            except (TypeError, ValueError):
                raw = str(arguments or "")
        raw = re.sub(r'(?i)(Bearer\s+)[a-z0-9._~+/-]+',r'\1[REDACTED]',raw)
        raw = re.sub(
            r'''(?i)((?:--)?(?:api[_-]?key|authorization|token|cookie|secret|password)["']?\s*(?:=|:|\s)\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)''',
            r"\1[REDACTED]",
            raw,
        )
        return raw.replace("\x00", " ")[:4000]


class ToolActivitySession:
    """Per-run, non-blocking semantic decisions; never owns the Agent's tools."""
    def __init__(self, router, cache, guard):
        self.router=router;self.cache=cache;self.guard=guard
        self.jobs=queue.Queue(maxsize=256);self.results=queue.Queue();self.closed=threading.Event()
        self.worker=None;self.circuit_open=False

    def request(self, call_id, script, arguments):
        if not self.router.configured:
            return dict(provider='host',status='fallback',reason='laya-not-configured')
        safe=JevToolActivityRouter._safe_cli_text(JevToolActivityRouter.semantic_arguments(arguments))
        key=str(script)+'\n'+safe
        with self.guard: cached=self.cache.get(key)
        if isinstance(cached,dict): return dict(cached)
        try:self.jobs.put_nowait((call_id,key,script,arguments))
        except queue.Full:return dict(provider='host',status='fallback',reason='laya-busy')
        if self.worker is None:
            self.worker=threading.Thread(target=self._run,daemon=True,name='laya-tool-activity')
            self.worker.start()
        return dict(provider='local-laya',status='pending')

    def _run(self):
        while not self.closed.is_set():
            try: job=self.jobs.get(timeout=.2)
            except queue.Empty: continue
            if job is None:return
            call_id,key,script,arguments=job
            with self.guard: cached=self.cache.get(key)
            if isinstance(cached,dict): result=dict(cached)
            elif self.circuit_open:
                result=dict(provider='host',status='fallback',reason='laya-unavailable')
            else:
                try:
                    d=self.router.route(script=script,arguments=arguments)
                    result=dict(provider='local-laya',status='classified',stage=d.stage,
                                confidence=d.confidence,providerModel=d.provider_model,
                                confidenceKind='minimum-branch-probability',calibrated=False,labelSource='stage-label')
                    with self.guard:
                        if len(self.cache)>=256:self.cache.pop(next(iter(self.cache)))
                        self.cache[key]=dict(result)
                except LayaActivityUncertain:
                    result=dict(provider='host',status='fallback',reason='laya-uncertain')
                except Exception:
                    self.circuit_open=True
                    result=dict(provider='host',status='fallback',reason='laya-unavailable')
            if not self.closed.is_set():self.results.put((call_id,result))

    def drain(self):
        while True:
            try:yield self.results.get_nowait()
            except queue.Empty:return

    def close(self):
        self.closed.set()
