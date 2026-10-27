from __future__ import annotations

import base64
import difflib
import importlib.util
import ipaddress
import json
import os
import queue
import re
import signal
import shlex
import shutil
import subprocess
import sys
import threading
import tempfile
import time
import uuid
from dataclasses import replace
from pathlib import Path
from typing import Any, Iterator
from app.public_stream import PublicStream, WIDGET_TOOL
from app.streamviz_files import HtmlRenderEvents
from app.parallel_widgets import ParallelWidgets
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlsplit

from dotenv import load_dotenv

from app.public_text_channel import PublicTextChannelSession
from app.jev_tool_activity_router import JevToolActivityRouter, JevToolActivityRouterError, ToolActivitySession
from app.jev_visualization_router import JevVisualizationDecision, JevVisualizationRouter, JevVisualizationRouterError
from app.business_chart_dependency import load_registry_data
from app.capability_index import CapabilityIndex
from app.cost_monitor import COSTS


class ReasoningFrameworkError(RuntimeError):
    pass


class FluxImageExecutionError(ReasoningFrameworkError):
    """Keep runner diagnostics private while exposing an actionable image error."""

    def __init__(self, detail: str, *, public_detail: str = "本地图片生成失败，请重试；如持续失败，请检查生图服务。会话和进度已保留。", error_code: str = "image_generation_failed"):
        self.public_detail = public_detail
        self.error_code = error_code
        super().__init__(detail)

    @classmethod
    def from_runner(cls, detail: str):
        if "output must be an HTML file in outputs/generated" in detail:
            return cls(detail, public_detail="图片输出目录配置异常，本次尚未生成图片。请修复服务配置后重试。", error_code="image_output_configuration")
        if "Local FLUX runner not found" in detail or "Local FLUX runner is not executable" in detail:
            return cls(detail, public_detail="本地生图服务尚未就绪，请检查服务配置后重试。", error_code="image_service_unavailable")
        if "中文提示词翻译失败" in detail:
            return cls(detail, public_detail="图片提示词转换失败，请稍后重试。会话和进度已保留。", error_code="image_prompt_translation_failed")
        if "timed out after 30 minutes" in detail:
            return cls(detail, public_detail="本地图片生成超过 30 分钟，已停止。请稍后重试。", error_code="image_generation_timeout")
        if 'Mac 生图节点' in detail and '正在处理其他图片' in detail:
            return cls(detail, public_detail='本地生图节点正在处理其他图片，请稍后重试。', error_code='image_service_busy')
        if 'Mac 生图节点' in detail and any(word in detail for word in ('离线','隧道','尚未就绪')):
            return cls(detail, public_detail='无法连接 Mac 生图节点，请检查 Mac 和生图隧道后重试。', error_code='image_service_unavailable')
        if '生图' in detail and '超时' in detail:
            return cls(detail, public_detail='本地生图连接或生成超时，请稍后重试。', error_code='image_generation_timeout')
        return cls(detail)


class ReasoningFrameworkConfigurationError(ReasoningFrameworkError):
    error_code = "framework_configuration_error"

    def __init__(self, detail: str):
        self.public_detail = detail
        super().__init__(detail)


class ReasoningFrameworkTimeout(ReasoningFrameworkError):
    """An execution deadline with a safe, actionable user-facing explanation."""
    error_code = 'execution_timeout'

    def __init__(self, seconds):
        duration = f'{seconds / 60:g} 分钟' if seconds >= 60 else f'{seconds:g} 秒'
        self.public_detail = f'本轮分析达到 {duration}执行时限，已停止。会话和已完成步骤已保留，报告尚未完成。'
        super().__init__(f'DeepSeek Harness 分析达到 {seconds:g} 秒执行时限')


FRAMEWORKS = {
    "deepseek": "DeepSeek Harness",
    "codex": "Codex",
}


class LocalAgentFrameworks:
    """Adapters that normalize local agent runtimes to Mentora's SSE contract."""

    def __init__(
        self,
        *,
        project_root: Path,
        generated_dir: Path,
        visualization_router: JevVisualizationRouter | None = None,
        tool_activity_router: JevToolActivityRouter | None = None,
    ) -> None:
        self.project_root = project_root.resolve()
        self.generated_dir = generated_dir.resolve()
        self.input_dir = (self.project_root / "outputs" / "agent-inputs").resolve()
        self._deepseek_harnesses: dict[str, Any] = {}
        self._deepseek_session_locks: dict[str, threading.Lock] = {}
        self._deepseek_harness_guard = threading.Lock()
        self._codex_trace_guard = threading.Lock()
        self._active_run_guard = threading.Lock()
        self._active_codex_processes: dict[str, Any] = {}
        self._active_deepseek_runs: dict[str, str] = {}
        self._active_widget_runs = {}
        self._tool_activity_guard = threading.Lock()
        self._tool_activity_cache: dict[str, dict[str, Any]] = {}
        self._capability_index = CapabilityIndex(self.project_root)
        load_dotenv(self.project_root / ".env", override=False)
        self._visualization_router = visualization_router or JevVisualizationRouter()
        self._tool_activity_router = tool_activity_router or JevToolActivityRouter()

    def cancel(self, session_key: str) -> None:
        """Best-effort termination for a user-cancelled local agent run."""
        with self._active_run_guard:
            process = self._active_codex_processes.pop(session_key, None)
            harness_key = self._active_deepseek_runs.pop(session_key, None)
            widgets = self._active_widget_runs.pop(session_key, None)
        if widgets is not None:widgets.close()
        if process is not None and process.poll() is None:
            self._terminate_codex_process(process)
        if harness_key:
            self._drop_deepseek_harness(harness_key)

    def availability(self) -> dict[str, dict[str, Any]]:
        codex_bin = os.getenv("AICHART_CODEX_BIN", "codex")
        resolved_codex = shutil.which(codex_bin) or (codex_bin if Path(codex_bin).is_file() else "")
        codex_ready = bool(resolved_codex)
        codex_version = ""
        codex_provider = os.getenv("AICHART_CODEX_PROVIDER", "deepseek").strip().lower() or "deepseek"
        codex_credential_ready = False
        if resolved_codex:
            try:
                version_result = subprocess.run(
                    [resolved_codex, "--version"], capture_output=True, text=True, timeout=5, check=False,
                )
                codex_version = (version_result.stdout or version_result.stderr).strip()
                codex_credential_ready = self._codex_provider_ready(resolved_codex, codex_provider)
            except (OSError, subprocess.TimeoutExpired):
                pass
        self._add_deepseek_sdk_path()
        deepseek_ready = importlib.util.find_spec("deepseek_harness") is not None
        return {
            "deepseek": {
                "label": FRAMEWORKS["deepseek"],
                "available": deepseek_ready,
                "detail": "" if deepseek_ready else "需要安装 DeepSeek Harness Python SDK/Runtime",
            },
            "codex": {
                "label": FRAMEWORKS["codex"],
                "available": codex_ready,
                "installed": codex_ready,
                "credentialReady": codex_credential_ready,
                "provider": codex_provider,
                "version": codex_version,
                "detail": (
                    "" if codex_credential_ready
                    else "Codex CLI 已安装，但未配置 DEEPSEEK_API_KEY"
                    if codex_ready and codex_provider == "deepseek"
                    else "Codex CLI 已安装，但 OpenAI Provider 尚未登录" if codex_ready
                    else "未找到 codex CLI"
                ),
            },
        }

    @staticmethod
    def _codex_authenticated(resolved_codex: str) -> bool:
        try:
            result = subprocess.run(
                [resolved_codex, "login", "status"], capture_output=True, text=True, timeout=5, check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return False
        return result.returncode == 0

    @classmethod
    def _codex_provider_ready(cls, resolved_codex: str, provider: str) -> bool:
        if provider == "deepseek":
            return bool(os.getenv("DEEPSEEK_API_KEY", "").strip())
        return cls._codex_authenticated(resolved_codex)

    def inference_models(self) -> list[dict[str, Any]]:
        deepseek_model = os.getenv("AICHART_DEEPSEEK_MODEL", "deepseek-flash").strip() or "deepseek-flash"
        ollama_model = os.getenv("AICHART_OLLAMA_MODEL", "haervwe/GLM-4.6V-Flash-9B:latest").strip() or "haervwe/GLM-4.6V-Flash-9B:latest"
        try:
            local_models = self._ollama_models()
        except ReasoningFrameworkError:
            local_models = []
        return [
            {"id": deepseek_model, "name": deepseek_model, "provider": "deepseek", "available": True},
            {
                "id": ollama_model,
                "name": "GLM-4.6v-Flash (自部署)",
                "provider": "ollama",
                "available": ollama_model in local_models,
            },
        ]

    @staticmethod
    def _ollama_base_url() -> str:
        return (os.getenv("AICHART_OLLAMA_URL", "http://127.0.0.1:11434").strip() or "http://127.0.0.1:11434").rstrip("/")

    def _ollama_models(self) -> list[str]:
        request = urllib_request.Request(f"{self._ollama_base_url()}/api/tags", method="GET")
        try:
            with urllib_request.urlopen(request, timeout=2) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (OSError, urllib_error.URLError, json.JSONDecodeError) as exc:
            raise ReasoningFrameworkError("本地 Ollama 服务未启动") from exc
        models = payload.get("models") if isinstance(payload, dict) else []
        return [str(item.get("name") or "").strip() for item in models if isinstance(item, dict) and item.get("name")]

    @staticmethod
    def _dsh_bin() -> str:
        configured = os.getenv("DSH_BIN", "").strip()
        if configured and (shutil.which(configured) or Path(configured).expanduser().is_file()):
            return str(Path(configured).expanduser()) if Path(configured).expanduser().is_file() else configured
        installed = shutil.which("dsh")
        if installed:
            return installed
        lobster_root = Path.home() / "Library" / "Application Support" / "LobsterAI" / "dsh-runtime"
        candidates = sorted(lobster_root.glob("*/lib/bin.js"), reverse=True) if lobster_root.is_dir() else []
        return str(candidates[0]) if candidates else ""

    @staticmethod
    def _add_deepseek_sdk_path() -> None:
        source_path = os.getenv("AICHART_DEEPSEEK_SDK_PATH", "").strip()
        if not source_path:
            return
        resolved = str(Path(source_path).expanduser().resolve())
        if resolved not in sys.path:
            sys.path.insert(0, resolved)

    def stream(
        self,
        framework: str,
        question: str,
        images: list[Any],
        *,
        session_key: str,
        engine_session_id: str = "",
        history: list[dict[str, Any]] | None = None,
        inference_model: str = "",
        reasoning_effort: str = "",
        resolved_inference_model: str = "",
        visualization_theme: str = "light",
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        # Start the general agent directly. Choosing renderers before the agent
        # sees the evidence (including uploaded images) both blocks its first
        # event and prematurely constrains its plan. The agent discovers chart
        # skills when needed; theme requirements do not require inference.
        visualization_guidance = self._theme_visualization_guidance(visualization_theme)
        if framework == "codex":
            events = self._stream_codex(
                question, images, session_key, engine_session_id, history or [], inference_model,
                reasoning_effort=reasoning_effort,
                visualization_guidance=visualization_guidance,
            )
            yield from events
            return
        if framework == "deepseek":
            events = self._stream_deepseek(
                question, images, session_key, engine_session_id, history or [], inference_model,
                reasoning_effort=reasoning_effort,
                visualization_guidance=visualization_guidance,
            )
            yield from events
            return
        raise ReasoningFrameworkError(f"不支持的推理框架：{framework}")

    @staticmethod
    def _requires_visual_semantic_routing(question: str) -> bool:
        text = str(question or "").lower()
        visual_terms = (
            "图表", "可视化", "走势图", "趋势图", "k线", "k 线", "分时图", "柱状图",
            "折线图", "饼图", "散点图", "热力图", "流程图", "时间线", "地图", "画图",
            "绘图", "看板", "仪表盘", "dashboard", "visualization", "chart", "plot", "graph",
        )
        return any(term in text for term in visual_terms)

    @staticmethod
    def _theme_visualization_guidance(theme: str) -> str:
        mode = "深色" if theme == "dark" else "浅色"
        return (
            f"当前预览为{mode}主题，但生成的 StreamViz/HTML 必须同时支持浅色和深色切换。"
            f"调用已有业务组件时，支持主题参数的脚本传 --theme {theme}；支持语言参数的脚本必须按用户问句传 --language（简体 zh-CN、繁体 zh-Hant、英文 en），显式输出语言要求优先。图表标题、指标、周期、图例和悬浮提示均使用相同语言，不能因美股而默认英文。"
            "主题由 StreamViz 统一管理，只生成一份内容，禁止按当前模式写死深色或浅色配色。"
            "根背景透明；卡片背景使用 var(--sv-surface-primary)，次级表面使用 var(--sv-surface-secondary)，"
            "正文、标题、数值使用 var(--sv-text-primary)，说明、图例、坐标轴使用 var(--sv-text-secondary)，"
            "边框、网格线使用 var(--sv-border-subtle)，系列使用 var(--sv-chart-series-1/2/3)。"
            "SVG fill/stroke 也必须使用主题变量；不要另定义带固定颜色的 --c-* 或其他私有主题。"
            "金融涨跌必须使用 var(--sv-price-up)、var(--sv-price-down)、var(--sv-price-flat)，禁止使用 success/danger 状态色表示收益。"
            "每个金融图表区域声明 data-financial-market=\"CN\"、\"HK\" 或 \"US\"：A股/港股红涨绿跌，美股绿涨红跌。混合市场必须分区域声明。"
            "暗夜主题使用中性炭黑表面和灰色边框，禁止旧蓝灰色卡片；不要私设固定配色。"
            "涨跌方向必须绑定到实际数值：自定义 HTML 用 data-sv-direction=up/down/flat；模板传 financialMarket 及 change 或 direction。"
            "排行、指标和涨跌幅表格同样遵守涨跌语义，零值中性；参与率、占比、置信度等普通百分比不能自动视为上涨。"
        )

    @staticmethod
    def _with_visual_route_metadata(
        events: Iterator[tuple[str, dict[str, Any]]],
        route: dict[str, Any] | None,
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        for event, data in events:
            if event == "final" and route is not None:
                data["visualRoute"] = route
                if route.get("applied"):
                    data.setdefault("status", []).insert(0, "JEV 已应用可视化语义规划")
            yield event, data

    def _tool_activity_arguments(self, arguments: Any) -> Any:
        """Enrich invocations with registered facts, never Agent-proposed titles."""
        actual = JevToolActivityRouter.semantic_arguments(arguments)
        if not isinstance(actual, dict):
            return actual
        actual = {key: value for key, value in actual.items() if key != '__capability'}
        try:
            tokens = shlex.split(str(actual.get('command') or actual.get('cmd') or ''))
            scripts = {Path(tokens[i + 1]).name for i, token in enumerate(tokens[:-1]) if token == '--script'}
            scripts.update(Path(token.split('=', 1)[1]).name for token in tokens if token.startswith('--script='))
            if scripts:
                registry = load_registry_data(self.project_root / 'app' / 'module_registry.json')
                descriptions = [str(item.get('label') or '') + ': ' + re.split(r'[。\n]', str(item.get('description') or ''), maxsplit=1)[0]
                                for item in registry if isinstance(item, dict) and Path(str(item.get('script') or '')).name in scripts]
                if descriptions:
                    actual['__capability'] = '\n'.join(descriptions)[:700]
        except (OSError, ValueError, TypeError):
            pass
        return actual

    def _visualization_candidates(self) -> list[dict[str, str]]:
        registry_path = self.project_root / "app" / "module_registry.json"
        try:
            registry = load_registry_data(registry_path)
        except (OSError, json.JSONDecodeError):
            return []
        if not isinstance(registry, list):
            return []
        skill_dirs = {
            "business-chart": self.project_root / "app" / "skills" / "business-chart-recall" / "scripts",
            "generic-chart": self.project_root / "app" / "skills" / "generic-chart" / "scripts",
        }
        non_visual = {"about_company.py", "executive_profile.py", "related_section.py"}
        family_by_script: dict[str, str] = {}
        for family, directory in skill_dirs.items():
            if directory.is_dir():
                family_by_script.update(
                    {path.name: family for path in directory.glob("*.py") if path.name not in non_visual}
                )
        tradingview_dir = self.project_root / "app" / "skills" / "trading-view-chart" / "scripts"
        if tradingview_dir.is_dir():
            family_by_script.update({path.name: "generic-chart" for path in tradingview_dir.glob("*.py")})
        candidates: list[dict[str, str]] = []
        for item in registry:
            if not isinstance(item, dict):
                continue
            script = Path(str(item.get("script") or "")).name
            family = family_by_script.get(script)
            if not family:
                continue
            skill_name = "trading-view-chart" if script == "trading_view_chart.py" else ("business-chart-recall" if family == "business-chart" else "generic-chart")
            schema_path = (
                self.project_root / "app" / "skills" / skill_name / "schemas" / f"{Path(script).stem}.schema.json"
            )
            semantic_contract = ""
            try:
                schema = json.loads(schema_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                schema = None
            if isinstance(schema, dict):
                channels = schema.get("semanticChannels") or schema.get("visualChannelMappings") or []
                if isinstance(channels, list):
                    semantic_contract = "; ".join(
                        str(channel.get("semantics") or channel.get("semantic") or channel.get("channel") or "")
                        for channel in channels[:6] if isinstance(channel, dict)
                    )[:220]
                elif isinstance(channels, dict):
                    semantic_contract = "; ".join(f"{key}:{value}" for key, value in channels.items())[:220]
            # JEV receives this catalog in both criteria and state. Payload/CLI
            # contracts belong in the subsequent skill read, not twice in routing.
            purpose = schema.get("purpose") if isinstance(schema, dict) else ""
            description = str(purpose or item.get("description") or "")[:140]
            if semantic_contract:
                description = f"{description} schema semantics={semantic_contract}"
            candidates.append({
                "script": script,
                "family": family,
                "label": str(item.get("label") or script),
                "description": description,
            })
        return candidates

    def _jev_visualization_plan(self, question: str) -> tuple[str, dict[str, Any] | None]:
        router = self._visualization_router
        candidates = self._visualization_candidates()
        if not router.configured or len(candidates) <= 1:
            return "", None
        try:
            decision = router.route(question=question, candidates=candidates)
        except JevVisualizationRouterError as exc:
            return "", {
                "applied": False,
                "fallback": "agent-selection",
                "error": str(exc),
                "candidateCount": len(candidates),
            }
        decision, strategy_source = self._apply_mark_strategy_backstop(question, decision)
        metadata = self._visualization_route_metadata(decision)
        if strategy_source:
            metadata["markStrategySource"] = strategy_source
        return self._visualization_guidance(decision), metadata

    @staticmethod
    def _apply_mark_strategy_backstop(
        question: str, decision: JevVisualizationDecision
    ) -> tuple[JevVisualizationDecision, str]:
        """Make quantitative polarity a deterministic semantic rule, not an LLM preference."""
        selected = {Path(script).name for script in decision.selected_scripts}
        signed_bar_scripts = {"bar_chart.py", "bar_line.py", "waterfall.py"}
        distribution_bar_scripts = {"bar_chart.py", "grouped_bar.py"}
        semantic_text = str(question or "").lower()
        signed_terms = (
            "涨跌", "漲跌", "涨幅", "漲幅", "跌幅", "收益率", "回报率", "回報率",
            "增速", "增长率", "增長率", "变化", "變化", "变动", "變動", "盈亏", "盈虧",
            "return", "change", "growth", "delta", "p&l", "profit/loss", "gain", "loss",
        )
        distribution_terms = (
            "分布", "频次", "頻次", "频率", "頻率", "直方图", "直方圖", "区间", "區間",
            "distribution", "histogram", "frequency", "bins", "binning",
        )
        has_signed_semantics = any(term in semantic_text for term in signed_terms)
        is_distribution = has_signed_semantics and any(term in semantic_text for term in distribution_terms)
        if selected.intersection(distribution_bar_scripts) and is_distribution:
            if decision.mark_strategy != "distribution-polarity":
                return replace(
                    decision,
                    mark_strategy="distribution-polarity",
                    mark_strategy_confidence=max(decision.mark_strategy_confidence, 0.82),
                ), "signed-distribution-semantic-backstop"
        elif (
            "grouped_bar.py" in selected
            and not selected.intersection(signed_bar_scripts)
            and decision.mark_strategy == "signed-direction"
        ):
            return replace(
                decision,
                mark_strategy="no-mark",
                mark_strategy_confidence=max(decision.mark_strategy_confidence, 0.8),
            ), "grouped-series-color-preservation"
        elif (
            selected.intersection(signed_bar_scripts)
            and has_signed_semantics
            and decision.mark_strategy == "no-mark"
        ):
            return replace(
                decision,
                mark_strategy="signed-direction",
                mark_strategy_confidence=max(decision.mark_strategy_confidence, 0.75),
            ), "signed-bar-semantic-backstop"
        return decision, ""

    @staticmethod
    def _visualization_route_metadata(decision: JevVisualizationDecision) -> dict[str, Any]:
        return {
            "applied": True,
            "provider": "local-laya",
            "providerModel": decision.provider_model,
            "primary": decision.primary_script,
            "supporting": decision.supporting_script,
            "selectedScripts": list(decision.selected_scripts),
            "primaryConfidence": decision.primary_confidence,
            "supportingConfidence": decision.supporting_confidence,
            "semanticLens": decision.semantic_lens,
            "semanticLensConfidence": decision.semantic_lens_confidence,
            "primaryPurpose": decision.primary_purpose,
            "supportingPurpose": decision.supporting_purpose,
            "visualEncoding": decision.visual_encoding,
            "visualEncodingConfidence": decision.visual_encoding_confidence,
            "evidenceStrategy": decision.evidence_strategy,
            "evidenceStrategyConfidence": decision.evidence_strategy_confidence,
            "markStrategy": decision.mark_strategy,
            "markStrategyConfidence": decision.mark_strategy_confidence,
            "mobileColumns": decision.mobile_columns,
            "candidateCount": decision.candidate_count,
        }

    @staticmethod
    def _visualization_guidance(decision: JevVisualizationDecision) -> str:
        if not decision.primary_script:
            return (
                "Laya 可视化语义计划：本次请求不应为了形式强制生成图表。"
                "若后续取得的新证据表明图表确有必要，仍须按真实数据和 Skill schema 决定。"
            )
        lens = JevVisualizationRouter.SEMANTIC_LENSES.get(
            decision.semantic_lens, JevVisualizationRouter.SEMANTIC_LENSES["evidence-led"]
        )
        encoding = JevVisualizationRouter.VISUAL_ENCODINGS.get(
            decision.visual_encoding, JevVisualizationRouter.VISUAL_ENCODINGS["latest-vs-history"]
        )
        evidence = JevVisualizationRouter.EVIDENCE_STRATEGIES.get(
            decision.evidence_strategy, JevVisualizationRouter.EVIDENCE_STRATEGIES["structured-data-first"]
        )
        mark_strategy = JevVisualizationRouter.MARK_STRATEGIES.get(
            decision.mark_strategy, JevVisualizationRouter.MARK_STRATEGIES["no-mark"]
        )
        lines = [
            "Laya 可视化语义计划（这是组件与叙事约束，不是数据证据）：",
            f"- 主图：{decision.primary_script}；回答维度：{decision.primary_purpose or '用户问题的核心判断'}。",
        ]
        if any(Path(script).name in {"multi_intraday.py", "multi_kline.py"} for script in decision.selected_scripts):
            lines.append(f"- 多图比较移动端采用每行 {decision.mobile_columns} 张卡片的换行网格，CLI 必须传 --mobile-columns {decision.mobile_columns}；不要改成股票 tab 或横向分页。")
        if decision.supporting_script:
            lines.append(
                f"- 辅助图：{decision.supporting_script}；补充维度："
                f"{decision.supporting_purpose or '与主图不同的第二个关键问题'}。"
            )
        lines.extend([
            f"- 叙事镜头：{decision.semantic_lens} — {lens}",
            f"- 可视化编码：{decision.visual_encoding} — {encoding}",
            f"- 证据编排：{decision.evidence_strategy} — {evidence}",
            f"- 标记策略：{decision.mark_strategy} — {mark_strategy}",
            "- 金融方向配色必须从用户问题和数据源市场传递到每个图表 payload 的 financialMarket：A股=CN、港股=HK、美股=US；即使图名只写全市场或日期，也不能省略。CN/HK 红涨绿跌，US 绿涨红跌。市场不明或混合时不得猜测，应保留中性/系列配色。",
            "- 只有在真实数据能唯一解析标记目标时才生成 marks；无法解析的日期、系列、分类、阈值或范围必须跳过，禁止猜测。",
            "- 自动模式通常保留 1–3 个关键标记并以 5 个为软默认上限；用户明确指定数量或要求全部事件时必须完整保留，并通过标签密度或交互处理拥挤。",
            "- 美股/美国上市标的优先保留业务图表的内置取数、指标口径、交互与展示逻辑；端内新闻和视频用于补充催化剂、市场叙事与观点，不得替代结构化业务证据。",
            "- 先读取对应 Skill、schema 与 CLI；只有取得真实且口径匹配的数据后才生成图表，不得伪造数据。",
            "- 正文先给结论，再用具体数据解释图中的变化、差异、构成、风险或拐点；每张图只支撑一个明确判断。",
            "- 每个 [[AIME_CHART:...]] 必须在对应解读段落之后立即单独输出，让图文按正文顺序逐段出现；不要等全文完成或数据口径段落之后集中追加图表。辅助图不得重复主图信息。",
            "- 中间分析产物不等于最终展示图。只引用实际支撑最终判断的图表；未在正文引用的图表不会自动展示，不得为填充页面而追加。",
            "- 最终形成图文一体的回答：图表提供可视证据，文字说明洞察、因果边界、时间口径和风险。",
        ])
        if "kline.py" in decision.selected_scripts:
            lines.extend([
                "- K线标记统一交给本地 Laya：先使用 business-chart-recall/kline.py 已取到的真实 OHLCV payload，再运行 python app/jev_kline_annotations.py --payload <行情payload> --question <原问句> --output <含标记payload>。",
                "- 原生标记 v2：先读 kline.py --schema 的 annotationContract 或 python app/jev_kline_annotations.py --catalog；JEV 已知线/通道/干草叉/斐波那契/几何形状/测量/多空情景/笔记与表情的锚点和样式。严格按原生类型及线型、填充、levels 等白名单生成，不写外部覆盖层；未支持的江恩、模拟未来K线、分价成交量等不得伪装成已支持。",
                "- 默认使用 native-v2-auto，不再沿用只生成旧水平线和气泡的候选集。普通走势/技术分析无需用户点名标记类型：将真实 OHLCV 交给 JEV 自动生成并评估适用的趋势线、通道、回撤和区间等原生候选；已有 props.annotations 只作补充，不能挡住新候选。允许 no-mark，不为凑类型强画；在结果中核对 candidateTypes/selectedTypes，不能把支持目录冒充实际选用。",
                "- 标记集合由证据分析产生 props.annotations，再交 JEV 校验与选择；需要任意几何或仓位情景时必须先给出有证据的锚点。用户指定集合传 --selection-mode user-specified，要求全部传 --selection-mode all，不得按自动3点限额截断；必须说明 rejected/warning，缺失日期不能吸附到最近K线。",
                "- 用户指定 W/M、双底等形态时，分析阶段识别真实拐点并构建有证据的原生 polyline/path 候选，将完整结构交 JEV 审选，不能用几条水平线冒充形态。带 annotations 的 kline.py 通过 skill_runner 执行时必须使用含真实 jevAnnotationPlan 回执的 --payload；标题使用模型生成的 --title 或 component.title。",
                "- 使用 Laya 输出 payload 调用原生 kline.py 渲染；不得手写猜测价位、在正文模型中生成坐标，或用通用 mark 替换原生 annotations。Laya 负责证据校验、选点、周期绑定和配色；原生组件负责避碰、绘制和触摸交互。",
            ])
        if decision.mark_strategy == "signed-direction":
            lines.extend([
                "- 单系列柱状图或柱折图按方向着色：正值 var(--sv-price-up)、负值 var(--sv-price-down)、零值 #94a3b8；禁止把正负硬编码为固定红绿。",
                "- 必须在图表 payload 中传 financialMarket，并写入 visualStyle.markStrategy=signed-direction 及 >0、<0、=0 三条语义 colorRules；遵守所选脚本 schema 的 payload/style 参数，不传不存在的 CLI 参数。",
                "- 如果最终数据包含多个并列系列，停止正负重着色并保留系列色与图例映射；以零轴位置表达正负。用户明确指定的颜色规则优先。",
            ])
        elif decision.mark_strategy == "distribution-polarity":
            lines.extend([
                "- 强制执行：分布图按 X 轴区间判断正负，而不是按柱高判断；单系列可按正负着色，多系列分组分布必须保留系列颜色，并用 0 分界线表达极性。",
                "- 必须在图表 payload 中传 financialMarket，并通过 visualStyle.distributionColor 传递极性规则；正区间使用 var(--sv-price-up)，负区间使用 var(--sv-price-down)，平盘使用中性色。遵守所选脚本 schema 的 payload/style 参数，不传不存在的 CLI 参数。",
            ])
        return "\n".join(lines)

    @staticmethod
    def is_flux_image_request(question: str, images: list[Any]) -> bool:
        """Route explicit new artwork requests, not charts or image edits."""
        text = str(question or "").strip()
        # A generic "生成一…" must not hijack document/report requests into
        # the image generator. Explicit artwork requests below still route.
        if re.search(r'(?:生成|制作|创作|写|create|generate|build).{0,24}(?:html|网页|文档|报告)', text, re.I):
            return False
        if re.search(
            r"K\s*线|走势图|图表|折线图|柱状图|饼图|财报|股价|股票|数据可视化"
            r"|\b(?:flowchart|diagram|chart|graph)\b",
            text, flags=re.I,
        ):
            return False
        if images:
            return len(images) == 1 and bool(re.search(
                r"图生图|重绘|改图|"
                r"^(?:(?:请|帮我|给我|麻烦|能不能|可以|请你)\s*){0,2}"
                r"(?:画|绘制|绘|生成|创作|制作).{0,24}"
                r"(?:这个|这种|该|同样|相同|类似|一样的)(?:\s*图片)?\s*(?:风格|画风|样式)|"
                r"^(?:(?:请|帮我|给我|麻烦|能不能|可以|请你)\s*){0,2}"
                r"(?:把|将|让|用|按|照|基于|参考).{0,45}"
                r"(?:改|变|生成|制作|画|绘|重绘|卡通化|风格化)|"
                r"\b(?:img2img|image.to.image|edit|modify|transform|restyle|redraw)\b|"
                r"^(?:please\s+)?(?:turn|convert|make|generate|create|stylize)\b"
                r".{0,100}\b(?:image|photo|picture|illustration|cartoon|painting)\b|"
                r"\b(?:based on|using|from) this (?:image|photo|picture)\b",
                text, flags=re.I,
            ))
        if re.search(
            r"^(?:(?:请|帮我|给我|麻烦|能不能|可以|请你)\s*){0,2}"
            r"(?:画|绘制|生成|创作|制作)(?:一|张|幅|个|只|位|出|幅画|图片|图像|插画|照片)"
            r"|(?:生成|创作|制作).{0,16}(?:图片|图像|插画|海报|照片|壁纸)"
            r"|(?:draw|paint|generate|create).{0,32}(?:image|picture|illustration|portrait|artwork|photo)",
            text, flags=re.I,
        ):
            return True
        # Image tools commonly receive a scene description without an imperative.
        # Require several visual-production cues to avoid hijacking ordinary prose.
        if len(text) < 80 or "?" in text or "？" in text:
            return False
        visual_cues = re.findall(
            r"\b(?:cinematic|photograph(?:y|ic)?|photo|illustration|painting|portrait|"
            r"composition|lighting|photorealistic|ultra[- ]?detailed|[48]k)\b",
            text, flags=re.I,
        )
        chinese_visual_cues = re.findall(
            r"电影级构图|构图|光影|光线|插画|绘画|摄影|画面|风格|氛围|美学|"
            r"写实|高清|超细节|渲染|唯美|色调|镜头|[48][Kk]",
            text,
        )
        return len(visual_cues) + len(chinese_visual_cues) >= 2

    @staticmethod
    def _flux_process(command, *, cwd, env):
        """Keep the public stream alive without exposing subprocess diagnostics."""
        progress_dir=tempfile.TemporaryDirectory(prefix='mentora-flux-progress-')
        progress_file=Path(progress_dir.name)/'progress.json'
        try:process=subprocess.Popen(command,cwd=cwd,env=dict(env,MENTORA_FLUX_PROGRESS_FILE=str(progress_file)),stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
        except BaseException:
            progress_dir.cleanup();raise
        started=time.monotonic()
        last_state=None;last_notice=-10
        try:
            while True:
                remaining=1800-(time.monotonic()-started)
                if remaining<=0:raise subprocess.TimeoutExpired(command,1800)
                try:
                    stdout,stderr=process.communicate(timeout=min(.5,remaining))
                    yield subprocess.CompletedProcess(command,process.returncode,stdout,stderr)
                    return
                except subprocess.TimeoutExpired:
                    seconds=int(time.monotonic()-started)
                    state=None
                    try:
                        candidate=json.loads(progress_file.read_text())
                        if candidate.get('phase') in {'flux-model','flux-denoise','flux-decode','flux-transfer'} and type(candidate.get('progressPct')) in (int,float) and 0<=candidate['progressPct']<=100:
                            state={k:candidate[k] for k in ('phase','message','progressPct','completedSteps','totalSteps','progressKind') if k in candidate}
                    except (OSError,ValueError,TypeError,AttributeError):pass
                    if state and state!=last_state:
                        last_state=state;last_notice=seconds
                        yield dict(state,lang='zh-CN')
                    elif seconds-last_notice>=10:
                        last_notice=seconds
                        yield dict(last_state or {'message':'正在准备绘图指令，等待模型就绪','phase':'flux-wait'},lang='zh-CN')
        finally:
            if process.poll() is None:
                LocalAgentFrameworks._terminate_codex_process(process)
                try:process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    try:os.killpg(process.pid,signal.SIGKILL)
                    except ProcessLookupError:pass
                    process.wait()
            progress_dir.cleanup()

    def stream_flux_image(
        self,
        framework: str,
        question: str,
        *,
        images: list[Any] | None = None,
        engine_session_id: str = "",
        inference_model: str = "",
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        """Execute the project Skill outside the reasoning agent's tool sandbox."""
        if framework not in FRAMEWORKS:
            raise ReasoningFrameworkError(f"不支持的推理框架：{framework}")
        script = self.project_root / "app/skills/flux-image/scripts/generate_image.py"
        if not script.is_file():
            raise FluxImageExecutionError("flux-image Skill 脚本不存在", public_detail="本地生图组件未安装完整，请修复服务配置后重试。", error_code="image_service_unavailable")
        try:
            self.generated_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise FluxImageExecutionError("无法准备 FLUX 输出目录", public_detail="无法准备图片输出目录，请检查服务存储配置后重试。", error_code="image_output_configuration") from exc
        output = self.generated_dir / f"flux-{uuid.uuid4().hex}.html"
        run_id = f"flux-{uuid.uuid4().hex}"
        input_paths = self._save_images(framework, run_id, images or []) if images else []
        if images and len(input_paths) != 1:
            raise FluxImageExecutionError("图生图需要一张有效的上传图片", public_detail="图生图需要一张有效的上传图片，请检查附件后重试。", error_code="image_input_invalid")
        command = [sys.executable, str(script), "--prompt", question, "--output", str(output)]
        if input_paths:
            command.extend(["--input-image", str(input_paths[0])])
        yield "status", {"message": "正在检查本地 FLUX.2 生图服务", "phase": "flux-connect", "lang": "zh-CN"}
        yield "agent_event", {
            "engine": FRAMEWORKS[framework], "agent": "FLUX.2 [klein] 4B", "phase": "run", "status": "started",
            "runId": run_id, "message": "本地绘画 Skill 开始生成图片", "lang": "zh-CN",
        }
        started_ns = time.time_ns()
        child_env = os.environ.copy()
        # The deployment's .env may still name a former checkout. The caller
        # owns this invocation's root; preserve all explicit runner settings.
        child_env["AICHART_PROJECT_ROOT"] = str(self.project_root)
        if inference_model.strip():
            child_env["AICHART_FLUX_SELECTED_MODEL"] = inference_model.strip()
        if Path(child_env.get('AICHART_FLUX_RUNNER','')).name=='flux_remote_runner.py':
            endpoint=child_env.get('MENTORA_FLUX_URL','http://127.0.0.1:18766').rstrip('/')
            try:
                with urllib_request.urlopen(endpoint+'/health',timeout=5) as response:health=json.load(response)
                if not isinstance(health,dict) or not health.get('ready'):raise FluxImageExecutionError.from_runner('Mac 生图节点尚未就绪')
                if health.get('busy'):raise FluxImageExecutionError.from_runner('Mac 生图节点正在处理其他图片')
            except (OSError,ValueError) as exc:
                raise FluxImageExecutionError.from_runner('Mac 生图节点离线或隧道超时') from exc
        yield 'status',{'message':'正在准备绘图指令','phase':'flux-prepare','lang':'zh-CN'}
        try:
            result=None
            for event in self._flux_process(command,cwd=self.project_root,env=child_env):
                if isinstance(event,dict):yield 'status',event
                else:result=event
            if result is None:raise OSError('FLUX process returned no result')
        except subprocess.TimeoutExpired as exc:
            raise FluxImageExecutionError.from_runner("Local FLUX generation timed out after 30 minutes") from exc
        except OSError as exc:
            raise FluxImageExecutionError(f"无法启动本地 FLUX 生图：{exc}", public_detail="未能启动本地生图组件，请检查服务配置后重试。", error_code="image_service_unavailable") from exc
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()[-1200:] or "未返回错误详情"
            raise FluxImageExecutionError.from_runner(f"本地 FLUX 生图失败：{detail}")
        image = output.with_suffix(".png")
        fresh_files = all(
            path.is_file() and path.stat().st_size > 0 and path.stat().st_mtime_ns >= started_ns
            for path in (output, image)
        )
        if fresh_files:
            with image.open("rb") as handle:
                fresh_files = handle.read(8) == b"\x89PNG\r\n\x1a\n"
        if not fresh_files:
            raise FluxImageExecutionError("flux-image 未生成本次请求的新 PNG 和 HTML，不能标记为完成", public_detail="未收到本次生成的完整图片结果，不能标记为成功。请重试。", error_code="image_result_incomplete")
        answer = f"[[AIME_CHART:{output}]]\n[[AIME_SKILLS:flux-image]]"
        payload = self._artifact_payload(
            framework, question, answer, run_id, engine_session_id,
            inference_model=inference_model,
        )
        payload["reportArtifacts"][0]["imageUrl"] = f"/generated/{image.name}"
        payload["selectedSkill"]["reason"] = "Mentora 直接执行并验证了本地 flux-image Skill。"
        payload["status"] = ["FLUX.2 [klein] 4B 已生成图片"]
        yield "agent_event", {
            "engine": FRAMEWORKS[framework], "agent": "FLUX.2 [klein] 4B", "phase": "run", "status": "completed",
            "runId": run_id, "message": "本地图片已生成并验证", "lang": "zh-CN",
        }
        yield "final", payload

    def _save_images(self, framework: str, session_key: str, images: list[Any]) -> list[Path]:
        safe_session = re.sub(r"[^A-Za-z0-9_.-]+", "-", session_key).strip("-") or str(int(time.time()))
        output_dir = self.input_dir / framework / safe_session
        paths: list[Path] = []
        for index, image in enumerate(images[:6], start=1):
            data_url = str(getattr(image, "dataUrl", "") or "")
            match = re.match(r"^data:([^;,]+);base64,(.+)$", data_url, flags=re.S)
            if not match:
                continue
            mime, encoded = match.groups()
            suffix = {"image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}.get(mime.lower(), ".png")
            raw_name = Path(str(getattr(image, "name", "") or f"image-{index}{suffix}")).name
            safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(raw_name).stem) or f"image-{index}"
            output_dir.mkdir(parents=True, exist_ok=True)
            path = output_dir / f"{safe_stem}{suffix}"
            try:
                path.write_bytes(base64.b64decode(encoded, validate=True))
            except (ValueError, OSError):
                continue
            paths.append(path.resolve())
        return paths

    def _prompt(
        self,
        framework: str,
        question: str,
        image_paths: list[Path],
        history: list[dict[str, Any]],
        visualization_guidance: str = "",
    ) -> str:
        image_note = ""
        if image_paths:
            image_note = "\n\n用户上传的图片路径：\n" + "\n".join(f"- {path}" for path in image_paths)
        history_lines: list[str] = []
        previous_artifacts: list[str] = []
        for item in history[-8:]:
            role = "用户" if item.get("role") == "user" else "助手"
            text = str(item.get("text") or item.get("interpretation") or "").strip()
            if text:
                history_lines.append(f"{role}：{text[:4000]}")
            for artifact in item.get("reportArtifacts") or []:
                if not isinstance(artifact, dict):
                    continue
                raw_path = str(artifact.get("path") or "").strip()
                if not raw_path:
                    continue
                try:
                    path = Path(raw_path).expanduser().resolve()
                except (OSError, RuntimeError):
                    continue
                if path.is_file() and self.generated_dir in path.parents:
                    value = str(path)
                    if value not in previous_artifacts:
                        previous_artifacts.append(value)
        history_note = "\n\n此前对话摘要：\n" + "\n".join(history_lines) if history_lines else ""
        artifact_note = ""
        if previous_artifacts:
            artifact_note = (
                "\n\n此前对话已生成的可复用产物：\n"
                + "\n".join(f"- {path}" for path in previous_artifacts[-3:])
                + "\n若用户是在检查、修正或补充上一轮结果，直接读取并增量修改对应产物；"
                  "保留仍然正确的研究和版式，不要从头重做。"
            )
        guidance_note = f"\n\n{visualization_guidance}" if visualization_guidance else ""
        capability_note = "" if image_paths else self._capability_index.shortlist(question).render()
        return (f"""用户请求：
{question}{image_note}{history_note}{artifact_note}

你是 Mentora 的金融研究与可视化智能体，当前推理框架是 {FRAMEWORKS[framework]}。
计划、取数检查、契约读取和执行过程属于公开进度说明，不是正式答案；有消息通道时使用 commentary。正式答案以有依据的结论和解读为主，不复述这些执行日志，也不要为凑交互增加工具或重复段落。内部推理保持私有。DeepSeek 提供原生 visualize_show_widget 工具；需要 StreamViz 时在本轮工具循环中使用它，基于已核实数据生成 HTML/SVG，不要等待最终回答后启动第二轮模型。原生工具优先传 title 和 brief（完整的已验证事实、布局、单位、来源与结论），让独立的 HTML 渲染任务并行生成；主 Agent 收到 rendering 回执后立即继续撰写自己的正文，不等待、不轮询、不重复生成 HTML。宿主缓冲这部分真实正文增量，待 HTML 验证保存后按顺序释放并附上下载文件；pending 回执不代表生成成功，禁止仅凭它声称文件完成。原生工具只接收 title 和 brief，不要自行写 widget_code。精确保留已有 HTML 时可使用 render_streamviz.py 的 html 输入。让展示与正文自然交错：在需要可视化的位置，先输出有依据的正文引入或解读，再调用 visualize_show_widget；调用开始即在该位置增量展示，完成后继续后续正文。不要把整个展示延迟到最终回答之后；widget_code 和内部脚本仅放在工具参数中，不能作为正文或代码块输出。需要 HTML 报告时也优先使用该原生工具，不要先写 Python/JSON 包装完整 html 再调用渲染脚本，这会失去模型生成期间的增量。已有结构化 payload 或需要脚本的页面仍可使用 render_streamviz.py；它发送真实渲染事件，普通组件的完整 HTML 不伪装成逐字生成。
Yahoo 取数工具已由用户移除。禁止调用 yahoo-data、yfinance 或 Yahoo 行情/财务接口，包括临时代码和组件回退；历史会话中的 Yahoo 命令不得复用。使用现有其他数据源；无匹配数据时明确说明限制，不得编造或替换标的。 该禁用策略不是本轮取数失败的原因。数据缺口必须依据本轮真实工具回执说明已尝试来源及实际失败原因；不得把工具移除、内部配置或未发生的请求写成市场数据缺失的原因。
请直接完成用户任务，而不是解释如何完成。宿主会根据本轮语义提供少量候选 Skill 和组件；它们只是检索结果，你仍负责选择、组合或放弃。优先阅读所选候选的契约并执行；只有候选明显不足时才扩展检索 .agents/skills，禁止为了发现工具而扫描全部目录。不要用临时代码替代已有 Skill。
用户明确要求创意图片或插画时，选择 flux-image Skill；它生成的是插画，不要将其当作数据图表或金融事实证据。仅生图任务无需执行金融研究链路。
联网搜索使用 external-search 的通用路由：默认 Tavily，失败时自动切换 Serper；只有用户明确要求 Kimi 或 Agent 根据任务明确选择该来源时才使用 Kimi。internal-search 仍是 AInvest 站内文章搜索；结构化行情和用户指定 URL 的读取使用各自工具。保留实际 provider 和 fallback_attempts，不得伪装搜索成功。
所有网络发现、网页读取和远程数据请求必须通过匹配的项目 Skill 执行。禁止编写临时 Python/Node 网络脚本，禁止直接使用 curl、wget、urllib、requests、httpx 或 fetch 探测第三方地址、逆向网页表单、轮换代码/参数/User-Agent，或绕过结构化数据 Skill 已声明的不支持范围；内联代码只可处理已有 Skill 写入本地文件的数据。HTTP 4xx/5xx、浏览器验证/CAPTCHA 页面，或预期结构化数据却返回 HTML，表示该来源本轮终止；只允许切换一次不同的已记录 Skill/provider，仍失败就保留错误并说明限制。
按用户问题的实际范围选择所需的数据源、分析步骤和图表数量；每张图应回答一个明确问题。避免重复取数，能批量获取时优先批量获取。需要多个互不依赖的联网检索角度时，把 queries 写入一个 JSON 文件，通过 external_info_search.py 的 --queries-file 在一次工具调用中并行完成，不得逐条串行搜索。数据源因限流、超时或无数据失败时，尝试另一个匹配来源并说明降级情况。
这是所有推理框架都必须遵守的收敛协议：取证前先定义本问题的最小充分证据条件；条件满足后立即锁定研究，不得再搜索、打开新数据源或做非必要的鲁棒性检查。锁定后只允许一次确定性汇总计算、一次必要的 HTML 渲染和一次有界验证，然后必须结束。任一工具失败后最多允许一条实质不同的替代路线；已有可用证据时直接披露限制并继续交付。
联网请求的单来源超时不得超过 10 秒，同一批次总时限不得超过 30 秒，不得设置网络重试。首次出现 network unreachable 后立即停止同类来源。不得把 timeout、timeout_ms、--max-time 或库函数的超时参数设为更大数值。
根据指标、资产、数据形态和用户指定的展示方式，在业务图表与通用图表 Skill 中选择最合适的组件；不要仅因为问题涉及股票就固定选择业务图表。
需要组合时按“数据/搜索 → 计算转换 → 图表渲染 → 视觉验证 → 投顾解读”执行，只选择任务真正需要的环节。
采用“Skill 优先、证据先行、图文协同”的分析方式：先确认可靠数据与口径，再提炼结论，最后选择最能解释该结论的图表。对于时间序列、两项及以上比较、排名、构成、分布、K 线、资金流、事件过程或关系网络，只要已有匹配图表 Skill 且数据质量足够，默认生成图表，不必等待用户再次要求。
图表必须服务于正文中的一个明确判断，并与相关段落相邻；标题、单位、图例和标注使用用户语言，正文指出图中最重要的变化、差异或拐点，不要把图中全部数值机械复述一遍。根据问题需要使用一张或多张图；多图各自回答不同问题。
不要为了“有图”而画图：单一数值、简单状态、纯操作结果、缺少可信数据或图形可能误导时，应改用简洁文字或表格，并说明限制。不得用示例、模拟或过期数据冒充实时证据。
调用图表 Skill 前必须读取其数据契约和 CLI/schema；生成后确认 HTML 文件存在且非空。通过 app/skill_runner.py execute 执行时，其成功回执中 artifacts[].verified=true 与 bytes>0 已完成这项验证；不要再调用 test、ls、wc、cat 或读取 HTML 复核。复杂图、上传图复刻或视觉风险较高时，再执行对应视觉验证 Skill。
工具之间必须用文件路径传递数据：数据、搜索或计算结果先写入 outputs 下的 JSON/CSV 文件，后续脚本只接收该文件路径。禁止把大段数组、K 线、新闻列表或完整 JSON 直接填入命令参数、提示词或最终回答。
所有已注册的数据、搜索、计算和渲染脚本统一通过 app/skill_runner.py execute 调用，不得绕过 runner 直接执行 canonical script。runner 返回 dataHandoffs 时，直接使用其中的 summary 完成推理，并把 path 传给下游；除非摘要明确缺少用户要求的字段，否则禁止再用 Python、cat、jq、sed 等重新展开完整文件。
当一次确定性计算已经覆盖用户要求的样本、口径、关键统计和限制，证据即视为充分：立即进入报告生成或最终回答。禁止以“再确认一次”“确定性汇总”“稳健性检查”为由重读结果、重算同一指标、额外切分子样本或寻找旁证；只有出现具体矛盾、执行失败或缺少用户明确要求的字段时才能补一步，并须说明缺口。不要连续输出笼统的“正在推进当前分析步骤”，进度应明确对应当前真实交付动作。
需要图表时，把独立 HTML 写入 {self.generated_dir}，文件名以 {framework}- 开头；普通文件组件通过绝对路径交付；原生 visualize_show_widget 的 HTML/SVG 参数则直接增量传给前端并由工具自动保存。在最终 Markdown 的相应位置单独写一行 [[AIME_CHART:绝对HTML路径]]。
当用户要求 StreamViz、流式网页、仪表盘、关系/流程看板、通用可视化或交互式 HTML，或者只说“可视化”而没有指定具体图表类型时，默认优先选择 streamviz 作为“展示阶段” Skill；不要为了比较候选而读取 generic-chart、business-chart-recall 或 custom-html-widget。只有用户明确指定 K 线、柱状图、折线图等专用图表，或 StreamViz 契约确实无法表达时，才选择其他展示 Skill。streamviz 是唯一的通用看板展示 Skill，不能单独充当数据源、搜索或分析器。涉及行情、新闻、财务或其他事实时，必须同时先选择并执行匹配的数据/搜索/分析 Skill，得到可追溯的 JSON/CSV 结果后，DeepSeek 使用 visualize_show_widget 在同一轮工具循环中生成展示 HTML/SVG；按 streamviz 的布局和主题规范组织表格、排序、时间线和叙事区块，不要把所有内容压成指标卡。已有结构化 payload 可以交给 render_streamviz.py 使用 dashboard、comparison、timeline、flow 或 brief 模板；不要为本来可原生流式生成的报告先拼出完整 html 文件。默认输出浅色主题：根背景透明，正文使用深色高对比文字，卡片与表格使用白色或浅灰表面；除非用户明确要求深色模式，不得使用浅色文字、深色半透明卡片或仅适配深色背景的 SVG。streamviz 不得编造指标、日期、结论或用“—”占位伪装结果；上游数据缺失时应展示已验证的限制而非虚构看板。最终 AIME_SKILLS 标记应同时列出 streamviz 和实际使用的上游 Skill。只有原生工具参数或渲染器实际发出的事件才是增量展示；单个已完成 HTML 的加载不等同于生成过程流式。
用户明确要求 HTML 报告、HTML 页面或 HTML 组件时，先完成匹配的上游研究与验证。DeepSeek 对无脚本的 HTML/CSS/SVG 报告优先使用 visualize_show_widget 实时生成并保存独立 HTML，以 AIME_CHART 标记交付。已有结构化 payload、非原生框架或确需脚本的页面可使用 streamviz 的 render_streamviz.py；不要为可原生流式的报告额外加载 custom-html-widget 并写完整 html 包装文件。不能只交付 Markdown 或几张图表来代替用户要求的 HTML 报告；不能把普通文本回答强制改成 HTML。
文件生成任务还须在最终回答中用 [[AIME_FILE:已验证生成文件的绝对路径]] 交付可下载文件，不能只说“已生成”。HTML 报告同时保留 AIME_CHART 预览标记。仅将最终交付文件标记为 AIME_FILE，不标记临时数据或中间产物。报告跟随宿主主题，不要添加浅色/暗色切换控件；独立下载文件也不需要第二套主题开关。
最终答案末尾另起一行写 [[AIME_SKILLS:实际使用的Skill名称，以英文逗号分隔]]；未使用项目 Skill 时写 [[AIME_SKILLS:none]]。该标记只用于系统记录。
所有面向用户的文字（包括执行前说明、工具间进度、commentary 和最终回答）都必须使用用户的语言。执行过程中只提供简短、具体的公开行动摘要，例如“我先核对苹果的图表设置，再加载日线”，供界面的动态进度文案使用；不要输出内部思维链。
最终回答使用用户的语言，先给核心结论，再给关键证据和图表解读，最后给风险、数据时间与口径。结论强度必须与证据质量匹配；代理数据、降级数据或不完整数据必须显式披露。不得把内部规划、命令日志或密钥写进答案。
联网搜索、新闻、公告、研报或网页事实的来源由 Skill 工具返回的结构化数据自动收集，并由 Mentora 现有溯源组件展示。最终正文不要加入 Markdown 来源链接、裸 URL、“来源：”引导或“来源/参考资料”清单。
除非任务本身要求修改项目，否则不要改动 app、tests 或配置文件；生成物只能写入 outputs。
如果运行时支持工具步骤的 thoughtSummary 元数据，只提供一句面向用户的进度摘要，说明当前判断或行动目的；不要返回原始思维链、内部推理过程、命令或参数。工具调用中的 description、title、thoughtSummary 也是直接展示给用户的步骤标题，必须使用用户要求的语言；中文会话用中文描述动作（例如“将图表复制到交付目录”“检查图表文件是否存在”），不要因工具文档或参数名是英文而写英文说明。命令、路径、代码、产品名保持原样。"""
                + capability_note + self._source_readiness_guidance() + guidance_note)

    def _source_readiness_guidance(self) -> str:
        """Describe configured search routes without choosing for the agent."""
        contract = self.project_root / 'app/skills/external-search/SKILL.md'
        if not contract.is_file():
            return ""
        configured=[]
        if os.getenv("TAVILY_API_KEY", "").strip(): configured.append("Tavily")
        if os.getenv("SERPER_API_KEY", "").strip(): configured.append("Serper")
        if os.getenv("MOONSHOT_API_KEY", "").strip(): configured.append("Kimi")
        if configured:
            return "\n\n宿主已配置的联网搜索来源：" + "、".join(configured) + "。具体路由按 external-search Skill 契约执行。"
        return ("\n\n宿主当前未配置 Tavily、Serper 或 Kimi 凭据。"
                "如任务需要联网证据，明确说明配置缺口，不可声称已完成联网核验。")

    def _skill_catalog(self, *, include_scripts: bool = True) -> str:
        """Expose bridge descriptions without choosing a skill on the model's behalf."""
        bridge_dir = self.project_root / ".agents" / "skills"
        entries: list[str] = []
        if not bridge_dir.is_dir():
            return ""
        for bridge in sorted(bridge_dir.glob("*/SKILL.md")):
            try:
                frontmatter = bridge.read_text(encoding="utf-8").split("---", 2)[1]
            except (OSError, IndexError):
                continue
            description = re.search(r"(?m)^description:\s*(.+)$", frontmatter)
            if description:
                name = bridge.parent.name
                scripts_dir = self.project_root / "app" / "skills" / name / "scripts"
                scripts = ", ".join(path.name for path in sorted(scripts_dir.glob("*.py")) if not path.name.startswith("_"))
                suffix = f" | scripts: {scripts}" if include_scripts and scripts else ""
                entries.append(f"- {name}: {description.group(1).strip()}{suffix}")
        return "\n".join(entries)

    @staticmethod
    def _source_site_name(title: str, url: str) -> str:
        hostname = (urlsplit(url).hostname or "").lower().removeprefix("www.")
        publisher = re.sub(r"(?:官方)?公告$", "", str(title or "").strip()).strip()
        if publisher and len(publisher) <= 24:
            return publisher
        return hostname or "Source"

    @staticmethod
    def _is_public_source_url(url: str) -> bool:
        parsed = urlsplit(str(url or "").strip())
        hostname = (parsed.hostname or "").lower().rstrip(".").removeprefix("www.")
        if parsed.scheme not in {"http", "https"} or not hostname or "{" in hostname:
            return False
        if hostname == "localhost" or hostname.endswith((".localhost", ".local")):
            return False
        try:
            address = ipaddress.ip_address(hostname)
            if not address.is_global:
                return False
        except ValueError:
            pass
        if hostname in {
            "api.deepseek.com",
            "api.moonshot.cn",
            "api.search.brave.com",
            "googleapis.com",
            "www.googleapis.com",
        }:
            return False
        path = parsed.path.lower()
        if (
            (hostname == "duckduckgo.com" and path.startswith("/html"))
            or (hostname.endswith("bing.com") and path.startswith("/search"))
            or (hostname == "sogou.com" and path.startswith("/web"))
            or (hostname == "cninfo.com.cn" and "/fulltextsearch/" in path)
            or (hostname == "news.google.com" and path.startswith("/rss"))
            or (hostname == "feeds.finance.yahoo.com" and path.startswith("/rss"))
        ):
            return False
        return True

    @classmethod
    def _normalize_source(cls, item: dict[str, Any]) -> dict[str, str] | None:
        url = str(
            item.get("url")
            or item.get("link")
            or item.get("source_url")
            or item.get("sourceUrl")
            or item.get("web_url")
            or ""
        ).strip()
        if not cls._is_public_source_url(url):
            return None
        title = str(item.get("title") or item.get("headline") or item.get("name") or "").strip()
        site_value = item.get("siteName") or item.get("site_name") or item.get("publisher") or item.get("domain")
        if isinstance(site_value, dict):
            site_value = site_value.get("name") or site_value.get("title")
        site_name = str(site_value or "").strip() or cls._source_site_name(title, url)
        if not title:
            title = site_name
        summary = str(
            item.get("summary")
            or item.get("snippet")
            or item.get("description")
            or item.get("content_text")
            or ""
        ).strip()
        summary = re.sub(r"\s+", " ", summary)[:220]
        return {
            "siteName": site_name,
            "url": url,
            "title": title,
            "summary": summary,
            "iconUrl": str(item.get("iconUrl") or item.get("icon_url") or "").strip(),
        }

    @classmethod
    def _sources_from_value(cls, value: Any) -> list[dict[str, str]]:
        """Extract the legacy frontend source shape from agent answers/tool results."""
        collected: list[dict[str, str]] = []

        def visit(current: Any) -> None:
            if isinstance(current, dict):
                normalized = cls._normalize_source(current)
                if normalized:
                    collected.append(normalized)
                for nested in current.values():
                    visit(nested)
                return
            if isinstance(current, (list, tuple)):
                for nested in current:
                    visit(nested)
                return
            if not isinstance(current, str):
                return
            text = current.strip()
            if text.startswith(("{", "[")):
                try:
                    visit(json.loads(text))
                except json.JSONDecodeError:
                    pass
            for match in re.finditer(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)", current):
                title, url = match.groups()
                line_start = current.rfind("\n", 0, match.start()) + 1
                line_end = current.find("\n", match.end())
                context = current[line_start : line_end if line_end >= 0 else len(current)]
                context = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", context)
                context = re.sub(r"[*_`#>]", "", context).strip()
                normalized = cls._normalize_source({"title": title, "url": url, "summary": context})
                if normalized:
                    collected.append(normalized)
        visit(value)
        unique: list[dict[str, str]] = []
        seen: set[str] = set()
        for item in collected:
            key = item["url"].rstrip("/").lower()
            if key in seen:
                continue
            seen.add(key)
            unique.append(item)
            if len(unique) >= 24:
                break
        return unique

    @classmethod
    def _sanitize_source_links(cls, text: str) -> str:
        def replace(match: re.Match[str]) -> str:
            label, url = match.groups()
            return match.group(0) if cls._is_public_source_url(url) else label

        return re.sub(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)", replace, str(text or ""))

    @staticmethod
    def _strip_source_markdown_from_answer(text: str) -> str:
        """Keep provenance in payload.sources, not as citation syntax in the answer."""
        value = str(text or "")
        link = r"\[[^\]\n]+\]\(https?://[^\s)]+\)"
        link_list = rf"{link}(?:\s*[、,，;；]\s*{link})*"
        value = re.sub(
            rf"[（(]\s*(?:来源|來源|出处|出處|参考|參考|source|sources)\s*[：:]\s*{link_list}\s*[）)]",
            "",
            value,
            flags=re.I,
        )
        value = re.sub(
            rf"(?:来源|來源|出处|出處|参考|參考|source|sources)\s*[：:]\s*{link_list}",
            "",
            value,
            flags=re.I,
        )
        value = re.sub(link, lambda match: re.match(r"\[([^\]\n]+)\]", match.group(0)).group(1), value)
        value = re.sub(r"[（(]\s*[）)]", "", value)
        value = re.sub(r"[ \t]+([，。；：、,.!?！？])", r"\1", value)
        value = re.sub(r"\n{3,}", "\n\n", value)
        return value.strip()

    @classmethod
    def _merge_sources(cls, *groups: list[dict[str, str]]) -> list[dict[str, str]]:
        merged: list[dict[str, str]] = []
        indexes: dict[str, int] = {}
        for group in groups:
            for item in group:
                item = cls._normalize_source(item)
                if not item:
                    continue
                key = str(item.get("url") or "").rstrip("/").lower()
                if not key:
                    continue
                if key in indexes:
                    existing = merged[indexes[key]]
                    for field in ("siteName", "title", "summary", "iconUrl"):
                        if not existing.get(field) and item.get(field):
                            existing[field] = item[field]
                    continue
                indexes[key] = len(merged)
                merged.append(dict(item))
        return merged[:24]

    def _artifact_payload(
        self,
        framework: str,
        question: str,
        answer: str,
        run_id: str,
        session_id: str,
        sources: list[dict[str, str]] | None = None,
        inference_model: str = "",
    ) -> dict[str, Any]:
        markers = re.findall(r"\[\[AIME_CHART:([^\]\n]+\.html)\]\]", answer)
        skill_match = re.search(r"\[\[AIME_SKILLS:([^\]\n]+)\]\]", answer)
        skill_names = []
        if skill_match:
            skill_names = [name.strip() for name in skill_match.group(1).split(",") if name.strip() and name.strip() != "none"]
        artifacts: list[dict[str, str]] = []
        resolved_markers: dict[str, Path] = {}
        intermediate_markers: set[str] = set()
        for raw in dict.fromkeys(markers):
            marker_path = raw.strip()
            candidates: list[Path]
            if marker_path.startswith("/generated/"):
                candidates = [self.generated_dir / Path(marker_path).name]
            else:
                supplied = Path(marker_path).expanduser()
                candidates = [supplied] if supplied.is_absolute() else [
                    self.project_root / supplied,
                    self.generated_dir / supplied.name,
                ]
            for candidate in candidates:
                path = candidate.resolve()
                if (
                    path.is_file()
                    and path.stat().st_size > 0
                    and path.suffix.lower() == ".html"
                    and self.generated_dir in path.parents
                ):
                    if not self._is_user_facing_html(path):
                        intermediate_markers.add(raw)
                        break
                    resolved_markers[raw] = path
                    artifact={"path":str(path),"url":f"/generated/{path.name}"}
                    with path.open(encoding='utf-8',errors='replace') as document:
                        header=document.read(16384)
                    if 'data-image-search-gallery=' in header or '<title>图片搜索</title>' in header:
                        artifact.update(contentKind='image-gallery',renderMode='iframe')
                    artifacts.append(artifact)
                    break
        if markers and not artifacts and any(raw not in intermediate_markers for raw in markers):
            missing = ", ".join(Path(raw.strip()).name for raw in dict.fromkeys(markers))
            raise ReasoningFrameworkError(
                f"模型引用的图表文件未成功生成：{missing}。请重试本次请求。"
            )

        clean_answer = answer
        for raw in dict.fromkeys(markers):
            original_marker = f"[[AIME_CHART:{raw}]]"
            path = resolved_markers.get(raw)
            replacement = f"[[AIME_CHART:{path}]]" if path else ""
            clean_answer = clean_answer.replace(original_marker, replacement)
        clean_answer = re.sub(r"(?m)^\s*\[\[AIME_SKILLS:[^\]\n]+\]\]\s*$", "", clean_answer).strip()
        clean_answer = self._sanitize_source_links(clean_answer)
        normalized_sources = self._merge_sources(sources or [], self._sources_from_value(clean_answer))
        clean_answer = self._strip_source_markdown_from_answer(clean_answer)
        from app.file_artifacts import collect_file_artifacts
        try:
            file_artifacts,clean_answer=collect_file_artifacts(
                question,
                clean_answer,
                artifacts,
                self.generated_dir,
                self.project_root,
                allow_html="streamviz" in skill_names,
            )
        except ValueError as exc:
            raise ReasoningFrameworkError(str(exc)) from exc
        html_url = artifacts[0]["url"] if artifacts else ""
        return {
            "question": question,
            "code": "",
            "selectedSkill": {
                "key": ",".join(skill_names) or framework,
                "label": " + ".join(skill_names) if skill_names else FRAMEWORKS[framework],
                "script": " + ".join(skill_names) if skill_names else framework,
                "reason": (
                    f"由 {FRAMEWORKS[framework]} 选择并执行 Mentora 项目 Skill。"
                    if skill_names else f"由 {FRAMEWORKS[framework]} 自主规划并执行。"
                ),
            },
            "htmlUrl": html_url,
            "reportUrl": html_url,
            "reportArtifacts": artifacts,
            "fileArtifacts": file_artifacts,
            "payloadUrl": None,
            "interpretation": clean_answer or "推理框架未返回最终文本。",
            "status": [f"{FRAMEWORKS[framework]} 已完成处理"],
            "agentRunId": run_id,
            "studioSessionId": None,
            "engineSessionId": session_id,
            "reasoningFramework": framework,
            "inferenceModel": inference_model,
            "sources": normalized_sources,
            "videos": [],
            "actionLinks": [],
            "lang": "zh-CN",
        }

    @staticmethod
    def _public_thought_summary(*values: Any) -> str:
        """Return a short user-facing progress summary, never a raw reasoning trace."""
        for value in values:
            if not isinstance(value, str):
                continue
            text = re.sub(r"\s+", " ", value.replace("\x00", " ")).strip()
            text = re.sub(r"^(?:thought|reasoning|analysis|思考|推理)\s*[:：-]\s*", "", text, flags=re.I)
            if not text:
                continue
            text = re.split(r"[。！？!?\n]", text, maxsplit=1)[0].strip()
            if text:
                return text[:96] + ("…" if len(text) > 96 else "")
        return ""

    @staticmethod
    def _answer_text_events(answer: str) -> Iterator[tuple[str, dict[str, Any]]]:
        """Compatibility fallback for engines without deltas: one honest snapshot."""
        text = str(answer or "")
        if not text:
            return
        yield "answer_text", {"text": text, "replace": True, "final": True}

    def _localized_progress(self, text: str, question: str) -> str:
        """Use already-public commentary; progress must not make model calls."""
        summary = self._public_thought_summary(text)
        cjk = r"[\u3400-\u9fff]"
        if bool(re.search(cjk, question)) == bool(re.search(cjk, summary)):
            return summary
        # The agent is instructed to use the user's language. Keep the existing
        # localized tool status when it does not, instead of blocking the stream
        # on a second model invocation merely to translate a progress sentence.
        return ""

    def _localized_tool_summary(self, question: str, *values: Any) -> str:
        """Select public metadata in the user's language without another model call."""
        for value in values:
            if isinstance(value, str):
                summary = self._localized_progress(value, question)
                if summary:
                    return summary
        return ""

    def _jev_tool_thought_summary(self, script: str, arguments: Any) -> str:
        """Legacy metadata fallback; live Harness semantics use ToolActivitySession."""
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except (TypeError, ValueError):
                return ""
        if not isinstance(arguments, dict):
            return ""
        return self._public_thought_summary(
            arguments.get("thoughtSummary"), arguments.get("thought_summary"),
            arguments.get("description"), arguments.get("title"),
        )

    @staticmethod
    def _tool_activity_summary(semantics, question, fallback=''):
        chinese=bool(re.search(r'[\u3400-\u9fff]',question))
        if semantics.get('status')=='classified':
            labels=JevToolActivityRouter.SUMMARIES if chinese else JevToolActivityRouter.EN_SUMMARIES
            return labels.get(semantics.get('stage'),'')
        # Classification is an invisible sidecar, not a user-visible activity.
        # Keep the tool's existing public description until a decision arrives.
        # Provenance/failure state remains explicit in activitySemantics.
        return fallback or ''

    @staticmethod
    def _compact_codex_tool_observation(value: Any) -> str:
        text = str(value or "").strip()
        lowered = text.lower()
        if any(marker in lowered for marker in (
            "requires javascript to verify your browser",
            "cf-chl-",
            "captcha",
            "browser verification",
        )):
            return "目标网站返回浏览器验证或反爬页面（可能是 HTTP 200），未获得可用数据。"
        http_failures = re.findall(
            r"(?:httperror\s+)?http error\s+(4\d\d|5\d\d)|\bhttp\s+(4\d\d|5\d\d)\b",
            lowered,
        )
        if http_failures:
            codes = [left or right for left, right in http_failures]
            unique_codes = ", ".join(dict.fromkeys(codes))
            suffix = f"；共 {len(codes)} 个请求失败" if len(codes) > 1 else ""
            return f"数据源返回 HTTP {unique_codes}{suffix}，未获得可用数据。"
        return text[:5000]

    @staticmethod
    def _file_change_stats(change: dict[str, Any], path: Path, kind: str) -> tuple[int, int]:
        """Prefer runtime-provided counts, then derive them from a unified diff."""
        def number(*names: str) -> int | None:
            for name in names:
                value = change.get(name)
                if isinstance(value, int) and value >= 0:
                    return value
            return None

        added = number("added", "additions", "lines_added", "linesAdded")
        removed = number("removed", "deletions", "lines_removed", "linesRemoved")
        diff = str(change.get("diff") or change.get("patch") or "")
        if added is None and diff:
            added = sum(1 for line in diff.splitlines() if line.startswith("+") and not line.startswith("+++"))
        if removed is None and diff:
            removed = sum(1 for line in diff.splitlines() if line.startswith("-") and not line.startswith("---"))
        if kind == "created" and added is None:
            try:
                added = len(path.read_text(encoding="utf-8").splitlines())
            except (OSError, UnicodeDecodeError):
                added = 0
        return added or 0, removed or 0

    @staticmethod
    def _codex_file_changes(item: dict[str, Any], project_root: Path) -> list[dict[str, Any]]:
        raw_changes = item.get("changes")
        if not isinstance(raw_changes, list):
            raw_changes = [item] if item.get("path") else []
        changes: list[dict[str, Any]] = []
        project_root = Path(project_root).resolve()
        outputs_root = (project_root / "outputs").resolve()
        for raw in raw_changes:
            if not isinstance(raw, dict):
                continue
            raw_path = str(raw.get("path") or raw.get("file_path") or "").strip()
            if not raw_path:
                continue
            path = Path(raw_path).expanduser()
            if not path.is_absolute():
                path = project_root / path
            try:
                path = path.resolve()
                relative = path.relative_to(project_root)
            except (OSError, ValueError):
                continue
            runtime_kind = str(raw.get("kind") or raw.get("change_type") or raw.get("status") or "update").lower()
            kind = "created" if runtime_kind in {"add", "added", "create", "created", "new"} else (
                "deleted" if runtime_kind in {"delete", "deleted", "remove", "removed"} else "edited"
            )
            added, removed = LocalAgentFrameworks._file_change_stats(raw, path, kind)
            diff = str(raw.get("diff") or raw.get("patch") or "")
            if not diff and kind == "created" and path.is_file():
                try:
                    lines = path.read_text(encoding="utf-8").splitlines()
                    diff = "\n".join(difflib.unified_diff([], lines, fromfile="/dev/null", tofile=path.name, lineterm=""))
                except (OSError, UnicodeDecodeError):
                    diff = ""
            if len(diff) > 200_000:
                diff = diff[:200_000] + "\n… diff truncated"
            previewable = kind != "deleted" and path.is_file() and (path == outputs_root or outputs_root in path.parents)
            changes.append({
                "path": str(path),
                "relativePath": relative.as_posix(),
                "name": path.name,
                "kind": kind,
                "added": added,
                "removed": removed,
                "diff": diff,
                "previewable": previewable,
            })
        return changes

    def _deepseek_write_context(self, name: str, arguments: Any) -> dict[str, Any]:
        if not re.search(r"write|edit|patch", str(name), flags=re.I):
            return {}
        parsed = arguments
        if isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except json.JSONDecodeError:
                return {}
        if not isinstance(parsed, dict):
            return {}
        raw_path = str(parsed.get("file_path") or parsed.get("path") or "").strip()
        if not raw_path:
            return {}
        path = Path(raw_path).expanduser()
        if not path.is_absolute():
            path = self.project_root / path
        try:
            path = path.resolve()
            relative = path.relative_to(self.project_root.resolve())
        except (OSError, ValueError):
            return {}
        before = ""
        existed = path.is_file()
        if existed:
            try:
                if path.stat().st_size <= 2_000_000:
                    before = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                pass
        content = parsed.get("content")
        return {
            "path": path,
            "relativePath": relative.as_posix(),
            "name": path.name,
            "existed": existed,
            "before": before,
            "content": content if isinstance(content, str) else None,
            "displayArguments": {"file_path": raw_path},
        }

    def _deepseek_file_change(self, context: dict[str, Any], observation: Any) -> dict[str, Any] | None:
        change = context.get("fileChange")
        if not isinstance(change, dict) or not isinstance(change.get("path"), Path):
            return None
        path: Path = change["path"]
        text = observation if isinstance(observation, str) else json.dumps(observation, ensure_ascii=False)
        if not path.is_file():
            return None
        kind = "created" if re.search(r"\bCreated file\b", text, flags=re.I) or not change.get("existed") else "edited"
        after = change.get("content")
        if not isinstance(after, str):
            try:
                after = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                after = ""
        before_lines = str(change.get("before") or "").splitlines()
        after_lines = after.splitlines()
        if kind == "created":
            before_lines = []
            added, removed = len(after_lines), 0
        else:
            added = removed = 0
            for opcode, left_start, left_end, right_start, right_end in difflib.SequenceMatcher(None, before_lines, after_lines).get_opcodes():
                if opcode in {"replace", "delete"}:
                    removed += left_end - left_start
                if opcode in {"replace", "insert"}:
                    added += right_end - right_start
        diff = "\n".join(difflib.unified_diff(
            before_lines, after_lines,
            fromfile=str(change.get("name") or path.name),
            tofile=str(change.get("name") or path.name),
            lineterm="",
        ))
        if len(diff) > 200_000:
            diff = diff[:200_000] + "\n… diff truncated"
        outputs_root = (self.project_root / "outputs").resolve()
        return {
            "path": str(path),
            "relativePath": str(change.get("relativePath") or ""),
            "name": str(change.get("name") or path.name),
            "kind": kind,
            "added": added,
            "removed": removed,
            "diff": diff,
            "previewable": outputs_root in path.parents,
        }

    @staticmethod
    def _codex_tool_event(item: dict[str, Any], index: int, project_root: Path | None = None) -> dict[str, Any]:
        """Forward public model metadata; never synthesize summaries from commands."""
        item_type = str(item.get("type") or "agent_step")
        command = item.get("command")
        if isinstance(command, list):
            command = " ".join(str(part) for part in command)
        name = str(item.get("name") or item_type).replace("_", " ")
        thought_summary = LocalAgentFrameworks._public_thought_summary(
            item.get("thoughtSummary"), item.get("thought_summary"), item.get("title"), item.get("description")
        )
        event = {
            "index": index,
            "total": index,
            "tool": name,
            "script": name,
            "code": "CODEX",
            "lang": "zh-CN",
            "params": [str(command)] if command else [],
            "observation": LocalAgentFrameworks._compact_codex_tool_observation(
                item.get("aggregated_output") or item.get("output") or item.get("status") or ""
            ),
            "phase": "completed",
            "callId": str(item.get("id") or f"codex-tool-{index}"),
            "thoughtSummary": thought_summary,
        }
        if item_type in {"file_change", "file_changes"}:
            event["fileChanges"] = LocalAgentFrameworks._codex_file_changes(item, project_root or Path.cwd())
        return event

    @staticmethod
    def _is_user_facing_html(path: Path) -> bool:
        """Execution receipts are intermediate evidence, never visual reports."""
        try:
            with path.open(encoding="utf-8") as handle:
                prefix = handle.read(65536)
        except (OSError, UnicodeDecodeError):
            return False
        return not bool(re.search(
            r"<main\b[^>]*\bdata-artifact-type\s*=\s*[\"'](?:data-transform|execution-receipt)[\"']",
            prefix, flags=re.I,
        ))

    def _html_modules_from_tool_output(self, value: Any) -> list[dict[str, Any]]:
        """Register user-facing generated HTML; omit internal execution receipts."""
        modules: list[dict[str, Any]] = []
        seen: set[Path] = set()

        def visit(result: Any) -> None:
            if isinstance(result, (list, tuple)):
                for item in result:
                    visit(item)
                return
            if isinstance(result, str):
                for raw_line in result.splitlines():
                    line = raw_line.strip()
                    if not line.startswith("{"):
                        continue
                    try:
                        parsed = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    visit(parsed)
                return
            if not isinstance(result, dict):
                return
            if result.get("ok") is not True:
                for key in ("result", "output", "content", "message", "text", "observation"):
                    nested = result.get(key)
                    if nested is not None:
                        visit(nested)
                return
            raw_output = str(result.get("output") or "").strip()
            if raw_output.lower().endswith(".html"):
                path = Path(raw_output).expanduser()
                if not path.is_absolute():
                    path = self.project_root / path
                path = path.resolve()
                if path not in seen and path.is_file() and self.generated_dir in path.parents and self._is_user_facing_html(path):
                    seen.add(path)
                    modules.append({
                        "htmlUrl": f"/generated/{path.name}",
                        "label": str(result.get("title") or path.stem),
                        "streamvizSource": "generated-html",
                    })
            for key in ("result", "content", "message", "text", "observation"):
                nested = result.get(key)
                if nested is not None:
                    visit(nested)

        visit(value)
        return modules

    def _generated_html_snapshot(self) -> dict[Path, tuple[int, int]]:
        """Record generated HTML state so a run can recover an unreported artifact."""
        snapshot: dict[Path, tuple[int, int]] = {}
        for path in self.generated_dir.glob("*.html"):
            try:
                stat = path.stat()
            except OSError:
                continue
            if stat.st_size > 0 and self._is_user_facing_html(path):
                snapshot[path.resolve()] = (stat.st_mtime_ns, stat.st_size)
        return snapshot

    @staticmethod
    def _requires_html_deliverable(question: str) -> bool:
        """Detect an explicit HTML deliverable, not a generic request for analysis."""
        text = str(question or "")
        return bool(re.search(
            r"(?:生成|制作|创建|做|导出|交付|给我).{0,32}(?:HTML|html)(?:页面|报告|组件|文件|仪表盘|看板)?"
            r"|(?:完整|交互|独立运行|可下载).{0,24}(?:HTML|html)"
            r"|(?:HTML|html).{0,32}(?:页面|报告|组件|文件|仪表盘|看板)",
            text,
        ))

    @property
    def _codex_trace_path(self) -> Path:
        configured = os.getenv("AICHART_CODEX_TRACE_FILE", "").strip()
        path = Path(configured).expanduser() if configured else self.project_root / "work" / "codex-live.log"
        return path if path.is_absolute() else (self.project_root / path).resolve()

    @staticmethod
    def _codex_trace_text(value: Any, limit: int = 2400) -> str:
        text = str(value or "").replace("\x00", "")
        text = re.sub(
            r"(?i)(api[_-]?key|authorization|token|cookie)(\s*[=:]\s*)([^\s,;]+)",
            r"\1\2[REDACTED]",
            text,
        )
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        return text[:limit] + ("…" if len(text) > limit else "")

    def _write_codex_trace(self, message: str) -> None:
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{timestamp}] {message}"
        path = self._codex_trace_path
        with self._codex_trace_guard:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
        # Keep the same safe trace in the server log for headless debugging.
        print(line, flush=True)

    @staticmethod
    def _terminate_codex_process(process: Any) -> None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except (AttributeError, OSError, ProcessLookupError):
            try:
                process.terminate()
            except (AttributeError, OSError, ProcessLookupError):
                pass

    @staticmethod
    def _codex_run_timeout_seconds() -> float:
        try:
            timeout = float(os.getenv("AICHART_CODEX_RUN_TIMEOUT_SECONDS", "1200"))
        except ValueError:
            timeout = 1200.0
        return max(1.0, timeout)

    @staticmethod
    def _deepseek_timeout_seconds() -> float:
        try:
            timeout = float(os.getenv("AICHART_DEEPSEEK_TIMEOUT_SECONDS", "1200"))
        except ValueError:
            timeout = 1200.0
        return max(1.0, timeout)

    @classmethod
    def _deepseek_run_timeout_seconds(cls) -> float:
        configured = os.getenv("AICHART_DEEPSEEK_RUN_TIMEOUT_SECONDS", "").strip()
        if not configured:
            return cls._deepseek_timeout_seconds()
        try:
            timeout = float(configured)
        except ValueError:
            return cls._deepseek_timeout_seconds()
        return max(1.0, timeout)

    def _trace_codex_event(
        self, event_type: str, item: dict[str, Any], *, show_local_reasoning: bool = False
    ) -> None:
        item_type = str(item.get("type") or "")
        if item_type == "reasoning":
            if event_type == "item.started":
                self._write_codex_trace("推理阶段开始")
            elif event_type == "item.completed":
                reasoning_text = self._codex_trace_text(item.get("text"), 8000) if show_local_reasoning else ""
                if reasoning_text:
                    self._write_codex_trace(f"本地模型推理记录：{reasoning_text}")
                else:
                    self._write_codex_trace("推理阶段完成（未提供可显示文本）")
            return
        if item_type == "agent_message":
            if event_type == "item.completed":
                answer = self._codex_trace_text(item.get("text"), 1200)
                self._write_codex_trace(f"模型消息：{answer}")
            return
        if item_type in {"", "error"}:
            return
        name = str(item.get("name") or item_type).replace("_", " ")
        command = item.get("command")
        if isinstance(command, list):
            command = " ".join(str(part) for part in command)
        command_text = self._codex_trace_text(command, 1600)
        if event_type == "item.started":
            suffix = f" | 参数: {command_text}" if command_text else ""
            self._write_codex_trace(f"工具开始: {name}{suffix}")
            return
        if event_type == "item.completed":
            status = self._codex_trace_text(item.get("status"), 120) or "completed"
            output = self._codex_trace_text(item.get("aggregated_output") or item.get("output"), 2000)
            suffix = f" | 输出: {output}" if output else ""
            self._write_codex_trace(f"工具完成: {name} | 状态: {status}{suffix}")

    def _stream_codex(
        self,
        question: str,
        images: list[Any],
        session_key: str,
        engine_session_id: str,
        history: list[dict[str, Any]],
        inference_model: str = "",
        reasoning_effort: str = "",
        _repair_attempt: int = 0,
        visualization_guidance: str = "",
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        codex_bin = os.getenv("AICHART_CODEX_BIN", "codex")
        resolved = shutil.which(codex_bin) or (codex_bin if Path(codex_bin).is_file() else "")
        if not resolved:
            raise ReasoningFrameworkError("Codex 不可用：未找到 codex CLI，请先安装 Codex Harness")
        image_paths = self._save_images("codex", session_key, images)
        prompt = self._prompt(
            "codex", question, image_paths, history,
            visualization_guidance=visualization_guidance,
        )
        network_enabled = os.getenv("AICHART_CODEX_NETWORK_ACCESS", "true").strip().lower() not in {"0", "false", "no"}
        network_config = f"sandbox_workspace_write.network_access={'true' if network_enabled else 'false'}"
        configured_effort = os.getenv("AICHART_CODEX_REASONING_EFFORT", "low").strip().lower()
        selected_effort = reasoning_effort.strip().lower() or configured_effort
        if selected_effort not in {"low", "medium", "high", "xhigh", "ultra", "max"}:
            selected_effort = "low"
        if engine_session_id:
            command = [
                resolved, "exec", "resume", "--json", "--skip-git-repo-check",
                "--config", network_config, engine_session_id,
            ]
        else:
            command = [
                resolved, "exec", "--json", "--skip-git-repo-check", "--sandbox", "workspace-write",
                "--config", network_config, "-C", str(self.project_root),
            ]
        selected_model = inference_model.strip()
        local_model = os.getenv("AICHART_OLLAMA_MODEL", "haervwe/GLM-4.6V-Flash-9B:latest").strip() or "haervwe/GLM-4.6V-Flash-9B:latest"
        is_local_glm = selected_model == local_model
        codex_local_model = (
            os.getenv(
                "AICHART_CODEX_OLLAMA_MODEL",
                "aimechart/glm-4.6v-flash-9b-codex:latest",
            ).strip()
            or "aimechart/glm-4.6v-flash-9b-codex:latest"
        )
        codex_provider = os.getenv("AICHART_CODEX_PROVIDER", "deepseek").strip().lower() or "deepseek"
        model = codex_local_model if is_local_glm else (
            os.getenv("AICHART_CODEX_MODEL", "").strip()
            or ("deepseek-flash" if codex_provider == "deepseek" else "")
        )
        if not is_local_glm and codex_provider == "deepseek":
            if not os.getenv("DEEPSEEK_API_KEY", "").strip():
                raise ReasoningFrameworkConfigurationError(
                    "Codex Harness 的 DeepSeek Provider 未配置 DEEPSEEK_API_KEY。"
                )
            base_url = (
                os.getenv("AICHART_CODEX_BASE_URL", "").strip()
                or os.getenv("DEEPSEEK_BASE_URL", "").strip()
                or "https://api.deepseek.com/"
            ).rstrip("/") + "/"
            configured_catalog = os.getenv("AICHART_CODEX_MODEL_CATALOG", "").strip()
            catalog_path = (
                Path(configured_catalog).expanduser()
                if configured_catalog
                else self.project_root / "app" / "codex-deepseek-models.json"
            )
            if not catalog_path.is_absolute():
                catalog_path = self.project_root / catalog_path
            command.extend(
                [
                    "--ignore-user-config",
                    "--config",
                    'model_provider="deepseek"',
                    "--config",
                    'model_providers.deepseek.name="DeepSeek"',
                    "--config",
                    f"model_providers.deepseek.base_url={json.dumps(base_url)}",
                    "--config",
                    'model_providers.deepseek.wire_api="responses"',
                    "--config",
                    'model_providers.deepseek.env_key="DEEPSEEK_API_KEY"',
                    "--config",
                    'web_search="disabled"',
                ]
            )
            if catalog_path.is_file():
                command.extend(
                    ["--config", f"model_catalog_json={json.dumps(str(catalog_path.resolve()))}"]
                )
            selected_effort = {
                "medium": "high",
                "xhigh": "high",
                "ultra": "max",
            }.get(selected_effort, selected_effort)
        elif not is_local_glm and not self._codex_authenticated(resolved):
            raise ReasoningFrameworkConfigurationError(
                "Codex Harness 的 OpenAI Provider 尚未认证，请配置 OpenAI 登录或 API Key。"
            )
        if is_local_glm:
            capability_catalog = self._capability_index.shortlist(question).render()
            prompt = (
                f"用户请求：{question}\n"
                "你是 Mentora 的本地 Agent。根据用户意图自主选择 Skill 和脚本；以下是宿主的轻量候选，不是固定路由：\n"
                f"{capability_catalog}\n"
                "目录不提供脚本契约；在读取所选 Skill 文件前，不要猜脚本名称或 CLI 参数。"
                "选择 Skill 后，下一步直接调用一个真实工具读取它的桥接 SKILL.md；"
                "读取 Markdown 文件请用 cat 或 sed，例如 cat .agents/skills/<skill>/SKILL.md；"
                "<skill> 替换成实际目录名。Skill 目录不是 Python 包，不能用 import 读取文件。"
                "不要用‘我将使用’之类的计划句结束这一轮。"
                "通过真实 exec_command 工具（参数 cmd）执行操作，不能只在回答里描述工具调用。"
                "先读取所选 .agents/skills/<skill>/SKILL.md 桥接文件，再按其中路径读完对应的"
                "app/skills/<skill>/SKILL.md 和所需的 schema/CLI 说明。"
                ".agents/skills 只存放 Markdown 桥接文件，不是脚本或 Python 包；"
                "脚本位于项目根目录下的 app/skills/<skill>/scripts/，不是"
                ".agents/skills/<skill>/app/scripts/。运行前用文件列表确认真实路径并核对参数，不要猜测。"
                "生成图表前核对所选脚本的 CLI 和数据契约；若它支持 --output 且能直接产出所需 HTML，"
                "优先按该脚本的契约生成并验证产物。若需要转交另一渲染器，先核对其 payload 结构和参数，"
                "不要把 JSON 数组当作要求 JSON 对象的输入；根据实际报错修正后再交付。"
                "本项目执行 Python 脚本使用 python3；若某条命令报 command not found: python，"
                "先改用 python3 并确认脚本路径，不要据此声称环境没有 Python。"
                "每次工具返回后，根据退出状态和输出判断目标是否已达成、下一步是否仍有必要。"
                "若失败，先利用错误信息定位原因，再选择有依据的修正或不同的检查方式；"
                "不要在没有新信息或明确理由时重复同一命令。"
                "如果环境确实缺少所需脚本或数据，说明已验证的阻碍，不要假装执行成功。"
                "只做用户要求的工作。若工具返回成功和产物路径，不要再次执行同一生成命令；"
                "检查该路径的 HTML 是否存在且非空即可。"
                "最终回答必须直接交付已验证的结果；已验证的图表用单独一行"
                "[[AIME_CHART:/absolute/path.html]] 呈现，并给出简短解读。"
                "用户要求 HTML 报告、HTML 页面或 HTML 组件时，先读取 custom-html-widget 技能，交付完整独立 HTML 文件，而不是仅返回 Markdown 或若干图表；静态 HTML 报告同样适用。"
                "文件生成任务须用 [[AIME_FILE:已验证文件的绝对路径]] 交付下载文件；HTML 同时保留 AIME_CHART 预览。不要标记中间产物；不要在报告内添加明暗主题切换按钮，主题由宿主统一管理。"
                "当用户要求 StreamViz、流式网页、仪表盘、关系/流程看板或交互 HTML 时，"
                "将 streamviz 作为最后的展示 Skill：它必须和匹配的数据/搜索/分析 Skill 协作，"
                "不能单独承担事实查询。先完成上游取数与验证，写出紧凑、证据驱动的 JSON payload 文件，"
                "再按 streamviz Skill 的 CLI 生成 HTML；基于问题选择 dashboard、comparison、timeline、flow 或 brief 布局，并按需组合表格、排序、时间线和叙事区块；当这些不适合时，"
                "使用 payload 的 html 字段生成任意自包含 HTML/CSS/SVG/Canvas 页面，"
                "不要把所有内容都压成指标卡；默认采用浅色主题：根背景透明、文字深色高对比、卡片和表格为白色或浅灰表面；"
                "除非用户明确要求深色模式，不得输出浅字、深色半透明卡片或仅适配深色背景的 SVG；不得编造指标或用占位符伪造数据。"
                "最终 AIME_SKILLS 要同时列出 streamviz 和实际使用的上游 Skills；网关会自动流式呈现 HTML。"
                "没有实际生成并验证图表就不要输出该标记，应如实说明未完成的原因。"
                "'我将验证'、'接下来会执行'等计划句只能用于过程消息，不能作为最终回答；"
                "如果还有必要步骤未做，先调用工具完成或明确说明阻碍，再结束。"
                "项目环境已就绪，不得安装依赖、创建环境、使用 web_search 或子 Agent。"
                "最终只报告已完成且核实的结果。"
                + ("\n用户图片：" + ", ".join(map(str, image_paths)) if image_paths else "")
                + ("\n上一轮用户问题：" + str(history[-1].get("text") or "")[:300] if history else "")
            )
            if visualization_guidance:
                prompt += "\n\n" + visualization_guidance
            if _repair_attempt:
                prompt = (
                    "继续同一会话中尚未完成的用户任务。上一条计划句不是最终结果；"
                    "保留已经得到的真实工具结果，依据它们决定下一步。"
                    "现在直接调用一个必要的真实 exec_command 工具；若尚未读所选 Skill 文件，"
                    "先用 cat 读取桥接 SKILL.md 以确认脚本路径与参数；不要把 Skill 名称当成 Python 包 import。"
                    "不要再复述计划、"
                    "模拟工具输出或重复没有新依据的命令。完成后核实产物并交付；"
                    "若确实受阻，只说明实际工具已验证的原因。"
                )
            if local_model not in self._ollama_models():
                raise ReasoningFrameworkError(f"本地模型 {local_model} 尚未安装完成，请稍后重试")
            if codex_local_model not in self._ollama_models():
                raise ReasoningFrameworkError(
                    f"Codex 本地模型配置 {codex_local_model} 不存在，请先创建受限上下文模型"
                )
            adapter_url = (
                os.getenv("AICHART_CODEX_GLM_ADAPTER_URL", "http://127.0.0.1:8010/local-glm/v1").strip()
                or "http://127.0.0.1:8010/local-glm/v1"
            ).rstrip("/")
            command.extend(
                [
                    "--ignore-user-config",
                    "--config",
                    'model_provider="aimechart_glm"',
                    "--config",
                    'model_providers.aimechart_glm.name="Mentora GLM tool adapter"',
                    "--config",
                    f"model_providers.aimechart_glm.base_url={json.dumps(adapter_url)}",
                    "--config",
                    'model_providers.aimechart_glm.wire_api="responses"',
                    "--enable",
                    "unified_exec",
                    "--enable",
                    "skip_host_skill_discovery",
                    "--disable",
                    "apps",
                    "--disable",
                    "plugins",
                    "--disable",
                    "plugin_sharing",
                    "--disable",
                    "remote_plugin",
                    "--disable",
                    "recommended_plugins",
                ]
            )
            # Apply this even when resuming an older thread. Otherwise a thread
            # created before this safeguard can expose collaboration tools again.
            command.extend(
                [
                    "--config",
                    'web_search="disabled"',
                    "--disable",
                    "multi_agent",
                    "--disable",
                    "multi_agent_v2",
                ]
            )
            try:
                context_window = int(os.getenv("AICHART_CODEX_OLLAMA_CONTEXT_WINDOW", "16384"))
            except ValueError:
                context_window = 16384
            context_window = max(8192, min(context_window, 16384))
            try:
                compact_limit = int(
                    os.getenv("AICHART_CODEX_OLLAMA_COMPACT_TOKEN_LIMIT", "12288")
                )
            except ValueError:
                compact_limit = 12288
            compact_limit = max(4096, min(compact_limit, context_window - 1024))
            command.extend(
                [
                    "--config",
                    f"model_context_window={context_window}",
                    "--config",
                    f"model_auto_compact_token_limit={compact_limit}",
                ]
            )
        try:
            tool_output_token_limit = int(
                os.getenv("AICHART_CODEX_TOOL_OUTPUT_TOKEN_LIMIT", "3000")
            )
        except ValueError:
            tool_output_token_limit = 3000
        tool_output_token_limit = max(1024, min(tool_output_token_limit, 8192))
        # This context-manager limit also covers direct commands and inline
        # Python which do not pass through skill_runner.
        command.extend(["--config", f"tool_output_token_limit={tool_output_token_limit}"])
        command.extend(["--config", f'model_reasoning_effort="{selected_effort}"'])
        if model:
            command.extend(["--model", model])
        for path in image_paths:
            command.extend(["--image", str(path)])
        command.append("-")
        display_model = selected_model if is_local_glm else model
        model_label = f" · {display_model}" if display_model else ""
        self._write_codex_trace(
            f"===== 新运行 | 框架: Codex | 模型: {display_model or 'Codex 默认模型'} | "
            f"会话: {engine_session_id or session_key} ====="
        )
        yield "status", {"message": f"已连接 Codex{model_label}", "phase": "codex-connect", "lang": "zh-CN"}
        yield "agent_event", {
            "engine": FRAMEWORKS["codex"], "agent": "Codex CLI", "phase": "run", "status": "started",
            "runId": engine_session_id or session_key,
            "message": f"Codex{model_label} 开始处理用户请求",
            "lang": "zh-CN",
        }
        tool_index = 0
        observed_skills: list[str] = []
        runtime_sources: list[dict[str, str]] = []
        completed_tools: list[dict[str, Any]] = []
        codex_env = os.environ.copy()
        command_guard = (self.project_root / "scripts" / "codex-command-guard").resolve()
        if command_guard.is_dir():
            codex_env["MENTORA_CODEX_GUARD_BIN"] = str(command_guard)
            codex_env["MENTORA_REAL_PYTHON"] = sys.executable
            codex_env["BASH_ENV"] = str(command_guard / "shell-env.sh")
            codex_env["PATH"] = f"{command_guard}{os.pathsep}{codex_env.get('PATH', '')}"
        process = subprocess.Popen(
            ([sys.executable, str(Path(__file__).with_name('codex_stream_bridge.py')), *command]
             if os.getenv('AICHART_CODEX_TRANSPORT','app-server')!='exec' else command),
            cwd=self.project_root,
            env=codex_env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            start_new_session=True,
        )
        with self._active_run_guard:self._active_codex_processes[session_key]=process
        assert process.stdin is not None and process.stdout is not None
        process.stdin.write(prompt)
        process.stdin.close()
        thread_id = engine_session_id
        public_items = {}
        public_item_channels = {}
        codex_tool_indexes = {}
        answer = ""
        started = time.monotonic()
        run_timeout_seconds = self._codex_run_timeout_seconds()
        for raw_line in process.stdout:
            if time.monotonic() - started > run_timeout_seconds:
                self._terminate_codex_process(process)
                self._write_codex_trace(f"运行失败: Codex 执行超过 {run_timeout_seconds:g} 秒")
                raise ReasoningFrameworkError("Codex 执行超时")
            try:
                event = json.loads(raw_line)
            except json.JSONDecodeError:
                continue
            event_type = str(event.get("type") or "")
            if event_type=='model_activity':
                yield 'model_activity',{'phase':event.get('phase')}
                continue
            if event_type=='agent_message.delta':
                public_item=event.get('item') or {}
                item_id=str(public_item.get('id') or 'codex-live')
                delta=str(public_item.get('delta') or '')
                delta_channel = str(public_item.get('channel') or public_item.get('phase') or '')
                if delta_channel:
                    public_item_channels[item_id] = 'final' if delta_channel in {'final','final_answer'} else delta_channel
                if delta:
                    public_items[item_id]=public_items.get(item_id,'')+delta
                    if public_item_channels.get(item_id)=='commentary':
                        yield 'progress',dict(blockId=item_id,text=public_items[item_id],kind='commentary')
                    else:
                        yield 'answer_text',dict(blockId=item_id,delta=delta,live=True,final=False)
                continue
            if event_type == "thread.started":
                thread_id = str(event.get("thread_id") or thread_id)
                self._write_codex_trace(f"Codex 线程已启动: {thread_id}")
            item = event.get("item") if isinstance(event.get("item"), dict) else {}
            if event_type in {"item.started", "item.completed"}:
                self._trace_codex_event(event_type, item, show_local_reasoning=is_local_glm)
            if event_type=='item.started' and item.get('type') not in {'agent_message','reasoning','error'}:
                key=str(item.get('id') or f'tool-{tool_index+1}')
                tool_index+=1;codex_tool_indexes[key]=tool_index
                started_tool=self._codex_tool_event(item,tool_index,self.project_root)
                started_tool['phase']='started'
                yield 'tool_step',started_tool
            if event_type == "item.completed" and item.get("type") not in {"agent_message", "reasoning", "error"}:
                completed_tools.append(item)
                key=str(item.get('id') or f'tool-{tool_index+1}')
                if key not in codex_tool_indexes:
                    tool_index+=1;codex_tool_indexes[key]=tool_index
                tool_event = self._codex_tool_event(item, codex_tool_indexes[key], self.project_root)
                if item.get('status') in {'failed','declined'}:tool_event['phase']='failed'
                if not tool_event.get("thoughtSummary"):
                    tool_event["thoughtSummary"] = self._jev_tool_thought_summary(
                        str(tool_event.get("script") or ""), item.get("command") or tool_event.get("params") or []
                    )
                yield "tool_step", tool_event
                tool_output = item.get("aggregated_output") or item.get("output") or ""
                # Generated HTML is the renderer input. Publish it through the
                # StreamViz protocol while the agent continues working; no
                # separate StreamViz skill or registration command is needed.
                for module in self._html_modules_from_tool_output(tool_output):
                    yield "module", module
                runtime_sources.extend(self._sources_from_value(tool_output))
                command_text = item.get("command")
                if isinstance(command_text, list):
                    command_text = " ".join(str(part) for part in command_text)
                for skill_name in re.findall(r"(?:app|\.agents)/skills/([^/\s'\"]+)", str(command_text or "")):
                    if skill_name not in observed_skills:
                        observed_skills.append(skill_name)
            if event_type in {"item.started", "item.updated", "item.completed"} and item.get("type") == "agent_message" and item.get("channel") not in {"analysis", "reasoning"}:
                item_id = str(item.get("id") or f"codex-message-{len(public_items)}")
                text = str(item.get("text") or "")
                channel = 'final' if item.get('channel') in {'final','final_answer'} else str(item.get('channel') or '')
                previous_channel = public_item_channels.get(item_id, '')
                if text and (text != public_items.get(item_id) or channel != previous_channel):
                    public_items[item_id] = text
                    if channel == 'commentary':
                        yield 'answer_text', {'blockId':item_id,'discard':True}
                        yield 'progress', {'blockId':item_id,'text':text,'kind':'commentary'}
                    else:
                        yield "answer_text", {"blockId": item_id, "text": text, "replace": True, "live": True, "final": False}
                if channel:
                    public_item_channels[item_id] = channel
                if channel != "commentary":answer = text or answer
            if event_type == "turn.failed":
                error = event.get("error") if isinstance(event.get("error"), dict) else {}
                message = str(error.get("message") or "Codex 执行失败")
                self._write_codex_trace(f"运行失败: {self._codex_trace_text(message)}")
                raise ReasoningFrameworkError(message)
        return_code = process.wait(timeout=5)
        with self._active_run_guard:
            if self._active_codex_processes.get(session_key) is process:self._active_codex_processes.pop(session_key,None)
        if return_code != 0:
            self._write_codex_trace(f"运行失败: Codex 进程异常退出（{return_code}）")
            raise ReasoningFrameworkError(f"Codex 进程异常退出（{return_code}）")
        if not answer:
            self._write_codex_trace("运行失败: Codex 未返回最终回答")
            raise ReasoningFrameworkError("Codex 未返回最终回答")
        if is_local_glm:
            chart_requested = bool(re.search(
                r"(?:画|生成|制作|绘制|创建|渲染|导出|做|给我).{0,24}(?:图|chart|K\s*线)"
                r"|(?:K\s*线图|kline|周线图|日线图|走势图)",
                question, flags=re.I,
            ))
            has_chart_marker = bool(re.search(r"\[\[AIME_CHART:[^\]\n]+\.html\]\]", answer))
            pseudo_tool_call = bool(re.search(
                r'["\']name["\']\s*:\s*["\'](?:exec_command|functions\.exec)["\']', answer
            ))
            fabricated_tool_output = bool(re.search(
                r"(?im)^\s*(?:Chunk ID:|Process exited with code|Original token count:|Output:)"
                r"|</think>", answer,
            ))
            plan_only = bool(re.match(
                r"\s*(?:我将|接下来(?:我)?(?:会|将)|I(?:'ll| will)|I'm going to)",
                answer, flags=re.I,
            ))
            missing_script_claim = bool(re.search(
                r"脚本.{0,80}(?:不存在|找不到|缺失)|无法找到.{0,40}脚本"
                r"|script.{0,80}(?:missing|not found)", answer, flags=re.I,
            ))
            existing_scripts: list[Path] = []
            if missing_script_claim:
                for script_name in set(re.findall(r"\b[A-Za-z_][A-Za-z0-9_]*\.py\b", answer)):
                    existing_scripts.extend(
                        (self.project_root / "app" / "skills").glob(f"*/scripts/{script_name}")
                    )
            if pseudo_tool_call or fabricated_tool_output:
                issue = "模型把未执行的工具调用或模拟输出写进了回答"
            elif existing_scripts:
                paths = ", ".join(str(path.relative_to(self.project_root)) for path in existing_scripts[:3])
                issue = f"模型声称脚本不存在，但项目中实际存在：{paths}"
            elif has_chart_marker and not completed_tools:
                issue = "模型引用了图表，但本轮没有真实工具执行记录"
            elif plan_only or (chart_requested and not has_chart_marker):
                issue = "模型只返回执行计划或没有交付请求的图表"
            else:
                issue = ""
            if issue:
                self._write_codex_trace(f"本地模型结果未通过真实工具证据核对: {issue}")
                retryable_failures = bool(completed_tools) and all(
                    str(item.get("status") or "").lower() == "failed"
                    and re.search(
                        r"command not found|no such file or directory|can't open file",
                        str(item.get("aggregated_output") or item.get("output") or ""),
                        flags=re.I,
                    )
                    for item in completed_tools
                )
                if not _repair_attempt and thread_id and (not completed_tools or retryable_failures):
                    yield "status", {
                        "message": "本地模型尚未完成工具步骤，正在续接同一会话",
                        "phase": "codex-repair", "lang": "zh-CN",
                    }
                    yield from self._stream_codex(
                        question, [], session_key, thread_id, [], inference_model,
                        reasoning_effort=selected_effort,
                        _repair_attempt=1,
                        visualization_guidance=visualization_guidance,
                    )
                    return
                raise ReasoningFrameworkError(f"本地模型未完成可信的工具执行：{issue}。请重试或切换模型。")
        if public_items and os.getenv('AICHART_CODEX_TRANSPORT','app-server')!='exec':
            final_items=[text for key,text in public_items.items() if public_item_channels.get(key)=='final']
            if final_items:answer='\n\n'.join(final_items)
        if observed_skills:
            answer = re.sub(r"(?m)^\s*\[\[AIME_SKILLS:[^\]\n]+\]\]\s*$", "", answer).rstrip()
            answer += f"\n\n[[AIME_SKILLS:{','.join(observed_skills)}]]"
        if not public_items:
            yield from self._answer_text_events(answer)
        elif not any(channel=='final' for channel in public_item_channels.values()):
            key=next((key for key in reversed(public_items) if public_item_channels.get(key)!='commentary'),'codex-final')
            yield 'answer_text',{'blockId':key,'text':answer,'replace':True,'live':True,'final':True}
        run_id = f"codex-{thread_id or session_key}"
        self._write_codex_trace(f"===== 运行完成 | runId: {run_id} =====")
        yield "agent_event", {
            "engine": FRAMEWORKS["codex"], "agent": "Codex CLI", "phase": "run", "status": "completed",
            "runId": run_id, "message": "Codex 已完成", "lang": "zh-CN",
        }
        yield "final", self._artifact_payload(
            "codex",
            question,
            answer,
            run_id,
            thread_id,
            runtime_sources,
            inference_model=selected_model or model,
        )

    def _stream_deepseek(
        self,
        question: str,
        images: list[Any],
        session_key: str,
        engine_session_id: str,
        history: list[dict[str, Any]],
        inference_model: str = "",
        reasoning_effort: str = "",
        visualization_guidance: str = "",
        _repair_attempt: int = 0,
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        self._add_deepseek_sdk_path()
        selected_model = inference_model.strip() or os.getenv("AICHART_DEEPSEEK_MODEL", "deepseek-flash")
        selected_reasoning_effort = str(reasoning_effort or "").strip().lower()
        supported_reasoning_efforts = {"low", "medium", "high", "xhigh", "ultra"}
        if selected_reasoning_effort not in supported_reasoning_efforts:
            selected_reasoning_effort = os.getenv("AICHART_DEEPSEEK_REASONING_EFFORT", "low").strip().lower()
        harness_reasoning_effort = selected_reasoning_effort
        if selected_model == "deepseek-flash":
            harness_reasoning_effort = {
                "low": "low",
                "medium": "high",
                "high": "high",
                "xhigh": "high",
                "ultra": "max",
            }[selected_reasoning_effort]
        local_model = os.getenv("AICHART_OLLAMA_MODEL", "haervwe/GLM-4.6V-Flash-9B:latest").strip() or "haervwe/GLM-4.6V-Flash-9B:latest"
        try:
            from deepseek_harness import DeepSeekHarness
        except ImportError:
            DeepSeekHarness = None
        image_paths = self._save_images("deepseek", session_key, images)
        prompt = self._prompt(
            "deepseek", question, image_paths, history,
            visualization_guidance=visualization_guidance,
        )
        prompt += (
            "\n\n本 Harness 没有 commentary/final 文本通道，普通 assistant text 会立即作为答案显示。"
            "公开执行进度必须使用原生 report_progress(summary=一句用户语言的行动摘要) 工具，"
            "不得把‘我先确认…’等计划或工具间进度写在普通 assistant text 中，也不要把摘要重复到答案。"
            "例如告知‘我先确认取数口径’时应调用 report_progress，而不是先输出一句普通文本再调用工具。"
            "已有工具的 description/title 可以说明当前动作，无需为每次工具调用额外调用 report_progress。"
            "只有确有独立进度需要告知时才使用；不包含内部推理、分析结论、命令、路径或原始工具结果。"
            "有依据的结论和解读直接作为普通答案文本输出；图文可以交错，之后调用工具也不会把正文移到思考区。"
        )
        prompt += (
            "\n\n工程执行建议：完整理解本轮问题和历史约束，由你决定研究范围、工具、步骤、"
            "图表及回答结构。不要套用固定市场报告模板或因轻度档删减用户要求。"
            "已核验且时效仍有效的同轮数据和执行契约可复用；相互独立的工作可并行，"
            "存在依赖的工作按顺序执行。根据真实结果继续推理、补证或修正，"
            "证据和交付均满足用户要求后再结束。"
            "外部地址应在一次批处理中并发请求，单个来源最多等待 10 秒、整批最多 30 秒；"
            "首次出现 network unreachable 后立即停止同类直连，不要换域名反复试探。"
            "后台命令只允许短轮询，job_output 的单次等待不得超过 8 秒，避免连续阻塞轮询；"
            "没有新输出时继续其他可执行工作或等待异步完成通知。"
            "结构化数据和超过约 4,000 字符的工具结果使用 fullOutputPath 文件交接，"
            "后续工具直接读取文件；不要把完整内容重新复制进推理上下文。"
            "所有任务在取证前先根据用户问题定义‘最小充分证据条件’；"
            "条件一旦满足即锁定研究，禁止再搜索、打开新数据源或为增加置信感重复取证。"
            "研究锁定后，只允许一次确定性汇总计算、一次 HTML 渲染（若任务需要）和一次有界验证，然后立即回答。"
            "任一工具失败后最多允许一条实质不同的替代路线；"
            "若现有可用证据已足以支撑结论，则直接披露缺失和影响，不得继续尝试新工具或新来源。"
            "若最小充分证据需要多个独立联网角度，把查询写入一个 JSON queries 数组，"
            "通过 external_info_search.py --queries-file 一次并行执行；不要逐条串行搜索。"
            "通用可视化只选 streamviz 一个展示 Skill；HTML 报告优先用 visualize_show_widget 原生流式生成并自动保存文件；已有结构化 payload 可用内置布局模板；"
            "不要再加载 custom-html-widget 或手写 HTML，除非用户明确要求定制版式或模板确实无法表达。"
            "默认只执行一次自动布局检查；只有检查返回具体缺陷时才读取截图、修复并复验。"
        )
        if selected_reasoning_effort == "low":
            prompt += (
                "\n\n轻度档执行约束：保持通用 Agent 判断，但采用最短的充分证据路径。"
                "宿主候选已经完成能力发现；命中候选时直接通过 skill_runner 各读取一次 contract，"
                "随后批量执行，不再调用 skill/read/--help/grep/sed 查看同一能力的桥接、源码或参数。"
                "完整批量请求优先于小样本探测；主数据源成功后不要再用等价来源重复核验。"
                "大型工具结果的完整内容由宿主保存到 fullOutputPath；推理只使用回执中的 summary，"
                "后续计算和渲染直接传该文件路径，禁止 cat、read 或把完整数组重新放回上下文。"
                "只有用户明确询问原因、新闻或外部证据，或者结构化数据仍缺少结论所需的关键事实时，才调用联网搜索。"
                "某个非关键字段或次要口径不可得时，披露限制并继续完成其余答案，不要连续尝试多个替代入口。"
                "使用 code_interpreter 时，首次执行就写一个确定性的 transform(raw_data, question) 文件并传 "
                "--transform-file；文件只含这一个顶层函数，全部逻辑写在函数内，不写 import、辅助函数或 lambda；"
                "结构化结果传 --payload-output。禁止让该工具再调用辅助模型生成代码，也不要读取其实现。"
                "工具回执已经证明结果或产物有效后，立即进入回答；不要列目录、重读生成文件或为了格式再次渲染。"
                "这些约束只减少重复发现和重复取证，不缩减用户要求的分析、图表或文件交付。"
            )
        dsh_home = Path(os.getenv("AICHART_DSH_HOME", os.getenv("DSH_HOME", "~/.dsh"))).expanduser()
        if not dsh_home.is_absolute():
            dsh_home = self.project_root / dsh_home
        dsh_home = dsh_home.resolve()
        dsh_home.mkdir(parents=True, exist_ok=True)
        runtime_cwd = (dsh_home / "runtime").resolve()
        runtime_cwd.mkdir(parents=True, exist_ok=True)
        if DeepSeekHarness is None:
            raise ReasoningFrameworkConfigurationError('真实流式输出需要 DeepSeek Harness Python SDK；当前未安装，已停止执行，不回退为整段缓冲输出。')
        options: dict[str, Any] = {
            "provider": os.getenv("AICHART_DEEPSEEK_PROVIDER", "deepseek-official"),
            "model": selected_model,
            "cwd": str(self.project_root),
            "runtime_cwd": str(runtime_cwd),
            "dsh_home": str(dsh_home),
            "request_timeout_seconds": self._deepseek_timeout_seconds(),
            "patches": (
                str(self.project_root / "app" / "dsh_tool_environment.cordis.yml"),
                str(self.project_root / "app" / "dsh_lightweight.cordis.yml"),
            ),
            "env": {
                "MENTORA_PROJECT_ROOT": str(self.project_root),
                "MENTORA_TOOL_ENV_KEYS": os.getenv("AICHART_TOOL_ENV_KEYS", ""),
            },
        }
        if selected_reasoning_effort in supported_reasoning_efforts:
            options["reasoning_effort"] = harness_reasoning_effort
        max_tokens = os.getenv("AICHART_DEEPSEEK_MAX_TOKENS", "32768").strip()
        if max_tokens:
            try:
                options["max_tokens"] = max(4096, int(max_tokens))
            except ValueError:
                pass
        if selected_model == local_model:
            if local_model not in self._ollama_models():
                raise ReasoningFrameworkError(f"本地模型 {local_model} 尚未安装完成，请稍后重试")
            options.update(
                {
                    "base_url": f"{self._ollama_base_url()}/v1",
                    "api_key": os.getenv("AICHART_OLLAMA_API_KEY", "ollama"),
                }
            )
        requested_session_id = str(engine_session_id or session_key or "").strip() or f"session-{uuid.uuid4().hex}"
        # A Harness keeps its launch configuration. Separate effort profiles so
        # changing the slider cannot reuse a process with different model options.
        requested_harness_key = f"{requested_session_id}::{selected_model}::{selected_reasoning_effort}"
        with self._deepseek_harness_guard:
            cached = requested_harness_key in self._deepseek_harnesses
        session_root = dsh_home / "sessions"
        # DSH persistence currently writes session.v4.jsonl.zstd (older builds
        # used session.jsonl*). A server restart drops the in-memory Harness,
        # so reusing either on-disk id makes the runtime reject the new run as
        # "session already exists". Keep conversation history in our prompt,
        # but allocate a fresh engine session for the replacement Harness.
        if not cached and any(session_root.glob(f"*/{requested_session_id}/session*.jsonl*")):
            requested_session_id = f"session-{uuid.uuid4().hex}"
        harness_key = f"{requested_session_id}::{selected_model}::{selected_reasoning_effort}"
        with self._active_run_guard:self._active_deepseek_runs[session_key]=harness_key
        yield "status", {
            "message": f"正在连接 DeepSeek Harness · {selected_model}",
            "phase": "deepseek-connect",
            "lang": "zh-CN",
        }
        yield "agent_event", {
            "engine": FRAMEWORKS["deepseek"], "agent": "Root Agent", "phase": "run", "status": "started",
            "runId": session_key, "message": f"DeepSeek Harness 使用 {selected_model} 开始处理", "lang": "zh-CN",
        }
        html_events=HtmlRenderEvents(self.project_root,harness_key)
        options['env']['MENTORA_STREAMVIZ_EVENTS']=str(html_events.path)
        notifications: queue.Queue[Any] = queue.Queue()
        result_box: list[Any] = []
        error_box: list[BaseException] = []

        def run_harness() -> None:
            try:
                harness, run_lock = self._deepseek_harness(DeepSeekHarness, harness_key, options)
                with run_lock:
                    result_box.append(
                        harness.run(prompt, session_id=requested_session_id, on_notification=notifications.put)
                    )
            except BaseException as exc:  # surfaced on the request thread below
                error_box.append(exc)

        worker = threading.Thread(target=run_harness, daemon=True)
        worker.start()
        tool_index = 0
        runtime_sources: list[dict[str, str]] = []
        tool_context_by_call_id: dict[str, dict[str, Any]] = {}
        usage_totals = {"input": 0, "cached": 0, "output": 0, "reasoning": 0}
        pending_public_text = ""
        public_stream = PublicStream('deepseek')
        parallel_widgets = ParallelWidgets(self.generated_dir)
        with self._active_run_guard:self._active_widget_runs[session_key]=parallel_widgets
        activity=ToolActivitySession(self._tool_activity_router,self._tool_activity_cache,self._tool_activity_guard)
        public_channels=PublicTextChannelSession(question=question)

        def activity_updates(*,final=False):
            for key,text,semantics in public_channels.drain():
                yield from parallel_widgets.hold(public_stream.classify_progress(key,text,semantics))
            updates=dict(activity.drain())
            if final:
                for call_id,context in tool_context_by_call_id.items():
                    if context.get('activitySemantics',{}).get('status')=='pending' and call_id not in updates:
                        updates[call_id]=dict(provider='host',status='fallback',reason='classification-not-ready')
            for call_id,semantics in updates.items():
                context=tool_context_by_call_id.get(call_id)
                if not context or not context.get('lastToolStep'):continue
                context['activitySemantics']=semantics
                summary=self._tool_activity_summary(semantics,question,context.get('fallbackThought',''))
                context['thoughtSummary']=summary
                step={**context['lastToolStep'],'thoughtSummary':summary,'activitySemantics':semantics,'semanticUpdate':True}
                context['lastToolStep']=step
                yield 'tool_step',step
        latest_progress_summary = ""
        started_at = time.monotonic()
        run_timeout = self._deepseek_run_timeout_seconds()
        try:
            while worker.is_alive() or not notifications.empty() or parallel_widgets.active:
                if parallel_widgets.stopped.is_set():raise ReasoningFrameworkError('已停止生成')
                if error_box:raise ReasoningFrameworkError(f'DeepSeek Harness 调用失败：{error_box[0]}')
                yield from parallel_widgets.drain()
                yield from html_events.poll()
                yield from activity_updates()
                try:
                    notification = notifications.get(timeout=0.25)
                except queue.Empty:
                    if time.monotonic() - started_at >= run_timeout:
                        activity.close()
                        self._drop_deepseek_harness(harness_key)
                        raise ReasoningFrameworkTimeout(run_timeout)
                    continue
                method = str(getattr(notification, "method", "") or "")
                payload = getattr(notification, "payload", {})
                if method == 'mentora.public-stream':
                    if str(payload.get('sessionId') or '') == requested_session_id:
                        frame=payload.get('frame') or {}
                        if frame.get('type')=='start':
                            public_stream.begin(frame.get('attemptId','live'))
                            yield 'model_activity',{'phase':'started'}
                        elif frame.get('type')=='chunk':
                            chunk=frame.get('chunk') or {}
                            channel=chunk.get('channel') or chunk.get('phase') or frame.get('channel') or frame.get('phase')
                            yield from parallel_widgets.hold(public_stream.chunk({**chunk,**({'channel':channel} if channel else {})}))
                        elif frame.get('type')=='end':yield 'model_activity',{'phase':'completed'}
                    continue
                event = payload.get("event") if method == "session.event" and isinstance(payload, dict) else None
                if isinstance(event, dict):
                    event_type = str(event.get("type") or "")
                else:
                    event_type = ""
                if event_type == "assistant/chunk":
                    event_data = event.get("data") if isinstance(event.get("data"), dict) else {}
                    chunk = event_data.get("chunk") if isinstance(event_data.get("chunk"), dict) else {}
                    if str(payload.get('sessionId') or requested_session_id)==requested_session_id and event_data.get('channel') not in {'analysis','reasoning'}:
                        yield from parallel_widgets.hold(public_stream.chunk({**chunk,**({'channel':event_data['channel']} if event_data.get('channel') else {})}))
                    usage = chunk.get("usage") if chunk.get("type") == "usage" and isinstance(chunk.get("usage"), dict) else {}
                    if usage:
                        try:
                            usage_totals["input"] += max(0, int(usage.get("inputTokens") or 0))
                            usage_totals["cached"] += max(0, int(usage.get("cacheReadTokens") or 0))
                            usage_totals["output"] += max(0, int(usage.get("outputTokens") or 0))
                            usage_totals["reasoning"] += max(0, int(usage.get("reasoningTokens") or 0))
                        except (TypeError, ValueError):
                            pass
                elif event_type in {"tool/call", "tool/result", "todo/write"}:
                    if str(payload.get('sessionId') or requested_session_id)!=requested_session_id:
                        continue
                    tool_data=event.get('data') if isinstance(event.get('data'),dict) else {}
                    progress_events=public_stream.progress_event(event_type,tool_data)
                    if progress_events is not None:
                        yield from progress_events
                        continue
                    if event_type == "tool/call" and pending_public_text:
                        latest_progress_summary = self._localized_progress(pending_public_text, question)
                        if latest_progress_summary:
                            yield "progress", {"text": latest_progress_summary}
                        pending_public_text = ""
                    tool_index += 1
                    data = event.get("data") if isinstance(event.get("data"), dict) else {}
                    runtime_sources.extend(self._sources_from_value(data))
                    call_id = str(data.get("callId") or "")
                    message = data.get("message") if isinstance(data.get("message"), dict) else {}
                    source = message.get("source") if isinstance(message.get("source"), dict) else {}
                    result_call_id = str(message.get("toolCallId") or source.get("callId") or "")
                    arguments = data.get("arguments") or data.get("input") or data.get("todos") or []
                    display_arguments = arguments
                    phase = "started"
                    activity_semantics={}
                    if event_type == "tool/call":
                        name = str(data.get("name") or data.get("tool") or "工具")
                        fallback_thought = self._localized_tool_summary(question,
                            data.get("thoughtSummary"), data.get("thought_summary"), latest_progress_summary,
                            data.get("title"), data.get("description"),self._jev_tool_thought_summary(name,arguments)
                        )
                        latest_progress_summary = ""
                        activity_semantics=activity.request(call_id,name,self._tool_activity_arguments(arguments))
                        thought_summary=self._tool_activity_summary(activity_semantics,question,fallback_thought)
                        file_change = self._deepseek_write_context(name, arguments)
                        if file_change:
                            display_arguments = file_change["displayArguments"]
                        if call_id:
                            tool_context_by_call_id[call_id] = {
                                "name": name,
                                "arguments": arguments,
                                "displayArguments": display_arguments,
                                "fileChange": file_change,
                                "thoughtSummary": thought_summary,
                                "fallbackThought": fallback_thought,
                                "activitySemantics": activity_semantics,
                            }
                    elif event_type == "tool/result":
                        context = tool_context_by_call_id.get(result_call_id, {})
                        name = str(context.get("name") or "工具")
                        arguments = context.get("arguments") or arguments
                        display_arguments = context.get("displayArguments") or arguments
                        activity_semantics=context.get('activitySemantics',{})
                        thought_summary=context.get('thoughtSummary','')
                        phase = "failed" if message.get("isError") else "completed"
                    else:
                        name = "任务计划"
                        thought_summary = self._localized_tool_summary(question,
                            data.get("thoughtSummary"), data.get("thought_summary"), data.get("title"), data.get("description")
                        )
                        phase = "started"
                    # A call envelope describes a pending invocation, not a result.
                    # Native results carry text blocks in message.content; don't
                    # expose transport metadata or image bytes as the observation.
                    observation = ""
                    if event_type == "tool/result":
                        observation = data.get("result") or data.get("output") or data.get("content")
                        if observation is None:
                            blocks = message.get("content") or []
                            observation = "\n".join(str(block.get("text") or "") for block in blocks
                                                    if isinstance(block, dict) and block.get("type") == "text")
                    params_text = display_arguments if isinstance(display_arguments, str) else json.dumps(display_arguments, ensure_ascii=False)
                    tool_step = {
                        "index": tool_index, "total": tool_index, "tool": name, "script": name,
                        "code": "DSH", "lang": "zh-CN",
                        "params": [params_text[:3000]] if arguments else [],
                        "observation": (observation if isinstance(observation, str) else json.dumps(observation, ensure_ascii=False))[:5000],
                        "phase": phase,
                        "callId": call_id or result_call_id or f"deepseek-tool-{tool_index}",
                        "thoughtSummary": thought_summary,
                        "activitySemantics": activity_semantics,
                    }
                    if event_type == "tool/result" and phase == "completed":
                        file_change = self._deepseek_file_change(context, observation)
                        if file_change:
                            tool_step["fileChanges"] = [file_change]
                    step_context=tool_context_by_call_id.get(call_id or result_call_id)
                    if step_context is not None:step_context['lastToolStep']=tool_step
                    yield "tool_step", tool_step
                    if event_type == "tool/result":
                        yield from html_events.poll()
                        if name==WIDGET_TOOL:
                            if phase=='failed':
                                yield 'visualization',dict(id=result_call_id,discard=True,final=True,native=True)
                                continue
                            try:receipt=json.loads(observation) if isinstance(observation,str) else observation
                            except (ValueError,TypeError):receipt={}
                            if isinstance(receipt,dict) and parallel_widgets.start(result_call_id,arguments,receipt):continue
                            for module in self._html_modules_from_tool_output(observation):
                                public_stream.artifacts.append(dict(url=module['htmlUrl'],path=str(self.generated_dir/Path(module['htmlUrl']).name),label=module.get('label',''),streamvizSource='native-streamviz'))
                                yield 'visualization',dict(id=result_call_id,toolName=WIDGET_TOOL,htmlUrl=module['htmlUrl'],title=module.get('label',''),native=True,live=True,final=True)
                        else:
                            for module in self._html_modules_from_tool_output(observation):
                                yield "module", module
                elif event_type == "assistant/message" and str(payload.get("sessionId") or requested_session_id) == requested_session_id:
                    data = event.get("data") if isinstance(event.get("data"), dict) else {}
                    message = data.get("message") if isinstance(data.get("message"), dict) else data
                    if not (message.get('channel') or message.get('phase')) and (data.get('channel') or data.get('phase')):
                        message={**message,'channel':data.get('channel') or data.get('phase')}
                    yield from parallel_widgets.hold(public_stream.message(message))
                    for key,text in public_stream.channel_candidates:
                        public_channels.request(key,text)
                    public_stream.channel_candidates.clear()
                elif method in {"subagent.started", "subagent.finished"}:
                    yield "agent_event", {
                        "engine": FRAMEWORKS["deepseek"],
                        "agent": "Subagent",
                        "phase": "run",
                        "status": "started" if method.endswith("started") else "completed",
                        "runId": requested_session_id,
                        "message": "DeepSeek 子智能体已启动" if method.endswith("started") else "DeepSeek 子智能体已完成",
                        "lang": "zh-CN",
                    }
            yield from parallel_widgets.drain()
            yield from html_events.poll()
            yield from activity_updates(final=True)
        finally:
            activity.close()
            public_channels.close()
            parallel_widgets.close()
            with self._active_run_guard:
                self._active_widget_runs.pop(session_key,None)
                if self._active_deepseek_runs.get(session_key)==harness_key:self._active_deepseek_runs.pop(session_key,None)
            if worker.is_alive():self._drop_deepseek_harness(harness_key)
        worker.join()
        with self._active_run_guard:
            if self._active_deepseek_runs.get(session_key)==harness_key:self._active_deepseek_runs.pop(session_key,None)
        if error_box:
            raise ReasoningFrameworkError(f"DeepSeek Harness 调用失败：{error_box[0]}")
        if not result_box:
            raise ReasoningFrameworkError("DeepSeek Harness 未返回结果")
        result = result_box[0]
        answer = str(getattr(result, "final_response", "") or "")
        if not answer:
            failure_message = ""
            for event in reversed(getattr(result, "events", []) or []):
                if not isinstance(event, dict):
                    continue
                data = event.get("data") if isinstance(event.get("data"), dict) else {}
                reason = data.get("reason") if isinstance(data.get("reason"), dict) else {}
                error = reason.get("error") if isinstance(reason.get("error"), dict) else {}
                failure = reason.get("failure") if isinstance(reason.get("failure"), dict) else {}
                failure_message = str(error.get("message") or failure.get("message") or "").strip()
                if failure_message:
                    break
            detail = f"：{failure_message}" if failure_message else ""
            raise ReasoningFrameworkError(f"DeepSeek Harness 未返回结果{detail}")
        public_stream.artifacts.extend(html_events.artifacts)
        public_stream.artifacts.extend(parallel_widgets.artifacts)
        if not public_stream.artifacts and self._requires_html_deliverable(question) and not re.search(
            r"\[\[AIME_CHART:[^\]\n]+\.html\]\]", answer
        ):
            if _repair_attempt < 1:
                self._drop_deepseek_harness(harness_key)
                yield "status", {
                    "message": "数据阶段已完成，正在继续生成并验证 HTML 交付文件",
                    "phase": "html-deliverable-repair",
                    "lang": "zh-CN",
                }
                repair_guidance = (
                    f"{visualization_guidance}\n\n" if visualization_guidance else ""
                ) + (
                    "交付完整性修复：上一阶段已完成数据获取和计算，但未生成用户明确要求的最终 HTML。"
                    "复用工作区中本轮已生成的中间数据，优先通过 visualize_show_widget 完成 streamviz 展示并保存文件；不要重新取数或先拼完整 html 包装文件。"
                    "必须生成、验证一个 outputs/generated 下的完整可交互 HTML，并在最终回答中同时交付 "
                    "[[AIME_CHART:绝对路径]] 和 [[AIME_FILE:绝对路径]]。不得再以‘将生成’、‘页面将展示’等未完成描述结束。"
                )
                yield from self._stream_deepseek(
                    question,
                    [],
                    session_key,
                    "",
                    history,
                    inference_model,
                    reasoning_effort,
                    repair_guidance,
                    _repair_attempt=1,
                )
                return
            raise ReasoningFrameworkError(
                "Agent 完成了数据阶段，但未生成用户要求的 HTML 交付文件，本轮不能标记为完成。"
            )
        # Only emit a provider fallback if its public chunks were unavailable.
        yield from public_stream.finish(answer)
        answer = public_stream.transcript(answer)
        actual_session_id = str(getattr(result, "session_id", "") or requested_session_id)
        if selected_model != local_model and any(usage_totals.values()):
            try:
                COSTS.record(
                    provider="deepseek", service="Mentora 对话", operation="DeepSeek Harness 推理",
                    model=selected_model,
                    input_tokens=usage_totals["input"] + usage_totals["cached"],
                    cached_input_tokens=usage_totals["cached"], output_tokens=usage_totals["output"],
                    reasoning_tokens=usage_totals["reasoning"], conversation_id=session_key,
                    conversation_title=question,
                    metadata={"engineSessionId": actual_session_id, "reasoningEffort": selected_reasoning_effort},
                )
            except Exception:
                pass
        run_id = f"deepseek-{actual_session_id}"
        yield "agent_event", {
            "engine": FRAMEWORKS["deepseek"], "agent": "Root Agent", "phase": "run", "status": "completed",
            "runId": run_id, "message": f"DeepSeek Harness · {selected_model} 已完成", "lang": "zh-CN",
        }
        runtime_sources.extend(self._sources_from_value(vars(result) if hasattr(result, "__dict__") else {}))
        final_payload = self._artifact_payload(
            "deepseek", question, answer, run_id, actual_session_id, runtime_sources, selected_model
        )
        if public_stream.artifacts:
            existing={item['url'] for item in final_payload['reportArtifacts']}
            final_payload['reportArtifacts'].extend(item for item in public_stream.artifacts if item['url'] not in existing)
            final_payload['reportUrl']=final_payload['reportUrl'] or public_stream.artifacts[0]['url']
            from app.file_artifacts import collect_file_artifacts
            files,_=collect_file_artifacts(question,'',public_stream.artifacts,self.generated_dir,self.project_root,allow_html=True)
            present={item['url'] for item in final_payload.get('fileArtifacts',[])}
            final_payload.setdefault('fileArtifacts',[]).extend(item for item in files if item['url'] not in present)
        yield 'final',final_payload

    def _drop_deepseek_harness(self, session_id: str) -> None:
        with self._deepseek_harness_guard:
            harness = self._deepseek_harnesses.pop(session_id, None)
            self._deepseek_session_locks.pop(session_id, None)
        if harness is not None:
            try:
                harness.close()
            except Exception:
                pass

    def _deepseek_harness(
        self, harness_type: Any, session_id: str, options: dict[str, Any]
    ) -> tuple[Any, threading.Lock]:
        with self._deepseek_harness_guard:
            harness = self._deepseek_harnesses.get(session_id)
            if harness is None:
                harness = harness_type(**options)
                self._deepseek_harnesses[session_id] = harness
                self._deepseek_session_locks[session_id] = threading.Lock()
            return harness, self._deepseek_session_locks[session_id]

    def close(self) -> None:
        with self._deepseek_harness_guard:
            harnesses = list(self._deepseek_harnesses.values())
            self._deepseek_harnesses.clear()
            self._deepseek_session_locks.clear()
        for harness in harnesses:
            try:
                harness.close()
            except Exception:
                pass
