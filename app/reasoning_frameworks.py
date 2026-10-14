from __future__ import annotations

import base64
import importlib.util
import ipaddress
import json
import os
import queue
import re
import signal
import shutil
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import replace
from pathlib import Path
from typing import Any, Iterator
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlsplit

from dotenv import load_dotenv

from app.jev_tool_activity_router import JevToolActivityRouter, JevToolActivityRouterError
from app.jev_visualization_router import JevVisualizationDecision, JevVisualizationRouter, JevVisualizationRouterError
from app.business_chart_dependency import load_registry_data


class ReasoningFrameworkError(RuntimeError):
    pass


FRAMEWORKS = {
    "deepseek": "DeepSeek Harness",
    "codex": "Codex",
}


class LocalAgentFrameworks:
    """Adapters that normalize local agent runtimes to Veya's SSE contract."""

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
        self._tool_activity_guard = threading.Lock()
        self._tool_activity_cache: dict[str, str] = {}
        load_dotenv(self.project_root / ".env", override=False)
        self._visualization_router = visualization_router or JevVisualizationRouter()
        self._tool_activity_router = tool_activity_router or JevToolActivityRouter()

    def availability(self) -> dict[str, dict[str, Any]]:
        codex_bin = os.getenv("AICHART_CODEX_BIN", "codex")
        codex_ready = bool(shutil.which(codex_bin) or Path(codex_bin).is_file())
        self._add_deepseek_sdk_path()
        deepseek_ready = importlib.util.find_spec("deepseek_harness") is not None or bool(self._dsh_bin())
        return {
            "deepseek": {
                "label": FRAMEWORKS["deepseek"],
                "available": deepseek_ready,
                "detail": "" if deepseek_ready else "需要安装 DeepSeek Harness Python SDK/Runtime",
            },
            "codex": {
                "label": FRAMEWORKS["codex"],
                "available": codex_ready,
                "detail": "" if codex_ready else "未找到 codex CLI",
            },
        }

    def inference_models(self) -> list[dict[str, Any]]:
        deepseek_model = os.getenv("AICHART_DEEPSEEK_MODEL", "deepseek-v4-flash").strip() or "deepseek-v4-flash"
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
        resolved_inference_model: str = "",
        visualization_theme: str = "light",
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        visualization_guidance, visualization_route = self._jev_visualization_plan(question)
        visualization_guidance = f"{visualization_guidance}\n\n{self._theme_visualization_guidance(visualization_theme)}".strip()
        if visualization_route and visualization_route.get("applied"):
            selected = visualization_route.get("selectedScripts") or []
            message = (
                f"JEV 已规划 {len(selected)} 个互补可视化视角"
                if selected else "JEV 判断本次回答不应强制生成图表"
            )
            yield "agent_event", {
                "engine": "TypeSafe JEV",
                "agent": "JEV Visual Semantics Router",
                "phase": "visual-route",
                "status": "completed",
                "runId": session_key,
                "message": message,
                "lang": "zh-CN",
            }
        if framework == "codex":
            events = self._stream_codex(
                question, images, session_key, engine_session_id, history or [], inference_model,
                visualization_guidance=visualization_guidance,
            )
            events = self._with_visual_route_metadata(events, visualization_route)
            yield from events
            return
        if framework == "deepseek":
            events = self._stream_deepseek(
                question, images, session_key, engine_session_id, history or [], inference_model,
                visualization_guidance=visualization_guidance,
            )
            events = self._with_visual_route_metadata(events, visualization_route)
            yield from events
            return
        raise ReasoningFrameworkError(f"不支持的推理框架：{framework}")

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
        candidates: list[dict[str, str]] = []
        for item in registry:
            if not isinstance(item, dict):
                continue
            script = Path(str(item.get("script") or "")).name
            family = family_by_script.get(script)
            if not family:
                continue
            skill_name = "business-chart-recall" if family == "business-chart" else "generic-chart"
            schema_path = (
                self.project_root / "app" / "skills" / skill_name / "schemas" / f"{Path(script).stem}.schema.json"
            )
            semantic_contract = ""
            try:
                schema = json.loads(schema_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                schema = None
            if isinstance(schema, dict):
                compact_schema = {
                    key: schema.get(key)
                    for key in ("semanticChannels", "visualChannelMappings", "modelInstructions", "payloadShape", "builtInDataSources")
                    if schema.get(key)
                }
                semantic_contract = json.dumps(compact_schema, ensure_ascii=False, separators=(",", ":"))[:900]
            description = str(item.get("description") or "")
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
            "provider": "typesafe",
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
            "candidateCount": decision.candidate_count,
        }

    @staticmethod
    def _visualization_guidance(decision: JevVisualizationDecision) -> str:
        if not decision.primary_script:
            return (
                "JEV 可视化语义计划：本次请求不应为了形式强制生成图表。"
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
            "JEV 可视化语义计划（这是组件与叙事约束，不是数据证据）：",
            f"- 主图：{decision.primary_script}；回答维度：{decision.primary_purpose or '用户问题的核心判断'}。",
        ]
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
            "- 只有在真实数据能唯一解析标记目标时才生成 marks；无法解析的日期、系列、分类、阈值或范围必须跳过，禁止猜测。",
            "- 自动模式通常保留 1–3 个关键标记并以 5 个为软默认上限；用户明确指定数量或要求全部事件时必须完整保留，并通过标签密度或交互处理拥挤。",
            "- 美股/美国上市标的优先保留业务图表的内置取数、指标口径、交互与展示逻辑；端内新闻和视频用于补充催化剂、市场叙事与观点，不得替代结构化业务证据。",
            "- 先读取对应 Skill、schema 与 CLI；只有取得真实且口径匹配的数据后才生成图表，不得伪造数据。",
            "- 正文先给结论，再用具体数据解释图中的变化、差异、构成、风险或拐点；每张图只支撑一个明确判断。",
            "- 每个 [[AIME_CHART:...]] 必须紧邻其对应解读段落，不能把所有图堆在答案末尾；辅助图不得重复主图信息。",
            "- 最终形成图文一体的回答：图表提供可视证据，文字说明洞察、因果边界、时间口径和风险。",
        ])
        if "kline.py" in decision.selected_scripts and decision.mark_strategy != "no-mark":
            lines.extend([
                "- K线标记统一交给 JEV：先使用 business-chart-recall/kline.py 已取到的真实 OHLCV payload，再运行 python app/jev_kline_annotations.py --payload <行情payload> --question <原问句> --output <含标记payload>。",
                "- 使用 JEV 输出 payload 调用原生 kline.py 渲染；不得手写猜测价位、在正文模型中生成坐标，或用通用 mark 替换原生 annotations。JEV 负责证据校验、选点、周期绑定和配色；原生组件负责避碰、绘制和触摸交互。",
            ])
        if decision.mark_strategy == "signed-direction":
            lines.extend([
                "- 强制执行：柱状图、分组柱状图或柱折图的每个有符号柱值必须按数值方向着色，正值 #00b899、负值 #ff2f57、零值 #94a3b8；不得仅使用系列默认色。",
                "- 必须把该规则写入可执行 schema：visualStyle.markStrategy=signed-direction，并提供 >0、<0、=0 三条 colorRules；调用通用图表 CLI 时必须通过 --style-json 传入，不能只在文字中描述。",
                "- 如果最终数据包含多个并列系列，停止正负重着色并保留系列色与图例映射；以零轴位置表达正负。用户明确指定的颜色规则优先。",
            ])
        elif decision.mark_strategy == "distribution-polarity":
            lines.extend([
                "- 强制执行：分布图按 X 轴区间判断正负，而不是按柱高判断；单系列可按正负着色，多系列分组分布必须保留系列颜色，并用 0 分界线表达极性。",
                "- 调用通用图表 CLI 时必须通过 --style-json 传入该可执行规则，不能只在文字中描述。",
            ])
        return "\n".join(lines)

    @staticmethod
    def is_flux_image_request(question: str, images: list[Any]) -> bool:
        """Route explicit new artwork requests, not charts or image edits."""
        text = str(question or "").strip()
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
            raise ReasoningFrameworkError("flux-image Skill 脚本不存在")
        self.generated_dir.mkdir(parents=True, exist_ok=True)
        output = self.generated_dir / f"flux-{uuid.uuid4().hex}.html"
        run_id = f"flux-{uuid.uuid4().hex}"
        input_paths = self._save_images(framework, run_id, images or []) if images else []
        if images and len(input_paths) != 1:
            raise ReasoningFrameworkError("图生图需要一张有效的上传图片")
        command = [sys.executable, str(script), "--prompt", question, "--output", str(output)]
        if input_paths:
            command.extend(["--input-image", str(input_paths[0])])
        yield "status", {"message": "正在使用本地 FLUX.2 [klein] 4B 生成图片", "phase": "flux-generate", "lang": "zh-CN"}
        yield "agent_event", {
            "engine": FRAMEWORKS[framework], "agent": "FLUX.2 [klein] 4B", "phase": "run", "status": "started",
            "runId": run_id, "message": "本地绘画 Skill 开始生成图片", "lang": "zh-CN",
        }
        started_ns = time.time_ns()
        child_env = os.environ.copy()
        if inference_model.strip():
            child_env["AICHART_FLUX_SELECTED_MODEL"] = inference_model.strip()
        try:
            result = subprocess.run(
                command,
                cwd=self.project_root, capture_output=True, text=True, timeout=1800, check=False,
                env=child_env,
            )
        except subprocess.TimeoutExpired as exc:
            raise ReasoningFrameworkError("本地 FLUX 生图超过 30 分钟，已停止") from exc
        except OSError as exc:
            raise ReasoningFrameworkError(f"无法启动本地 FLUX 生图：{exc}") from exc
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()[-1200:] or "未返回错误详情"
            raise ReasoningFrameworkError(f"本地 FLUX 生图失败：{detail}")
        image = output.with_suffix(".png")
        fresh_files = all(
            path.is_file() and path.stat().st_size > 0 and path.stat().st_mtime_ns >= started_ns
            for path in (output, image)
        )
        if fresh_files:
            with image.open("rb") as handle:
                fresh_files = handle.read(8) == b"\x89PNG\r\n\x1a\n"
        if not fresh_files:
            raise ReasoningFrameworkError("flux-image 未生成本次请求的新 PNG 和 HTML，不能标记为完成")
        answer = f"[[AIME_CHART:{output}]]\n[[AIME_SKILLS:flux-image]]"
        payload = self._artifact_payload(
            framework, question, answer, run_id, engine_session_id,
            inference_model=inference_model,
        )
        payload["reportArtifacts"][0]["imageUrl"] = f"/generated/{image.name}"
        payload["selectedSkill"]["reason"] = "Veya 直接执行并验证了本地 flux-image Skill。"
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
        for item in history[-8:]:
            role = "用户" if item.get("role") == "user" else "助手"
            text = str(item.get("text") or item.get("interpretation") or "").strip()
            if text:
                history_lines.append(f"{role}：{text[:4000]}")
        history_note = "\n\n此前对话摘要：\n" + "\n".join(history_lines) if history_lines else ""
        guidance_note = f"\n\n{visualization_guidance}" if visualization_guidance else ""
        return (f"""用户请求：
{question}{image_note}{history_note}

你是 Veya 的金融研究与可视化智能体，当前推理框架是 {FRAMEWORKS[framework]}。
请直接完成用户任务，而不是解释如何完成。任务匹配 Veya 项目 Skill 时必须先从 .agents/skills 选择对应 Skill，完整读取它指向的 app/skills 规范，再按规范调用脚本；不要用临时代码替代已有 Skill。
用户明确要求创意图片或插画时，选择 flux-image Skill；它生成的是插画，不要将其当作数据图表或金融事实证据。仅生图任务无需执行金融研究链路。
按用户问题的实际范围选择所需的数据源、分析步骤和图表数量；每张图应回答一个明确问题。避免重复取数，能批量获取时优先批量获取。数据源因限流、超时或无数据失败时，尝试另一个匹配来源并说明降级情况。
根据指标、资产、数据形态和用户指定的展示方式，在业务图表与通用图表 Skill 中选择最合适的组件；不要仅因为问题涉及股票就固定选择业务图表。
需要组合时按“数据/搜索 → 计算转换 → 图表渲染 → 视觉验证 → 投顾解读”执行，只选择任务真正需要的环节。
采用“Skill 优先、证据先行、图文协同”的分析方式：先确认可靠数据与口径，再提炼结论，最后选择最能解释该结论的图表。对于时间序列、两项及以上比较、排名、构成、分布、K 线、资金流、事件过程或关系网络，只要已有匹配图表 Skill 且数据质量足够，默认生成图表，不必等待用户再次要求。
图表必须服务于正文中的一个明确判断，并与相关段落相邻；标题、单位、图例和标注使用用户语言，正文指出图中最重要的变化、差异或拐点，不要把图中全部数值机械复述一遍。根据问题需要使用一张或多张图；多图各自回答不同问题。
不要为了“有图”而画图：单一数值、简单状态、纯操作结果、缺少可信数据或图形可能误导时，应改用简洁文字或表格，并说明限制。不得用示例、模拟或过期数据冒充实时证据。
调用图表 Skill 前必须读取其数据契约和 CLI/schema；生成后检查 HTML 文件存在且非空。复杂图、上传图复刻或视觉风险较高时，再执行对应视觉验证 Skill。
工具之间必须用文件路径传递数据：数据、搜索或计算结果先写入 outputs 下的 JSON/CSV 文件，后续脚本只接收该文件路径。禁止把大段数组、K 线、新闻列表或完整 JSON 直接填入命令参数、提示词或最终回答。
需要图表时，把独立 HTML 写入 {self.generated_dir}，文件名以 {framework}- 开头；前端只接收生成文件的绝对路径，不接收内嵌图表数据。在最终 Markdown 的相应位置单独写一行 [[AIME_CHART:绝对HTML路径]]。
当用户要求 StreamViz、流式网页、仪表盘、关系/流程看板或交互式 HTML 时，选择 streamviz 作为“展示阶段” Skill；它不能单独充当数据源、搜索或分析器。涉及行情、新闻、财务或其他事实时，必须同时先选择并执行匹配的数据/搜索/分析 Skill，得到可追溯的 JSON/CSV 结果后，再将精简的、证据驱动的展示 payload 文件交给 streamviz 渲染。根据问题选择 dashboard、comparison、timeline、flow 或 brief 布局，并按需组合表格、排序、时间线和叙事区块；不要把所有内容都压成指标卡。若这些结构不适合任务，使用 streamviz payload 的 html 字段生成任意自包含 HTML/CSS/SVG/Canvas 页面，而不是退回到卡片或表格。默认输出浅色主题：根背景透明，正文使用深色高对比文字，卡片与表格使用白色或浅灰表面；除非用户明确要求深色模式，不得使用浅色文字、深色半透明卡片或仅适配深色背景的 SVG。streamviz 不得编造指标、日期、结论或用“—”占位伪装结果；上游数据缺失时应展示已验证的限制而非虚构看板。最终 AIME_SKILLS 标记应同时列出 streamviz 和实际使用的上游 Skill。网关会自动把已生成 HTML 以流式方式呈现。
最终答案末尾另起一行写 [[AIME_SKILLS:实际使用的Skill名称，以英文逗号分隔]]；未使用项目 Skill 时写 [[AIME_SKILLS:none]]。该标记只用于系统记录。
最终回答使用用户的语言，先给核心结论，再给关键证据和图表解读，最后给风险、数据时间与口径。结论强度必须与证据质量匹配；代理数据、降级数据或不完整数据必须显式披露。不得把内部规划、命令日志或密钥写进答案。
联网搜索、新闻、公告、研报或网页事实的来源由 Skill 工具返回的结构化数据自动收集，并由 Veya 现有溯源组件展示。最终正文不要加入 Markdown 来源链接、裸 URL、“来源：”引导或“来源/参考资料”清单。
除非任务本身要求修改项目，否则不要改动 app、tests 或配置文件；生成物只能写入 outputs。
如果运行时支持工具步骤的 thoughtSummary 元数据，只提供一句面向用户的进度摘要，说明当前判断或行动目的；不要返回原始思维链、内部推理过程、命令或参数。"""
                + guidance_note)

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
                    artifacts.append({"path": str(path), "url": f"/generated/{path.name}"})
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
        html_url = artifacts[0]["url"] if artifacts else ""
        return {
            "question": question,
            "code": "",
            "selectedSkill": {
                "key": ",".join(skill_names) or framework,
                "label": " + ".join(skill_names) if skill_names else FRAMEWORKS[framework],
                "script": " + ".join(skill_names) if skill_names else framework,
                "reason": (
                    f"由 {FRAMEWORKS[framework]} 选择并执行 Veya 项目 Skill。"
                    if skill_names else f"由 {FRAMEWORKS[framework]} 自主规划并执行。"
                ),
            },
            "htmlUrl": html_url,
            "reportUrl": html_url,
            "reportArtifacts": artifacts,
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

    def _jev_tool_thought_summary(self, script: str, arguments: Any) -> str:
        router = self._tool_activity_router
        if not router.configured:
            return ""
        cache_material = JevToolActivityRouter._safe_cli_text(arguments)
        cache_key = f"{script}\n{cache_material}"
        with self._tool_activity_guard:
            cached = self._tool_activity_cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            summary = router.summary(router.route(script=script, arguments=arguments))
        except JevToolActivityRouterError:
            summary = ""
        with self._tool_activity_guard:
            self._tool_activity_cache[cache_key] = summary
        return summary

    @staticmethod
    def _codex_tool_event(item: dict[str, Any], index: int) -> dict[str, Any]:
        item_type = str(item.get("type") or "agent_step")
        command = item.get("command")
        if isinstance(command, list):
            command = " ".join(str(part) for part in command)
        name = str(item.get("name") or item_type).replace("_", " ")
        thought_summary = LocalAgentFrameworks._public_thought_summary(
            item.get("thoughtSummary"), item.get("thought_summary"), item.get("title"), item.get("description")
        )
        return {
            "index": index,
            "total": index,
            "tool": name,
            "script": name,
            "code": "CODEX",
            "lang": "zh-CN",
            "params": [str(command)] if command else [],
            "observation": str(item.get("aggregated_output") or item.get("output") or item.get("status") or "")[:5000],
            "phase": "completed",
            "callId": str(item.get("id") or f"codex-tool-{index}"),
            "thoughtSummary": thought_summary,
        }

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
                for key in ("result", "output", "content", "message", "text"):
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
            for key in ("result", "content", "message", "text"):
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
        _repair_attempt: int = 0,
        visualization_guidance: str = "",
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        codex_bin = os.getenv("AICHART_CODEX_BIN", "codex")
        resolved = shutil.which(codex_bin) or (codex_bin if Path(codex_bin).is_file() else "")
        if not resolved:
            raise ReasoningFrameworkError("Codex 不可用：未找到 codex CLI，请安装并登录后重试")
        image_paths = self._save_images("codex", session_key, images)
        prompt = self._prompt(
            "codex", question, image_paths, history,
            visualization_guidance=visualization_guidance,
        )
        network_enabled = os.getenv("AICHART_CODEX_NETWORK_ACCESS", "true").strip().lower() not in {"0", "false", "no"}
        network_config = f"sandbox_workspace_write.network_access={'true' if network_enabled else 'false'}"
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
        # Preserve the original Codex model configuration for existing remote
        # selections. Only the newly added local model overrides Codex's model.
        # A hidden Ollama derivative may be used here so Codex can have a
        # smaller context without reducing the original model's DeepSeek path.
        model = codex_local_model if is_local_glm else os.getenv("AICHART_CODEX_MODEL", "").strip()
        if is_local_glm:
            skill_catalog = self._skill_catalog(include_scripts=False)
            prompt = (
                f"用户请求：{question}\n"
                "你是 Veya 的本地 Agent。根据用户意图自主选择 Skill 和脚本；以下目录只是可用能力，不是固定路由：\n"
                f"{skill_catalog}\n"
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
                    'model_providers.aimechart_glm.name="Veya GLM tool adapter"',
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
                    "--config",
                    'model_reasoning_effort="medium"',
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
        process = subprocess.Popen(
            command,
            cwd=self.project_root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            start_new_session=True,
        )
        assert process.stdin is not None and process.stdout is not None
        process.stdin.write(prompt)
        process.stdin.close()
        thread_id = engine_session_id
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
            if event_type == "thread.started":
                thread_id = str(event.get("thread_id") or thread_id)
                self._write_codex_trace(f"Codex 线程已启动: {thread_id}")
            item = event.get("item") if isinstance(event.get("item"), dict) else {}
            if event_type in {"item.started", "item.completed"}:
                self._trace_codex_event(event_type, item, show_local_reasoning=is_local_glm)
            if event_type == "item.completed" and item.get("type") not in {"agent_message", "reasoning", "error"}:
                completed_tools.append(item)
                tool_index += 1
                tool_event = self._codex_tool_event(item, tool_index)
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
            if event_type == "item.completed" and item.get("type") == "agent_message":
                answer = str(item.get("text") or answer)
                if answer and item.get("channel") != "analysis":
                    yield "answer_text", {"text": answer, "replace": True}
            if event_type == "turn.failed":
                error = event.get("error") if isinstance(event.get("error"), dict) else {}
                message = str(error.get("message") or "Codex 执行失败")
                self._write_codex_trace(f"运行失败: {self._codex_trace_text(message)}")
                raise ReasoningFrameworkError(message)
        return_code = process.wait(timeout=5)
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
                        _repair_attempt=1,
                        visualization_guidance=visualization_guidance,
                    )
                    return
                raise ReasoningFrameworkError(f"本地模型未完成可信的工具执行：{issue}。请重试或切换模型。")
        if observed_skills:
            answer = re.sub(r"(?m)^\s*\[\[AIME_SKILLS:[^\]\n]+\]\]\s*$", "", answer).rstrip()
            answer += f"\n\n[[AIME_SKILLS:{','.join(observed_skills)}]]"
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
        visualization_guidance: str = "",
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        self._add_deepseek_sdk_path()
        selected_model = inference_model.strip() or os.getenv("AICHART_DEEPSEEK_MODEL", "deepseek-v4-flash")
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
        dsh_home = Path(os.getenv("DSH_HOME", "~/.dsh")).expanduser()
        if not dsh_home.is_absolute():
            dsh_home = self.project_root / dsh_home
        dsh_home = dsh_home.resolve()
        dsh_home.mkdir(parents=True, exist_ok=True)
        if DeepSeekHarness is None:
            if selected_model == local_model:
                raise ReasoningFrameworkError("本地 GLM 模型需要 DeepSeek Harness Python SDK，headless 回退模式不支持切换模型")
            yield from self._stream_deepseek_headless(prompt, question, session_key, dsh_home)
            return
        options: dict[str, Any] = {
            "provider": os.getenv("AICHART_DEEPSEEK_PROVIDER", "deepseek-official"),
            "model": selected_model,
            "cwd": str(self.project_root),
            "session_root": str((dsh_home / "sessions").resolve()),
            "request_timeout_seconds": self._deepseek_timeout_seconds(),
        }
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
        requested_harness_key = f"{requested_session_id}::{selected_model}"
        with self._deepseek_harness_guard:
            cached = requested_harness_key in self._deepseek_harnesses
        session_root = Path(options["session_root"])
        if not cached and any(session_root.glob(f"*/{requested_session_id}/session.jsonl*")):
            requested_session_id = f"session-{uuid.uuid4().hex}"
        harness_key = f"{requested_session_id}::{selected_model}"
        yield "status", {
            "message": f"正在连接 DeepSeek Harness · {selected_model}",
            "phase": "deepseek-connect",
            "lang": "zh-CN",
        }
        yield "agent_event", {
            "engine": FRAMEWORKS["deepseek"], "agent": "Root Agent", "phase": "run", "status": "started",
            "runId": session_key, "message": f"DeepSeek Harness 使用 {selected_model} 开始处理", "lang": "zh-CN",
        }
        html_baseline = self._generated_html_snapshot()
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
        runtime_html_paths: list[Path] = []
        tool_context_by_call_id: dict[str, dict[str, Any]] = {}
        started_at = time.monotonic()
        run_timeout = self._deepseek_run_timeout_seconds()
        while worker.is_alive() or not notifications.empty():
            try:
                notification = notifications.get(timeout=0.25)
            except queue.Empty:
                if time.monotonic() - started_at >= run_timeout:
                    self._drop_deepseek_harness(harness_key)
                    raise ReasoningFrameworkError(
                        f"DeepSeek Harness 运行超过 {int(run_timeout)} 秒，已终止卡住的会话"
                    )
                continue
            method = str(getattr(notification, "method", "") or "")
            payload = getattr(notification, "payload", {})
            event = payload.get("event") if method == "session.event" and isinstance(payload, dict) else None
            if isinstance(event, dict):
                event_type = str(event.get("type") or "")
            else:
                event_type = ""
            if event_type in {"tool/call", "tool/result", "todo/write"}:
                tool_index += 1
                data = event.get("data") if isinstance(event.get("data"), dict) else {}
                runtime_sources.extend(self._sources_from_value(data))
                call_id = str(data.get("callId") or "")
                message = data.get("message") if isinstance(data.get("message"), dict) else {}
                source = message.get("source") if isinstance(message.get("source"), dict) else {}
                result_call_id = str(source.get("callId") or "")
                arguments = data.get("arguments") or data.get("input") or data.get("todos") or []
                phase = "started"
                if event_type == "tool/call":
                    name = str(data.get("name") or data.get("tool") or "工具")
                    thought_summary = self._public_thought_summary(
                        data.get("thoughtSummary"), data.get("thought_summary"), data.get("title"), data.get("description")
                    )
                    if not thought_summary:
                        thought_summary = self._jev_tool_thought_summary(name, arguments)
                    if call_id:
                        tool_context_by_call_id[call_id] = {
                            "name": name,
                            "arguments": arguments,
                            "thoughtSummary": thought_summary,
                        }
                elif event_type == "tool/result":
                    context = tool_context_by_call_id.get(result_call_id, {})
                    name = str(context.get("name") or "工具")
                    arguments = context.get("arguments") or arguments
                    thought_summary = self._public_thought_summary(
                        data.get("thoughtSummary"), data.get("thought_summary"), data.get("title"),
                        context.get("thoughtSummary"),
                    )
                    phase = "completed"
                else:
                    name = "任务计划"
                    thought_summary = self._public_thought_summary(
                        data.get("thoughtSummary"), data.get("thought_summary"), data.get("title"), data.get("description")
                    )
                    phase = "started"
                observation = data.get("result") or data.get("output") or data.get("content") or data
                params_text = arguments if isinstance(arguments, str) else json.dumps(arguments, ensure_ascii=False)
                yield "tool_step", {
                    "index": tool_index, "total": tool_index, "tool": name, "script": name,
                    "code": "DSH", "lang": "zh-CN",
                    "params": [params_text[:3000]] if arguments else [],
                    "observation": json.dumps(observation, ensure_ascii=False)[:5000],
                    "phase": phase,
                    "callId": call_id or result_call_id or f"deepseek-tool-{tool_index}",
                    "thoughtSummary": thought_summary,
                }
                if event_type == "tool/result":
                    for module in self._html_modules_from_tool_output(observation):
                        html_url = str(module.get("htmlUrl") or "")
                        path = (self.generated_dir / Path(html_url).name).resolve()
                        if path not in runtime_html_paths:
                            runtime_html_paths.append(path)
                        yield "module", module
            elif event_type == "assistant/message" and str(payload.get("sessionId") or requested_session_id) == requested_session_id:
                data = event.get("data") if isinstance(event.get("data"), dict) else {}
                message = data.get("message") if isinstance(data.get("message"), dict) else data
                content = message.get("content")
                if message.get("channel") != "analysis" and isinstance(content, list):
                    text = "".join(str(block.get("text") or "") for block in content if isinstance(block, dict) and block.get("type") == "text")
                    if text.strip():
                        yield "answer_text", {"text": text, "replace": True}
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
        worker.join()
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
        if not re.search(r"\[\[AIME_CHART:[^\]\n]+\.html\]\]", answer):
            fallback_path = runtime_html_paths[-1] if runtime_html_paths else None
            if fallback_path is None:
                current_html = self._generated_html_snapshot()
                changed_html = [
                    path for path, signature in current_html.items()
                    if html_baseline.get(path) != signature
                ]
                if changed_html:
                    fallback_path = max(
                        changed_html,
                        key=lambda path: current_html[path][0],
                    )
            if fallback_path is not None:
                answer = f"{answer.rstrip()}\n\n[[AIME_CHART:{fallback_path}]]"
        actual_session_id = str(getattr(result, "session_id", "") or requested_session_id)
        run_id = f"deepseek-{actual_session_id}"
        yield "agent_event", {
            "engine": FRAMEWORKS["deepseek"], "agent": "Root Agent", "phase": "run", "status": "completed",
            "runId": run_id, "message": f"DeepSeek Harness · {selected_model} 已完成", "lang": "zh-CN",
        }
        runtime_sources.extend(self._sources_from_value(vars(result) if hasattr(result, "__dict__") else {}))
        yield "final", self._artifact_payload(
            "deepseek", question, answer, run_id, actual_session_id, runtime_sources, selected_model
        )

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

    def _stream_deepseek_headless(
        self, prompt: str, question: str, session_key: str, dsh_home: Path
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        dsh_bin = self._dsh_bin()
        if not dsh_bin:
            raise ReasoningFrameworkError(
                "DeepSeek Harness 不可用：请安装官方 SDK/Runtime，或通过 DSH_BIN 指定 dsh 可执行文件。"
            )
        yield "status", {"message": "正在连接 DeepSeek Harness", "phase": "deepseek-connect", "lang": "zh-CN"}
        yield "agent_event", {
            "engine": FRAMEWORKS["deepseek"], "agent": "Headless Agent", "phase": "run", "status": "started",
            "runId": session_key, "message": "DeepSeek Harness 开始处理用户请求", "lang": "zh-CN",
        }
        environment = os.environ.copy()
        environment["DSH_HOME"] = str(dsh_home)
        try:
            completed = subprocess.run(
                [dsh_bin, "--profile", "headless", prompt],
                cwd=self.project_root,
                env=environment,
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                timeout=self._deepseek_timeout_seconds(),
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ReasoningFrameworkError(f"DeepSeek Harness 调用失败：{exc}") from exc
        if completed.returncode != 0:
            detail = completed.stderr.strip().splitlines()[-1] if completed.stderr.strip() else "运行时异常退出"
            raise ReasoningFrameworkError(f"DeepSeek Harness 调用失败：{detail}")
        answer = completed.stdout.strip()
        if not answer:
            raise ReasoningFrameworkError("DeepSeek Harness 未返回最终回答")
        run_id = f"deepseek-{session_key}"
        yield "agent_event", {
            "engine": FRAMEWORKS["deepseek"], "agent": "Headless Agent", "phase": "run", "status": "completed",
            "runId": run_id, "message": "DeepSeek Harness 已完成", "lang": "zh-CN",
        }
        yield "final", self._artifact_payload("deepseek", question, answer, run_id, session_key)
