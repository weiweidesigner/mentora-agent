"""OpenAI-compatible native tool-call streaming for StreamViz.

Unlike replaying a finished HTML file, this adapter forwards tool-call argument
deltas as soon as the model emits them.  `streamviz-react` can parse the
partial JSON and progressively render `widget_code` (normally static SVG).
"""
from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path
from typing import Any, Iterator

from openai import OpenAI

from app.file_artifacts import collect_file_artifacts
from app.reasoning_frameworks import ReasoningFrameworkError


TOOL_NAME = "visualize_show_widget"

WIDGET_TOOL = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": "Create one self-contained, progressively renderable HTML/SVG visual artifact.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short Chinese visual title."},
                "widget_code": {
                    "type": "string",
                    "description": "Self-contained responsive semantic HTML with optional inline SVG. Start with a valid <div>; no canvas, script, iframe, or external assets.",
                },
            },
            "required": ["title", "widget_code"],
            "additionalProperties": False,
        },
    },
}

SYSTEM_PROMPT = """You are Mentora's StreamViz visual-artifact generator. When the user asks for a
diagram, dashboard, conceptual visual, simple infographic, or illustrative chart, call
visualize_show_widget exactly once.

The tool output is a polished visual, NOT an answer written as HTML. Choose the composition that
best explains the supplied evidence: it may be a narrative canvas, a comparison, a diagram, a
timeline, a chart, or a dashboard. Do not force metric cards or tables. Build responsively: use
width:min(...), max-width:100%, CSS grid auto-fit/minmax, flexible SVG viewBox, and media queries;
never use fixed multi-column pixel widths that turn into narrow vertical strips.
Set min-width:0 on grid/flex children so intrinsic-width charts cannot expand the page.
Compact metric cards use repeat(auto-fit,minmax(min(100%,150px),1fr)) to fit side by side
and wrap when space runs out, including mobile. Large chart cards stack; chips and long text wrap.
Use 16px card-to-card gaps, 12px card inner padding, and 8px component spacing.
StreamViz owns layout: use data-sv-layout="stack" for vertical card groups, "grid" for
large responsive cards, "metrics" for compact metric groups, and "components" for inner stacks.
Mark cards with data-sv-card and compact metrics with data-sv-metric. Do NOT add custom
margin, padding, gap, or display rules to those elements or their direct children.
Keep SVG geometry and chart-specific layout inside an inner component wrapper.
Headings and descriptions use 8px separation with no extra default paragraph margins.
Line plots reserve 8px internal top padding for top axis labels; do not enlarge heading margins.
Position HTML plot dots by their
centers (translate(-50%,-50%)), using the exact same normalized coordinates as the line.
Keep any necessary table scrolling local to a min-width:0 wrapper. Test at 320px and 390px.

You may use StreamViz's built-in classes and tokens: `sv-grid`, `sv-metric`, `sv-label`,
`sv-value`, `sv-muted`, `sv-badge`, `sv-badge-success`, `sv-badge-warning`, `sv-badge-danger`,
and `sv-divider`. Use CSS variables such as `var(--sv-text-primary)` and
`var(--sv-border-subtle)`, with thin borders, flat surfaces, generous spacing, no gradients or
shadows. Keep semantic colors to three or fewer, but do use them deliberately: for charts with
two or more meaningful series, use `var(--sv-chart-series-1)`, `var(--sv-chart-series-2)`, and
`var(--sv-chart-series-3)` for the emphasized series, then reserve `var(--sv-status-success)`,
`var(--sv-status-warning)`, or `var(--sv-status-danger)` for non-financial success, caution, and risk.
For financial price changes/returns/breadth use `var(--sv-price-up)`, `var(--sv-price-down)`,
and `var(--sv-price-flat)` instead. Mark each financial region with
`data-financial-market="CN"`, "HK", or "US": CN/HK red-up green-down; US green-up red-down.
Mixed-market reports must mark each region independently.
The night palette is neutral charcoal, not navy: use the shared surface/text/border tokens,
never #181e28, #111824, #2b3544 or private hard-coded blue-gray cards. Financial direction
must be bound to the rendered value (including rankings, KPIs and table changes): add
data-sv-direction="up", "down", or "flat" from the actual signed change. Preserve the
displayed sign and unit; zero is neutral. Do not color standalone percentages such as
80% participation/market share as gains. Use success/danger only for execution or risk status.
Do not render an entire chart by varying the opacity of `var(--sv-text-primary)`; grayscale is
only appropriate for neutral context or de-emphasized comparisons. The first code must be a
visible card or SVG node—never a long text block.

Treat a horizontal bar chart as a compact three-column system: reserve no more than 12% of the
SVG width for right-aligned category labels, 78% for the plotting area, and 10% for values or
annotations. Align the left edge of the label column with the card title's content edge; do not
insert decorative outer gutters on either side of the chart.
For every horizontal bar, put the value in the reserved value column, 10–14px to the right of the
bar end. Never place dark text over a colored bar. Text may appear inside a bar only when it is
white, bold, and has verified contrast against that exact fill; outside labels are the default.
Before emitting an SVG, verify that every point, bar, and text baseline stays inside its viewBox,
including negative values and labels below the x-axis. For categorical charts, give every category
a distinct x position and never stack unrelated bars or labels at one coordinate. If labels cannot
fit without overlap, enlarge the viewBox or use a compact table instead of drawing a crowded chart.
Never stretch a small fixed-viewBox SVG across an unbounded wide container: its embedded text scales
with the geometry and can become larger than the surrounding HTML heading. Design the SVG near its
actual rendered width, or use responsive HTML/CSS bars whose labels keep CSS pixel sizes. Maintain a
strict type hierarchy at the final rendered size: section/chart title 16–18px, data labels 12–14px,
and axis/category labels 11–13px; axis and data labels must never appear larger than the title.
Reducing a chart card's outer or inner whitespace must not shrink the plot itself. Tighten the card
padding and unused viewBox gutters while keeping the plot visually dominant: normally use 75–90% of
the card width and enough plot height for the data marks and labels. In a side-by-side half-width card,
design the SVG viewBox near that half-card's actual rendered width instead of using a full-page-wide
viewBox that will scale the whole chart down.
Also account for wider share captures: when a half-width SVG can grow materially beyond its design
width, use container-query font-size compensation so its final axis/category labels remain 11–13px
and data labels 12–14px. Compensate SVG text only; do not shrink the plot, bars, or card.
The same scaling risk applies to strokes, markers, bar thickness, and corner radii. Add
`vector-effect="non-scaling-stroke"` to SVG lines, paths, and polylines so gridlines stay near 1px
and primary series stay near 1.5–2.5px at the final rendered size. Size circles and other markers
for a final 3–5px radius. Keep ordinary bars about 20–32px thick with modest 2–4px final corner
radii. The edge touching the zero/category axis must be square; round only the free outer end of
each bar. For vertical bars, positive bars round only the top; negative bars round only the bottom.
Horizontal positive and negative bars use opposite outer-end radii. If a responsive SVG
cannot hold those dimensions across target widths, use HTML/CSS bars.
Do not let a wide SVG's aspect-ratio scaling control vertical rhythm. Keep ranked rows 36–44px
high with 8–12px gaps, chart-card padding 16–24px, and section gaps 24–32px at every viewport.
For ranked horizontal bars with more than seven categories, prefer a responsive HTML/CSS grid so
only the plot width grows; row height, label column, value column, and vertical spacing stay fixed.
In side-by-side CSS Grid layouts, use `align-items:start` so a short chart card keeps its intrinsic
height instead of stretching to match a taller text or table card beside it.
For long categorical x-axis labels, reserve a separate label band and wrap each label into at most
two centered `tspan` lines. If labels still collide, switch to a horizontal bar chart or a compact
table. Do not shrink text below 11px, rotate dense Chinese labels, or rely on overflow clipping.
Use the same plot origin and row spacing for every series. Do not create a large blank side gutter
by placing the plot start at one third of the viewBox. Every chart must have a visible data mark
(line, bar, dot, or area) for each claimed series; if the supplied evidence has no plottable series,
render a compact no-data note instead of axes without marks.

For a column-and-line dual-axis chart, use one shared plot rectangle: its left/right edges must be
within 10% and 90% of the viewBox width. Align every column center, line point, and category label
to the same x coordinate. Reserve a dedicated band below the x-axis for category labels; put
secondary annotations such as YoY growth on a separate line below that band, never on top of axis
labels or gridlines. Name both axes and append the correct unit to every visible data label (for
example `亿元` and `%`). A different bar color or opacity requires a short visible legend or label
explaining its meaning; otherwise use one consistent series color. Place compact legends below the
plot by default, outside the SVG/canvas, centered as a group, with 8–12px of top spacing. Move a legend above the plot
only when the lower position would separate it from the chart or collide with required annotations.
When the legend is below an SVG, end the viewBox just after the x-axis label band. Do not leave an
additional empty bottom band inside the SVG and then add the legend margin again; the visible gap
from the last label baseline to the legend should normally stay around 8–16px.

The StreamViz host already controls page width. Do not create another centered page canvas or
outside gutter: at the root use width:100%;max-width:none;margin:0, never max-width:960px
or margin:0 auto. Use padding only inside a card or a chart section, where it belongs.

For flow diagrams, use one inline SVG with a fixed `viewBox="0 0 960 520"` and explicit nodes.
Arrows are required where relationships matter: define one `<marker id="arrow" viewBox="0 0 10 10"
refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">` in `<defs>`, then attach it
directly to each `<line>` or `<polyline>` via `marker-end="url(#arrow)"`. Never render standalone
`→` characters as separate positioned elements. Keep each arrow endpoint 8px outside its target
node; use orthogonal or gently diagonal routes, and keep every coordinate inside the viewBox.
This binds arrowheads to the connector when the widget is resized instead of letting them drift.

After title, write widget_code immediately. It is streamed while you write it, so it MUST begin
with a valid transparent HTML container such as `<section style=\"margin:0;padding:0;background:transparent\">`;
LOCAL PREVIEW RULE: Output a visible heading and a short evidence-backed sentence immediately
inside that container, BEFORE any <style> block. Use existing StreamViz classes (sv-card,
sv-metric, sv-label, sv-value) and data-sv-layout markers for layout. Do not front-load a
stylesheet or an empty shell. Prefer existing theme variables and small inline chart styles.
Write each chart directly after its heading instead of collecting all styles first.
do not start with a document wrapper. You may place inline SVG inside that container (write
`<svg xmlns=\"...\">` with the required space). Add visible elements in reading order so early
partial code is useful. Do not use JavaScript, canvas, iframe, remote assets, or external CSS.
Use valid HTML and CSS even while streaming: leave a space before every attribute (`<ul style=...>`,
never `<ulstyle=...>`), and give lists an explicit `margin:8px 0;padding-left:20px;` so bullets
remain inside their card. Use spaces between CSS values (`margin:0 auto`, never `margin:0auto`).
The same rule applies to SVG: write `<polyline points=...>`, never `<polylinepoints=...>`. Within
a `points` value, separate every coordinate pair with a space, for example
`points="166,117 290,230 414,246"`; commas separate x/y only.
Use Chinese labels when the user writes Chinese. Do not invent factual market data; native streaming
is for presentation-only visuals. If a request needs live data, calculations, or a business chart
skill, explain that it should use the normal analysis mode instead of calling the tool."""


def _text(value: Any) -> str:
    return str(value or "").strip()


def _attr(value: Any, name: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _client_from_env() -> tuple[OpenAI, str]:
    api_key = os.getenv("AICHART_STREAMVIZ_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise ReasoningFrameworkError(
            "原生 StreamViz 未配置 API Key。请设置 AICHART_STREAMVIZ_API_KEY（或 DEEPSEEK_API_KEY）。"
        )
    base_url = (
        os.getenv("AICHART_STREAMVIZ_BASE_URL")
        or os.getenv("DEEPSEEK_BASE_URL")
        or "https://api.deepseek.com"
    )
    model = os.getenv("AICHART_STREAMVIZ_MODEL") or os.getenv("DEEPSEEK_MODEL") or "deepseek-chat"
    return OpenAI(api_key=api_key, base_url=base_url.rstrip("/")), model


def _safe_widget_code(code: str) -> bool:
    if not code or len(code) > 2_000_000:
        return False
    # StreamViz sandboxes output too; this guard keeps persisted artifacts portable.
    return not bool(re.search(r"<(?:script|iframe|canvas)\b|\b(?:src|href)\s*=\s*['\"](?:https?:|//)", code, re.I))


def _repair_streamed_html(code: str) -> str:
    """Repair a narrow whitespace loss observed in streamed tool arguments."""
    code = re.sub(
        r"<(div|section|article|main|header|footer|span|p|h[1-6]|ul|ol|li|svg|g|rect|circle|path|line|polyline|text|tspan)(?=(?:class|style|id|role|aria-|data-|xmlns|viewBox|width|height|fill|stroke|points|font-size|font-weight|x|y|x1|y1|x2|y2|cx|cy|r|d)=)",
        r"<\1 ",
        code,
        flags=re.I,
    )
    code = re.sub(r"<(marker)(?=id=)", r"<\1 ", code, flags=re.I)
    code = re.sub(r"([\"'])(?=[A-Za-z_:][-A-Za-z0-9_:.]*=)", r"\1 ", code)
    code = re.sub(r"\bsv-badge(?=sv-badge-)", "sv-badge ", code)
    code = re.sub(r"(\d|px|rem|%)(solid|dashed|dotted)(?=\b|var\()", r"\1 \2", code, flags=re.I)
    code = re.sub(r"(solid|dashed|dotted)(?=var\()", r"\1 ", code, flags=re.I)
    code = re.sub(r"viewBox=([\"'])00(\d{2})(\d{2})\1", r"viewBox=\g<1>0 0 \g<2> \g<3>\g<1>", code, flags=re.I)
    code = re.sub(r"viewBox=([\"'])00(\d{3})(\d{3})\1", r"viewBox=\g<1>0 0 \g<2> \g<3>\g<1>", code, flags=re.I)
    code = re.sub(r"viewBox=([\"'])00(\d{4})(\d{3})\1", r"viewBox=\g<1>0 0 \g<2> \g<3>\g<1>", code, flags=re.I)
    # A streamed SVG sometimes loses the separator between `x,y` point pairs.
    code = re.sub(r"(?<=,\d{3})(?=\d{3},)", " ", code)
    code = re.sub(r"(?<=,\d{2})(?=\d{3},)", " ", code)
    code = re.sub(r"(?<=,\d)(?=\d{3},)", " ", code)
    code = re.sub(r"(\d+(?:px|rem|em|%))(?=\d+(?:px|rem|em|%|;|\b))", r"\1 ", code, flags=re.I)
    code = re.sub(r"(?<=[:\s])0(?=auto\b)", "0 ", code, flags=re.I)
    code = re.sub(r"(?<=[:\s])0(?=\d+(?:px|rem|em|%))", "0 ", code, flags=re.I)
    return re.sub(r"(?<=[:\s])00(?=[;\s\"'])", "0 0", code)


def _flatten_native_canvas(code: str) -> str:
    code = re.sub(r"class=([\"'])sv-card(?:\s+)?", r"class=\1sv-native-canvas ", code, flags=re.I)
    return (
        "<style>.sv-native-canvas{width:100%!important;max-width:none!important;background:transparent!important;"
        "border:0!important;box-shadow:none!important;margin:0!important;padding:0!important}"
        ".sv-native-canvas>:is(section,main,article,div){width:100%!important;max-width:none!important;"
        "margin-left:0!important;margin-right:0!important}"
        ".sv-native-canvas>section>div:first-child,.sv-native-canvas>main>div:first-child,"
        ".sv-native-canvas>article>div:first-child{width:100%!important;max-width:none!important;"
        "margin-left:0!important;margin-right:0!important}</style>"
        f'<div class="sv-native-canvas">{code}</div>'
    )


def _save_widget(generated_dir: Path, title: str, code: str) -> dict[str, str] | None:
    code = _repair_streamed_html(code)
    if not _safe_widget_code(code):
        return None
    # Do not turn an absent tool argument into a perfectly valid, but blank,
    # HTML document.  That artifact used to replace the report produced by the
    # upstream skill in the chat and share view.
    if not code.strip():
        return None
    code = _flatten_native_canvas(code)
    theme_css = (Path(__file__).parent / "skills/streamviz/assets/artifact-theme.css").read_text(encoding="utf-8")
    geometry_js = (Path(__file__).parent / 'skills/streamviz/assets/chart-geometry.js').read_text(encoding='utf-8')
    financial_js = (Path(__file__).parent / 'skills/streamviz/assets/financial-semantics.js').read_text(encoding='utf-8')
    code = ('<!doctype html><html data-theme="light"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<style data-streamviz-theme="dual">{theme_css}</style><script data-sv-chart-geometry>{geometry_js}</script><script data-sv-financial-semantics>{financial_js}</script></head><body>'
            f'<main data-aime-streamviz-root="true">{code}</main></body></html>')
    name = f"native-streamviz-{uuid.uuid4().hex[:12]}.html"
    path = generated_dir / name
    path.write_text(code, encoding="utf-8")
    return {"path": str(path), "url": f"/generated/{name}", "title": title}


def stream_native_widget(
    question: str,
    generated_dir: Path,
    *,
    evidence: str = "",
    theme_mode: str = "light",
    client_override=None,
    model_override: str = "",
) -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield Aime SSE events from native OpenAI tool-call argument deltas."""
    client, model = (client_override, model_override) if client_override is not None else _client_from_env()
    yield "status", {"stage": "native_streamviz", "message": "正在以原生流式协议构建图形", "lang": "zh-CN"}
    stream = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"用户请求：{question}\n\n"
                f"当前界面主题：{'深色' if theme_mode == 'dark' else '浅色'}。"
                + "图表的标题、指标、周期、图例和提示框必须跟随用户问句语言，显式输出语言要求优先，不要按股票市场选择语言。"
                + "一份组件必须同时支持浅深主题；背景、正文、说明、边框和图表系列只使用 --sv-* 主题变量，不得写死配色。"
                + f"\n\n已由上游 Skills 验证的事实（只可使用这些事实，不得补造）：\n{evidence}"
            )},
        ],
        tools=[WIDGET_TOOL],
        # An explicit StreamViz request is a request for a live artifact, not
        # permission for the model to answer with prose instead.
        tool_choice={"type": "function", "function": {"name": TOOL_NAME}},
        stream=True,
        stream_options={"include_usage": True},
        temperature=0.2,
    )
    calls: dict[int, dict[str, str]] = {}
    answer_parts: list[str] = []

    for chunk in stream:
        if _attr(chunk, "usage", None):
            from app.cost_monitor import COSTS
            COSTS.record_response(chunk,provider='deepseek',service='StreamViz',operation='并行 HTML 渲染' if client_override is not None else '原生 HTML 渲染',model=model)
        choices = _attr(chunk, "choices", []) or []
        if not choices:
            continue
        delta = _attr(choices[0], "delta", {}) or {}
        content = _attr(delta, "content", "")
        if content:
            answer_parts.append(str(content))
        for tool_call in _attr(delta, "tool_calls", []) or []:
            index = int(_attr(tool_call, "index", 0) or 0)
            function = _attr(tool_call, "function", {}) or {}
            call = calls.setdefault(index, {"id": "", "name": "", "arguments": "", "started": ""})
            call["id"] = _text(_attr(tool_call, "id", "")) or call["id"] or f"native:{index}"
            call["name"] = _text(_attr(function, "name", "")) or call["name"]
            # Leading/trailing whitespace can be part of an HTML text node or
            # attribute. Forward chunks byte-for-byte, without strip().
            arguments = str(_attr(function, "arguments", "") or "")
            if call["name"] != TOOL_NAME:
                continue
            if not call["started"]:
                call["started"] = "1"
                yield "visualization", {
                    "id": call["id"], "toolName": TOOL_NAME, "toolRawInput": "", "reset": True,
                    "final": False, "native": True,
                    "loadingMessages": ["正在搭建视觉结构", "正在补充图形元素", "正在完成可视化"],
                }
            if arguments:
                call["arguments"] += arguments
                yield "visualization", {
                    "id": call["id"], "toolName": TOOL_NAME, "argumentDelta": arguments,
                    "toolRawInput": call["arguments"], "final": False, "native": True,
                }

    artifacts: list[dict[str, str]] = []
    for call in calls.values():
        if call["name"] != TOOL_NAME or not call["started"]:
            continue
        payload: dict[str, Any] = {}
        try:
            parsed = json.loads(call["arguments"])
            if isinstance(parsed, dict):
                payload = parsed
        except json.JSONDecodeError:
            pass
        title = _text(payload.get("title"))
        # A few compatible providers have used `html` or `code` despite the
        # declared field name.  Accept those aliases before considering the
        # call empty, while retaining the schema as the primary contract.
        code = _text(payload.get("widget_code") or payload.get("html") or payload.get("code"))
        if not code:
            # The live renderer has already received the tool-call start.  Tell
            # it to remove that provisional host rather than leaving a blank
            # white card in the completed answer.
            yield "visualization", {
                "id": call["id"], "toolName": TOOL_NAME, "discard": True,
                "toolStatus": "empty", "final": True, "native": True,
            }
            continue
        artifact = _save_widget(generated_dir, title, code)
        yield "visualization", {
            "id": call["id"], "toolName": TOOL_NAME, "toolRawInput": call["arguments"],
            "htmlUrl": artifact["url"] if artifact else "",
            "toolStatus": "completed", "title": title, "final": True, "native": True,
            "loadingMessages": ["正在搭建视觉结构", "正在补充图形元素", "正在完成可视化"],
        }
        if artifact:
            artifacts.append(artifact)

    if not calls:
        raise ReasoningFrameworkError("StreamViz 模型未返回 visualize_show_widget 工具调用，未生成可视化。")
    file_artifacts, _ = collect_file_artifacts(
        question, "", artifacts, generated_dir, generated_dir.parent, allow_html=True
    )
    yield "final", {
        "question": question, "code": "", "selectedSkill": {"key": "native-streamviz", "label": "Native StreamViz", "script": TOOL_NAME, "reason": "模型工具调用参数以 SSE 增量渲染。"},
        "htmlUrl": artifacts[0]["url"] if artifacts else "", "reportUrl": artifacts[0]["url"] if artifacts else "",
        "reportArtifacts": artifacts, "fileArtifacts": file_artifacts, "payloadUrl": None,
        "interpretation": "".join(answer_parts).strip() or "已生成原生流式可视化。",
        "status": ["Native StreamViz 已完成"], "agentRunId": "", "studioSessionId": None,
        "engineSessionId": "", "reasoningFramework": "native-streamviz", "inferenceModel": model,
        "sources": [], "videos": [], "actionLinks": [], "lang": "zh-CN",
    }
