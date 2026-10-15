from __future__ import annotations

import json
import html
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterator, Literal
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.studio_agent_client import StudioAgentClient, StudioAgentError
from app.reasoning_frameworks import FRAMEWORKS, LocalAgentFrameworks, ReasoningFrameworkError
from app.native_streamviz import stream_native_widget
from app.artifact_upgrades import upgrade_legacy_intraday, upgrade_legacy_grouped_bar, upgrade_legacy_mobile_charts, upgrade_legacy_mobile_charts
from app.local_glm_adapter import router as local_glm_router
from app.widget_library import router as widget_library_router
from app.widget_planner import router as widget_planner_router
from app.artifact_upgrades import upgrade_widget_tradingview
from app.wecom_channel import WeComChannelError, WeComRobotClient, configured_webhook_url


ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "app" / "static"
GENERATED_DIR = ROOT / "outputs" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

# A short-lived compatibility mapping for a blank artifact saved before the
# StreamViz hand-off fix.  Browser sessions and shared sessions may both still
# carry this URL, so normalise it at every server-side rendering boundary.
LEGACY_ARTIFACT_REDIRECTS = {
    "/generated/native-streamviz-bf812c5bdd59.html": "/generated/deepseek-ashare-review-streamviz-20261009.html",
}

app = FastAPI(title="Mentora presentation gateway")
app.include_router(local_glm_router)
app.include_router(widget_library_router)
app.include_router(widget_planner_router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/generated", StaticFiles(directory=GENERATED_DIR), name="generated")


@app.middleware("http")
async def disable_static_cache(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/static/", "/generated/", "/share-artifact/")):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

STUDIO = StudioAgentClient(generated_dir=GENERATED_DIR, project_root=ROOT)
LOCAL_FRAMEWORKS = LocalAgentFrameworks(generated_dir=GENERATED_DIR, project_root=ROOT)


@app.on_event("shutdown")
def close_local_frameworks() -> None:
    LOCAL_FRAMEWORKS.close()


class UploadedImage(BaseModel):
    name: str = ""
    mimeType: str = ""
    dataUrl: str


def default_reasoning_framework() -> Literal["deepseek", "codex"]:
    return "codex" if os.getenv("AICHART_REASONING_FRAMEWORK", "deepseek").strip().lower() == "codex" else "deepseek"


class ChatRequest(BaseModel):
    question: str = ""
    images: list[UploadedImage] = Field(default_factory=list)
    sessionId: str = ""
    studioSessionId: int | None = None
    engineSessionId: str = ""
    reasoningFramework: Literal["deepseek", "codex"] = Field(default_factory=default_reasoning_framework)
    inferenceModel: str = ""
    resolvedInferenceModel: str = ""
    history: list[dict[str, Any]] = Field(default_factory=list)
    sessionTitle: str = ""
    nativeStreamViz: bool = False
    themeMode: Literal["light", "dark"] = "light"


class SessionTitleRequest(BaseModel):
    question: str
    interpretation: str = ""


class ShareSessionRequest(BaseModel):
    session: dict[str, Any]


class WeComPushRequest(BaseModel):
    shareId: str
    includeImage: bool = True


class StudioSessionRequest(BaseModel):
    clientSessionId: str
    name: str = "New Chat"


class StudioSessionRenameRequest(BaseModel):
    clientSessionId: str
    name: str


class ChatResponse(BaseModel):
    question: str
    code: str
    selectedSkill: dict[str, str]
    htmlUrl: str
    reportUrl: str
    reportArtifacts: list[dict[str, str]] = Field(default_factory=list)
    payloadUrl: str | None = None
    interpretation: str
    status: list[str]
    agentRunId: str | None = None
    studioSessionId: int | None = None
    engineSessionId: str = ""
    reasoningFramework: str = Field(default_factory=default_reasoning_framework)
    inferenceModel: str = ""
    sources: list[dict[str, Any]] = Field(default_factory=list)
    videos: list[dict[str, Any]] = Field(default_factory=list)
    actionLinks: list[dict[str, str]] = Field(default_factory=list)
    lang: str = "zh-CN"


def normalized_question(payload: ChatRequest) -> str:
    question = payload.question.strip()
    if question:
        return question
    return "请识别图片并整理信息" if payload.images else ""


def sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def streamviz_wrap_document(code: str) -> str:
    if 'data-aime-streamviz-root="true"' in code:
        return code
    body = re.search(r"(<body\b[^>]*>)([\s\S]*?)(</body\s*>)", code, flags=re.I)
    if not body:
        return f'<div data-aime-streamviz-root="true">{code}</div>'
    wrapped_body = (
        f'{body.group(1)}<div data-aime-streamviz-root="true">'
        f"{body.group(2)}</div>{body.group(3)}"
    )
    return f"{code[:body.start()]}{wrapped_body}{code[body.end():]}"


def streamviz_module_payload(data: dict[str, Any]) -> tuple[Path, str] | None:
    html_url = str(data.get("htmlUrl") or "").split("?", 1)[0].split("#", 1)[0]
    name = Path(html_url).name
    if not name or not name.endswith(".html"):
        return None
    path = (GENERATED_DIR / name).resolve()
    if GENERATED_DIR.resolve() not in path.parents or not path.is_file():
        return None
    try:
        code = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    max_chars = max(64_000, int(os.getenv("AICHART_STREAMVIZ_MAX_CHARS", "2000000")))
    if len(code) > max_chars:
        return None
    if re.search(r"<iframe\b", code, flags=re.I):
        return None
    # A report with executable code owns its rendering lifecycle.  Running it
    # through StreamViz's sanitising sandbox changes the DOM and can measure an
    # unfinished document as a 48px blank widget.  Render it directly in the
    # existing report iframe instead; static HTML/SVG still streams normally.
    if re.search(r"<script\b", code, flags=re.I):
        return None
    if re.search(
        r"<(?:img|link|source|video|audio)\b[^>]*(?:src|href)\s*=\s*[\"'](?:/|\.\.?/)",
        code,
        flags=re.I,
    ):
        return None
    return path, streamviz_wrap_document(code)


def streamviz_events_for_module(data: dict[str, Any]) -> Iterator[tuple[str, dict[str, Any]]]:
    resolved = streamviz_module_payload(data)
    if resolved is None:
        data["streamvizCompatible"] = False
        yield "module", data
        return

    path, code = resolved
    visualization_id = f"module:{path.stem}"
    data["streamvizCompatible"] = True
    data["streamvizId"] = visualization_id
    title = str(data.get("label") or data.get("title") or "")
    loading_messages = [
        f"正在构建{title}",
        "正在接收可视化结构",
        "正在完成图表交互",
    ]
    yield "visualization", {
        "id": visualization_id,
        "htmlUrl": str(data.get("htmlUrl") or ""),
        "title": title,
        "reset": True,
        "final": False,
        "loadingMessages": loading_messages,
    }

    target_frames = max(8, min(24, (len(code) + 24_999) // 25_000))
    chunk_size = max(4_096, (len(code) + target_frames - 1) // target_frames)
    frame_delay = max(0.0, min(0.03, float(os.getenv("AICHART_STREAMVIZ_FRAME_DELAY", "0.012"))))
    for offset in range(0, len(code), chunk_size):
        yield "visualization", {
            "id": visualization_id,
            "title": title,
            "delta": code[offset : offset + chunk_size],
            "final": False,
            "loadingMessages": loading_messages,
        }
        if frame_delay:
            time.sleep(frame_delay)
    yield "visualization", {
        "id": visualization_id,
        "title": title,
        "final": True,
        "showActions": True,
        "loadingMessages": loading_messages,
    }
    yield "module", data


def framework_events(payload: ChatRequest) -> Iterator[tuple[str, dict[str, Any]]]:
    question = normalized_question(payload)
    if not question:
        raise HTTPException(status_code=400, detail="问题不能为空")
    # StreamViz is a presentation Skill, not an intent shortcut.  The agent must
    # first run the data/search/analysis Skills selected for the request, then
    # hand their evidence-backed payload to the StreamViz renderer.  Keeping the
    # legacy explicit flag inert here avoids a keyword such as “dashboard”
    # bypassing financial data collection and yielding fabricated placeholders.
    if LOCAL_FRAMEWORKS.is_flux_image_request(question, list(payload.images)):
        yield from LOCAL_FRAMEWORKS.stream_flux_image(
            payload.reasoningFramework,
            question,
            images=list(payload.images),
            engine_session_id=payload.engineSessionId,
            inference_model=payload.inferenceModel,
        )
        return
    requested_streamviz = "streamviz" in question.lower()
    deferred_final: dict[str, Any] | None = None
    for event_name, data in LOCAL_FRAMEWORKS.stream(
        payload.reasoningFramework,
        question,
        list(payload.images),
        session_key=payload.sessionId,
        engine_session_id=payload.engineSessionId,
        history=payload.history,
        inference_model=payload.inferenceModel,
        resolved_inference_model=payload.resolvedInferenceModel,
        visualization_theme=payload.themeMode,
    ):
        if requested_streamviz and event_name == "final":
            deferred_final = data
            continue
        if requested_streamviz and event_name in {"module", "visualization", "visualize_widget"}:
            # These are batch artifacts from the evidence phase, not model
            # generation deltas. They remain available as an error fallback.
            continue
        yield event_name, data
    if not requested_streamviz or deferred_final is None:
        return
    # Batch reports supply verified evidence and a durable fallback. The live
    # visual is generated from model tool-argument deltas, not file replay.
    upstream_artifacts = deferred_final.get("reportArtifacts")
    has_upstream_report = bool(
        deferred_final.get("reportUrl")
        or (isinstance(upstream_artifacts, list) and any(isinstance(item, dict) and item.get("url") for item in upstream_artifacts))
    )
    evidence = str(deferred_final.get("interpretation") or "").strip()
    # Artifact markers are transport directives, never user-facing evidence.
    # The normal final-response path strips them, but this StreamViz hand-off
    # intentionally consumes the raw upstream interpretation before that path.
    evidence = re.sub(r"(?m)^\s*\[\[AIME_CHART:[^\]\n]+\]\]\s*$", "", evidence).strip()
    evidence = re.sub(r"(?m)^\s*\[\[AIME_SKILLS:[^\]\n]+\]\]\s*$", "", evidence).strip()
    for artifact in upstream_artifacts if isinstance(upstream_artifacts, list) else []:
        resolved = streamviz_module_payload({"htmlUrl": artifact.get("url", "")}) if isinstance(artifact, dict) else None
        if resolved:
            # Retain the original tables, series, and visual evidence so the
            # streaming renderer does not need to invent missing chart data.
            reference = re.sub(r"<style\b[^>]*>[\s\S]*?</style>", "", resolved[1], flags=re.I)
            evidence += f"\n\n上游已生成的证据看板（沿用事实与图形数据）：\n{reference[:60000]}"
    native_final: dict[str, Any] | None = None
    provisional_ids: set[str] = set()
    try:
        for event_name, data in stream_native_widget(question, GENERATED_DIR, evidence=evidence, theme_mode=payload.themeMode):
            if event_name == "final":
                native_final = data
            else:
                if event_name == "visualization" and data.get("id"):
                    provisional_ids.add(str(data["id"]))
                yield event_name, data
    except Exception:
        if not has_upstream_report:
            raise
        for visualization_id in provisional_ids:
            yield "visualization", {"id": visualization_id, "discard": True}
        yield "status", {"phase": "streamviz-fallback", "message": "流式绘制未完成，已保留上游生成的 HTML 看板", "lang": "zh-CN"}
        yield "final", deferred_final
        return
    # An empty native tool payload is not a report.  Preserve the complete HTML
    # that the evidence-producing skill already generated instead of replacing
    # it with an empty StreamViz wrapper.
    if native_final and native_final.get("reportArtifacts"):
        report_path = native_final["reportArtifacts"][0].get("path", "")
        marker_used = False
        def replace_chart_marker(_match: re.Match[str]) -> str:
            nonlocal marker_used
            if marker_used or not report_path:
                return ""
            marker_used = True
            return f"[[AIME_CHART:{report_path}]]"
        native_final["interpretation"] = re.sub(
            r"\[\[AIME_CHART:[^\]\n]+\]\]", replace_chart_marker,
            str(deferred_final.get("interpretation") or ""),
        )
        native_final["sources"] = deferred_final.get("sources") or []
        native_final["status"] = deferred_final.get("status") or []
        for key in ("engineSessionId", "studioSessionId", "agentRunId", "reasoningFramework"):
            native_final[key] = deferred_final.get(key, native_final.get(key))
        yield "final", native_final
    else:
        yield "final", deferred_final


@app.get("/")
def index() -> FileResponse:
    return FileResponse(
        STATIC_DIR / "index.html",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "role": "presentation-gateway",
        "agent": "multi-framework",
        "frameworks": LOCAL_FRAMEWORKS.availability(),
        "models": LOCAL_FRAMEWORKS.inference_models(),
    }


@app.get("/api/client-config.js")
def client_config() -> Response:
    config = {"reasoningFramework": default_reasoning_framework()}
    return Response("window.AIME_CHAT_CONFIG = " + json.dumps(config) + ";", media_type="application/javascript", headers={"Cache-Control": "no-store"})


@app.get("/api/models")
def inference_models() -> dict[str, Any]:
    return {"models": LOCAL_FRAMEWORKS.inference_models()}


@app.post("/api/studio/sessions")
def create_studio_session(payload: StudioSessionRequest) -> dict[str, Any]:
    try:
        session = STUDIO.ensure_session(payload.clientSessionId, payload.name)
        return {"id": int(session["id"]), "name": str(session.get("name") or payload.name)}
    except StudioAgentError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.put("/api/studio/sessions/{session_id}")
def rename_studio_session(session_id: int, payload: StudioSessionRenameRequest) -> dict[str, Any]:
    try:
        session = STUDIO.rename_session(session_id, payload.clientSessionId, payload.name)
        return {"id": session_id, "name": str(session.get("name") or payload.name)}
    except StudioAgentError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.delete("/api/studio/sessions/{session_id}")
def delete_studio_session(session_id: int) -> dict[str, bool]:
    try:
        STUDIO.delete_session(session_id)
        return {"ok": True}
    except StudioAgentError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    try:
        final: dict[str, Any] | None = None
        for event_name, data in framework_events(payload):
            if event_name == "final":
                final = data
        if final is None:
            raise ReasoningFrameworkError(f"{FRAMEWORKS[payload.reasoningFramework]} 未返回最终结果")
        return ChatResponse(**final)
    except (StudioAgentError, ReasoningFrameworkError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/chat/stream")
def chat_stream(payload: ChatRequest) -> StreamingResponse:
    if not normalized_question(payload):
        raise HTTPException(status_code=400, detail="问题不能为空")

    def stream() -> Iterator[str]:
        try:
            for event_name, data in framework_events(payload):
                # Batch HTML is completed tool evidence. Do not cut it into
                # artificial visualization deltas before the model's prose.
                # Genuine model-native widget deltas keep their own protocol.
                yield sse_event(event_name, data)
        except (StudioAgentError, ReasoningFrameworkError) as exc:
            yield sse_event("error", {"detail": str(exc), "status_code": 502, "lang": "zh-CN"})
        except Exception as exc:  # keep transport failures visible in the existing UI
            yield sse_event(
                "error",
                {
                    "detail": f"{FRAMEWORKS[payload.reasoningFramework]} 调用失败：{exc}",
                    "status_code": 500,
                    "lang": "zh-CN",
                },
            )

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@app.post("/api/session-title")
def session_title(payload: SessionTitleRequest) -> dict[str, str]:
    # Presentation metadata only; intentionally no model call.
    title = re.sub(r"[\n\r\t\"'`]+", "", payload.question.strip()).strip(" ，。,.、：:")
    return {"title": (title or "新聊天")[:28]}


def generated_file(value: str, suffix: str) -> Path:
    name = Path(value.split("?", 1)[0].split("#", 1)[0]).name
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="invalid generated file")
    path = (GENERATED_DIR / name).resolve()
    if GENERATED_DIR.resolve() not in path.parents or path.suffix.lower() != suffix:
        raise HTTPException(status_code=400, detail="invalid generated file")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="generated file not found")
    return path


def canonical_host_url(value: str) -> str:
    """Normalize a reverse-proxy prefix before resolving local artifacts."""
    prefix = os.getenv("AICHART_BASE_PATH", "").strip().rstrip("/")
    if prefix and value.startswith(prefix + "/"):
        return value[len(prefix):]
    return value


@app.post("/api/share-session")
def save_share_session(payload: ShareSessionRequest) -> dict[str, str]:
    session_id = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(payload.session.get("id") or "")).strip("-")
    if not session_id:
        raise HTTPException(status_code=400, detail="missing session id")
    path = GENERATED_DIR / f"share-{session_id}.json"
    path.write_text(json.dumps(payload.session, ensure_ascii=False), encoding="utf-8")
    return {"id": session_id, "url": f"/api/share-session/{session_id}"}


@app.get("/api/share-session/{session_id}")
def get_share_session(session_id: str) -> dict[str, Any]:
    safe_id = re.sub(r"[^A-Za-z0-9_.-]+", "-", session_id).strip("-")
    path = GENERATED_DIR / f"share-{safe_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="shared session not found")
    try:
        session = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="shared session is invalid") from exc
    if not isinstance(session, dict):
        raise HTTPException(status_code=500, detail="shared session is invalid")
    return session


def _strip_streamviz_artifact_hosts(markup: str) -> str:
    """Remove live React widget DOM before persisting it into a share page."""
    opener = re.compile(r'<div\b(?=[^>]*\bclass=["\'][^"\']*\bstreamvizArtifactHost\b[^"\']*["\'])[^>]*>', re.I)
    tag = re.compile(r'</?div\b[^>]*>', re.I)
    output: list[str] = []
    cursor = 0
    while match := opener.search(markup, cursor):
        output.append(markup[cursor:match.start()])
        depth = 1
        end = match.end()
        for nested in tag.finditer(markup, match.end()):
            if nested.group(0).startswith("</"):
                depth -= 1
                if depth == 0:
                    end = nested.end()
                    break
            else:
                depth += 1
        cursor = end
    output.append(markup[cursor:])
    return "".join(output)


def _share_artifact_frames(session: dict[str, Any]) -> str:
    artifacts = session.get("reportArtifacts") if isinstance(session.get("reportArtifacts"), list) else []
    urls: list[str] = []
    def supported(url: str) -> bool:
        return url.endswith(".html") and ".." not in url.split("/") and url.startswith(("/generated/", "/static/cases/"))
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        url = canonical_host_url(str(artifact.get("url") or artifact.get("htmlUrl") or "").strip())
        url = LEGACY_ARTIFACT_REDIRECTS.get(url, url)
        if supported(url) and url not in urls:
            urls.append(url)
    if not urls:
        report_url = canonical_host_url(str(session.get("reportUrl") or "").strip())
        report_url = LEGACY_ARTIFACT_REDIRECTS.get(report_url, report_url)
        if supported(report_url):
            urls.append(report_url)
    theme_mode = "dark" if session.get("themeMode") == "dark" else "light"
    theme_query = "?theme=dark" if theme_mode == "dark" else ""
    return "".join(
        f'<iframe class="reportDocumentFrame" src="{html.escape(("/share-artifact/" + quote(Path(url).name) if url.startswith("/generated/") else url) + theme_query, quote=True)}" '
        f'title="Mentora 报告 {index}" scrolling="no"></iframe>'
        for index, url in enumerate(urls, start=1)
    )


def standalone_share_html(session: dict[str, Any]) -> str:
    title = html.escape(str(session.get("question") or session.get("title") or "Mentora"))
    answer_html = _strip_streamviz_artifact_hosts(str(session.get("answerHtml") or "").strip())
    answer_html = answer_html.replace("http://127.0.0.1:8000/", "/")
    answer_html = re.sub(r'(<iframe\b[^>]*?)\sstyle="[^"]*"', r"\1", answer_html, flags=re.I)
    answer_html = re.sub(r'\sdata-(?:resize-observed|chart-embed)="[^"]*"', "", answer_html, flags=re.I)
    # The chat DOM may already contain a report frame.  The authoritative frame
    # is appended from reportArtifacts below; retaining both creates duplicate
    # reports and, for a legacy empty artifact, a huge blank region.
    answer_html = re.sub(
        r'<iframe\b(?=[^>]*\bclass=["\'][^"\']*\breportDocumentFrame\b[^"\']*["\'])[^>]*>(?:\s*</iframe>)?',
        "",
        answer_html,
        flags=re.I,
    )
    if not answer_html:
        answer_html = f'<div class="plainAnswer">{html.escape(str(session.get("interpretation") or ""))}</div>'
    answer_html += _share_artifact_frames(session)
    theme_mode = "dark" if session.get("themeMode") == "dark" else "light"
    page_background = "#10131a" if theme_mode == "dark" else "#f7f8fa"
    page_text = "#eef2f7" if theme_mode == "dark" else "#151922"
    return f'''<!doctype html>
<html lang="zh-CN" data-theme="{theme_mode}" style="color-scheme:{theme_mode}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><link rel="stylesheet" href="/static/styles.css"><link rel="stylesheet" href="/static/vendor/streamviz/streamviz.css">
<style>
html,body{{margin:0;height:auto!important;min-height:100%;overflow:visible!important;background:{page_background};color:{page_text}}}
body{{box-sizing:border-box;padding:0}}
.shareAnswerDocument{{box-sizing:border-box;width:100%;max-width:none;margin:0;padding:38px 46px 46px;background:transparent}}
.shareAnswerTitle{{display:block;margin:0 0 24px;font-size:24px;line-height:1.4;font-weight:760;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere;word-break:break-word}}
.reportInterpretation{{margin:6px 0 8px!important}}
.reportDocumentFrame{{display:block;width:100%;height:420px;min-height:0!important;margin:18px 0!important;border:0;background:transparent}}
.streamvizArtifactHost,.visualize-widget-block{{display:block;width:100%;max-width:100%;height:auto;overflow:visible}}
.visualize-widget-panel{{display:block;width:100%;height:var(--visualize-widget-height,260px)!important;min-height:0;overflow:visible}}
.visualize-widget-frame{{display:block;width:100%;height:var(--visualize-widget-height,260px)!important;border:0;background:transparent}}
.streamingAnswer{{margin-bottom:8px!important;font-size:17px;line-height:1.7}}
.streamingAnswer h2{{font-size:22px;margin:22px 0 10px}} .streamingAnswer h3{{font-size:19px;margin:18px 0 8px}}
.plainAnswer{{white-space:pre-wrap;font-size:17px;line-height:1.7}}
@media(max-width:720px){{.shareAnswerDocument{{padding:24px 20px 30px;border-radius:14px}}.reportDocumentFrame{{height:340px}}}}
</style></head><body><main class="shareAnswerDocument"><h1 class="shareAnswerTitle">{title}</h1><section class="mixedReport">{answer_html}</section></main>
<script>
(function(){{
  function resizeChartFrame(frame){{
    try {{
      var doc = frame.contentDocument;
      if (!doc) return;
      var body = doc.body;
      var root = doc.documentElement;
      var nativeChart = doc.querySelector('.multi-kline, .kline-component');
      if (nativeChart) {{
        frame.style.setProperty('height', Math.ceil(nativeChart.getBoundingClientRect().bottom) + 'px', 'important');
        return;
      }}
      var wrap = doc.querySelector('#wrap, [data-timeline-container="true"], .component-root, .chart-container, main');
      var wrapRect = wrap ? wrap.getBoundingClientRect() : null;
      var height = Math.max(
        wrapRect ? Math.ceil(wrapRect.bottom) : 0,
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        root ? root.scrollHeight : 0,
        root ? root.offsetHeight : 0,
        260
      );
      frame.style.setProperty('height', height + 'px', 'important');
    }} catch (error) {{}}
  }}
  function resizeAll(){{
    document.querySelectorAll('.reportDocumentFrame').forEach(resizeChartFrame);
  }}
  document.querySelectorAll('.reportDocumentFrame').forEach(function(frame){{
    frame.addEventListener('load', function(){{ resizeChartFrame(frame); }}, {{once:true}});
  }});
  window.addEventListener('load', resizeAll);
  setTimeout(resizeAll, 300);
  setTimeout(resizeAll, 1200);
}})();
</script></body></html>'''


STREAMVIZ_THEME_PATH = STATIC_DIR / "vendor" / "streamviz" / "artifact-theme.css"
KLINE_THEME_PATH = Path(__file__).parent / "skills/business-chart-recall/assets/kline-theme.css"


def sync_native_kline_theme(artifact: str, theme: str) -> str:
    """Keep saved native Canvas charts in sync with the selected host theme."""
    if 'data-kline-contract=' not in artifact or 'id="kline-canvas"' not in artifact:
        return artifact

    def update_script(match: re.Match) -> str:
        script = match.group(0)
        if "getElementById('kline-canvas')" not in script:
            return script
        # Older documents have a fixed config. Update only the native chart's
        # config, leaving market data, annotations and other scripts untouched.
        return re.sub(
            r'(const config = \{[^\n]*?"themeMode"\s*:\s*)"(?:light|dark)"',
            lambda config: config.group(1) + json.dumps(theme),
            script, count=1,
        )

    artifact = re.sub(r'<script\b[^>]*>.*?</script\s*>', update_script, artifact, flags=re.S | re.I)
    artifact = re.sub(r'<style data-kline-theme="dual">.*?</style>', '', artifact, flags=re.S)
    css = '<style data-kline-theme="dual">' + KLINE_THEME_PATH.read_text(encoding="utf-8") + '</style>'
    return re.sub(r'</head\s*>', lambda _: css + '</head>', artifact, count=1, flags=re.I)

def share_streamviz_artifact(filename: str, theme: Literal["light", "dark"] = "light") -> HTMLResponse:
    """Serve a generated StreamViz artifact with the runtime theme frozen in."""
    path = generated_file(filename, ".html")
    try:
        artifact = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=500, detail="cannot read generated artifact") from exc
    artifact = upgrade_legacy_intraday(artifact, theme)
    artifact = upgrade_legacy_grouped_bar(artifact, theme)
    artifact = upgrade_legacy_mobile_charts(artifact, theme)
    artifact = sync_native_kline_theme(artifact, theme)
    artifact = upgrade_widget_tradingview(artifact)
    runtime_theme = f'<style data-streamviz-theme="dual">{STREAMVIZ_THEME_PATH.read_text(encoding="utf-8")}</style>'
    if 'data-sv-chart-geometry' not in artifact:
        geometry = (Path(__file__).parent / 'skills/streamviz/assets/chart-geometry.js').read_text(encoding='utf-8')
        runtime_theme += '<script data-sv-chart-geometry>' + geometry + '</script>'
    # The host selects a palette; all artifact styling belongs to StreamViz.
    artifact = re.sub(
        r"<html\b([^>]*)>",
        lambda match: '<html' + re.sub(r'\sdata-theme\s*=\s*([\"\']).*?\1', '', match.group(1), flags=re.I)
        + f' data-theme="{theme}">',
        artifact, count=1, flags=re.I,
    )
    if re.search(r"</head\s*>", artifact, flags=re.I):
        document = re.sub(r"</head\s*>", lambda _: f"{runtime_theme}</head>", artifact, count=1, flags=re.I)
    else:
        document = f'<!doctype html><html lang="zh-CN" data-theme="{theme}"><head><meta charset="utf-8">{runtime_theme}</head><body>{artifact}</body></html>'
    return HTMLResponse(document, headers={"Cache-Control": "no-store"})


@app.get("/share-artifact/{filename}", response_class=HTMLResponse)
def shared_streamviz_artifact_page(filename: str, theme: Literal["light", "dark"] = "light") -> HTMLResponse:
    return share_streamviz_artifact(filename, theme)


def screenshot_base_url(request: Request) -> str:
    configured = os.getenv("AICHART_LOCAL_BASE_URL", "").strip()
    if configured:
        return configured.rstrip("/")
    port = request.url.port or (443 if request.url.scheme == "https" else 80)
    return f"http://127.0.0.1:{port}"


def share_viewport_width(session: dict[str, Any]) -> int:
    """Return the CSS viewport width captured when the user opened Share."""
    try:
        width = int(float(session.get("shareViewportWidth") or 1320))
    except (TypeError, ValueError):
        width = 1320
    return max(360, min(width, 3840))


@app.get("/share/{session_id}", response_class=HTMLResponse)
def shared_answer_page(session_id: str) -> HTMLResponse:
    session = get_share_session(session_id)
    return HTMLResponse(standalone_share_html(session), headers={"Cache-Control": "no-store"})


def render_share_answer_image(
    share_id: str,
    *,
    base_url: str,
    image_format: Literal["png", "jpeg"] = "png",
    quality: int = 80,
    device_scale_factor: int = 2,
) -> Path:
    safe_id = re.sub(r"[^A-Za-z0-9_.-]+", "-", share_id).strip("-")
    session_path = GENERATED_DIR / f"share-{safe_id}.json"
    if not safe_id or not session_path.is_file():
        raise HTTPException(status_code=404, detail="shared answer not found")
    try:
        session = json.loads(session_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="shared answer is invalid") from exc
    if not isinstance(session, dict):
        raise HTTPException(status_code=500, detail="shared answer is invalid")
    viewport_width = share_viewport_width(session)
    suffix = "jpg" if image_format == "jpeg" else "png"
    image_path = GENERATED_DIR / f"share-{safe_id}-answer.{suffix}"
    share_url = f"{base_url.rstrip('/')}/share/{quote(safe_id)}"
    screenshot_options = (
        f'type="jpeg", quality={quality}, '
        if image_format == "jpeg"
        else ""
    )
    script = f'''\
from pathlib import Path
from playwright.sync_api import sync_playwright

output = Path({str(image_path)!r})
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={{"width": {viewport_width}, "height": 900}}, device_scale_factor={device_scale_factor})
    page.goto({share_url!r}, wait_until="networkidle", timeout=60000)
    answer = page.locator(".shareAnswerDocument")
    answer.wait_for(state="visible", timeout=60000)
    page.wait_for_timeout(2500)
    page.evaluate("""
      () => {{
        document.querySelectorAll('.reportDocumentFrame').forEach(frame => {{
          try {{
            const doc = frame.contentDocument;
            if (!doc) return;
            const body = doc.body;
            const root = doc.documentElement;
            const wrap = doc.querySelector('#wrap, [data-timeline-container="true"], .component-root, .chart-container, main');
            const wrapRect = wrap?.getBoundingClientRect();
            const height = Math.max(
              wrapRect ? Math.ceil(wrapRect.bottom) : 0,
              body?.scrollHeight || 0,
              body?.offsetHeight || 0,
              root?.scrollHeight || 0,
              root?.offsetHeight || 0,
              260
            );
            frame.style.setProperty('height', `${{height}}px`, 'important');
          }} catch (error) {{}}
        }});
      }}
    """)
    page.wait_for_timeout(350)
    page_height = page.evaluate("Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)")
    for y in range(0, int(page_height), 650):
        page.evaluate("y => window.scrollTo(0, y)", y)
        page.wait_for_timeout(120)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    answer.screenshot(path=str(output), {screenshot_options}animations="disabled")
    browser.close()
'''
    result = subprocess.run([sys.executable, "-c", script], cwd=str(ROOT), capture_output=True, text=True, timeout=90)
    if result.returncode != 0 or not image_path.is_file():
        detail = (result.stderr or result.stdout or "answer screenshot failed")[-600:]
        raise HTTPException(status_code=500, detail=detail)
    return image_path


@app.get("/api/share-answer-image")
def share_answer_image(share_id: str, request: Request) -> FileResponse:
    png_path = render_share_answer_image(share_id, base_url=screenshot_base_url(request))
    return FileResponse(png_path, media_type="image/png", filename=png_path.name)


@app.get("/api/wecom/status")
def wecom_status() -> dict[str, Any]:
    return {"configured": bool(configured_webhook_url()), "mode": "group-robot"}


def wecom_session_markdown(session: dict[str, Any]) -> str:
    title = str(session.get("question") or session.get("title") or "Mentora").strip()
    interpretation = str(session.get("interpretation") or "").strip()
    if not interpretation:
        raw_html = str(session.get("answerHtml") or "")
        interpretation = html.unescape(re.sub(r"<[^>]+>", " ", raw_html))
        interpretation = re.sub(r"\s+", " ", interpretation).strip()
    return f"## {title}\n{interpretation or '分析结果见附图。'}"


@app.post("/api/wecom/push")
def push_to_wecom(payload: WeComPushRequest, request: Request) -> dict[str, Any]:
    if not configured_webhook_url():
        raise HTTPException(status_code=503, detail="请先在 .env 配置 WECOM_BOT_WEBHOOK_URL")
    session = get_share_session(payload.shareId)
    try:
        client = WeComRobotClient()
        client.send_markdown(wecom_session_markdown(session))
    except WeComChannelError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    result: dict[str, Any] = {"ok": True, "textSent": True, "imageSent": False}
    if not payload.includeImage:
        return result
    try:
        image_path = render_share_answer_image(
            payload.shareId,
            base_url=screenshot_base_url(request),
            image_format="jpeg",
            quality=72,
            device_scale_factor=1,
        )
        client.send_image(image_path)
        result["imageSent"] = True
        result["imageBytes"] = image_path.stat().st_size
    except (HTTPException, WeComChannelError, OSError) as exc:
        result["ok"] = False
        result["warning"] = f"文字已推送，但图片发送失败：{getattr(exc, 'detail', str(exc))}"
    return result


@app.get("/api/share-image")
def share_image(report: str, request: Request) -> FileResponse:
    html_path = generated_file(report, ".html")
    png_path = html_path.with_name(f"{html_path.stem}-share.png")
    report_url = f"{screenshot_base_url(request)}/generated/{quote(html_path.name)}"
    script = f'''\
from pathlib import Path
from playwright.sync_api import sync_playwright

output = Path({str(png_path)!r})
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={{"width": 1320, "height": 900}}, device_scale_factor=2)
    page.goto({report_url!r}, wait_until="networkidle", timeout=60000)
    page.screenshot(path=str(output), full_page=True)
    browser.close()
'''
    result = subprocess.run([sys.executable, "-c", script], cwd=str(ROOT), capture_output=True, text=True, timeout=90)
    if result.returncode != 0 or not png_path.is_file():
        detail = (result.stderr or result.stdout or "chart screenshot failed")[-600:]
        raise HTTPException(status_code=500, detail=f"图表截图失败：{detail}")
    return FileResponse(png_path, media_type="image/png", filename=png_path.name)


# Daily research uses exactly the same skill-based execution path as chat.
from app.day_tasks import DayTasks, create_router as create_day_router, MARKETS, STAGES


def run_daily_research(config: dict[str, Any], run_id: str) -> dict[str, Any]:
    import datetime as dt
    from zoneinfo import ZoneInfo
    local_time = dt.datetime.now(ZoneInfo(MARKETS[config['market']]['zone']))
    context = (
        f"当前市场：{MARKETS[config['market']]['name']}；市场当地时间：{local_time.isoformat()}；"
        f"任务阶段：{STAGES[config['stage']]}；标的类型：{config['assetType']}；"
        f"用户指定标的：{config['symbols'] or '未指定，请分析该市场整体，不要假设用户持仓或自选股'}。\n"
        "这是自动研究任务，只进行信息查询与分析；不得交易、修改账户、设置提醒或向外部渠道发送消息。"
        "按项目技能获取数据，注明数据截至时间，缺少实时数据时明确说明，不得编造行情。历史对话仅供对照，每次都应重新核验最新数据。\n\n"
    )
    question = config['question'].replace('{{date}}', local_time.date().isoformat()).replace('{{market}}', MARKETS[config['market']]['name']).replace('{{symbols}}', config['symbols'])
    payload=ChatRequest(question=context+question,sessionId='day-'+run_id,reasoningFramework='deepseek',themeMode='dark',history=config.get('_history',[]))
    answer=None
    for event_name,data in framework_events(payload):
        if event_name=='error':raise RuntimeError('Scheduled research stream failed')
        if event_name=='final':
            answer=ChatResponse(**data).model_dump();answer['question']=question;data=answer
        if callable(config.get('_emit_event')):config['_emit_event'](event_name,data)
    if answer is None:raise RuntimeError('Scheduled research returned no final answer')
    return answer


DAY_TASKS = DayTasks(Path(os.getenv('VEYA_DAY_DATA_DIR', str(ROOT / 'outputs' / 'day-tasks'))), run_daily_research)
app.include_router(create_day_router(DAY_TASKS))


@app.on_event('startup')
def start_day_tasks() -> None:
    if os.getenv('VEYA_DAY_SCHEDULER', '1') != '0':
        DAY_TASKS.seed_scene_presets()
        DAY_TASKS.start()


@app.on_event('shutdown')
def stop_day_tasks() -> None:
    DAY_TASKS.stop()
