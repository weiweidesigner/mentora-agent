from __future__ import annotations

import json
import html
import hashlib
import importlib.metadata
import secrets
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
from app.artifact_upgrades import upgrade_generic_chart_typography, upgrade_legacy_intraday, upgrade_legacy_grouped_bar, upgrade_legacy_mobile_charts, upgrade_legacy_mobile_charts
from app.local_glm_adapter import router as local_glm_router
from app.widget_library import router as widget_library_router
from app.widget_planner import router as widget_planner_router
from app.portfolio_ocr import router as portfolio_ocr_router
from app.video_thumbnails import router as video_thumbnail_router
try:
    from app.cost_monitor import create_router as create_cost_router
except ModuleNotFoundError as exc:
    if exc.name != 'app.cost_monitor':raise
    create_cost_router=None
from app.artifact_upgrades import upgrade_widget_generic_chart, upgrade_widget_tradingview, upgrade_native_kline_pine, upgrade_native_kline_runtime
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
app.include_router(video_thumbnail_router)
app.include_router(local_glm_router)
app.include_router(widget_library_router)
app.include_router(widget_planner_router)
app.include_router(portfolio_ocr_router)
if create_cost_router:app.include_router(create_cost_router())


# Deal assets are pinned repository links outside STATIC_DIR. Serve only these
# explicit files without enabling arbitrary symlink traversal for all static assets.
@app.get('/static/portfolio.js', include_in_schema=False)
def portfolio_script():
    return FileResponse(STATIC_DIR / 'portfolio.js', media_type='application/javascript')


@app.get('/static/portfolio.css', include_in_schema=False)
def portfolio_styles():
    return FileResponse(STATIC_DIR / 'portfolio.css', media_type='text/css')


from app.native_pine_artifacts import NativePineStaticFiles
app.mount("/static", NativePineStaticFiles(directory=STATIC_DIR), name="static")
app.mount("/generated", StaticFiles(directory=GENERATED_DIR), name="generated")

WORKSPACE_PREVIEW_SUFFIXES = {
    '.txt', '.md', '.json', '.csv', '.py', '.pine', '.js', '.mjs', '.cjs', '.ts', '.tsx',
    '.jsx', '.css', '.scss', '.html', '.xml', '.yaml', '.yml', '.toml', '.sh', '.sql',
}


def output_workspace_file(relative_path: str) -> Path:
    outputs_root = (ROOT / 'outputs').resolve()
    candidate = (ROOT / relative_path).resolve()
    if outputs_root not in candidate.parents or candidate.suffix.lower() not in WORKSPACE_PREVIEW_SUFFIXES:
        raise HTTPException(404, 'file is not available for preview')
    if not candidate.is_file() or candidate.stat().st_size > 2_000_000:
        raise HTTPException(404, 'file is not available for preview')
    return candidate


@app.get('/api/workspace-file/preview', response_class=HTMLResponse)
def preview_output_workspace_file(path: str, change: Literal['created', 'edited'] = 'edited', theme: Literal['light', 'dark'] = 'light', mode: Literal['plain', 'diff'] = 'plain') -> HTMLResponse:
    file_path = output_workspace_file(path)
    try:
        content = file_path.read_text(encoding='utf-8')
    except UnicodeDecodeError as exc:
        raise HTTPException(415, 'file is not UTF-8 text') from exc
    dark = theme == 'dark'
    rows = []
    for number, line in enumerate(content.splitlines(), 1):
        row_class = ' created' if mode == 'diff' and change == 'created' else ''
        rows.append(f'<tr class="code-row{row_class}"><th>{number}</th><td><code>{html.escape(line) or "&#8203;"}</code></td></tr>')
    palette = ('#151515', '#e8e8e8', '#2a2a2a', '#183524', '#53d769') if dark else ('#ffffff', '#242424', '#e5e7eb', '#edf8eb', '#2f9e2f')
    document = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(file_path.name)}</title><style>
html,body{{margin:0;min-height:100%;background:{palette[0]};color:{palette[1]};font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}}table{{width:100%;border-collapse:collapse;font-size:13px;line-height:1.55}}th{{position:sticky;left:0;width:1%;min-width:44px;padding:0 12px;text-align:right;font-weight:400;color:#8b93a5;background:{palette[0]};border-right:1px solid {palette[2]};user-select:none}}td{{padding:0 14px;white-space:pre;vertical-align:top}}tr.created th,tr.created td{{background:{palette[3]}}}tr.created th{{color:{palette[4]};border-left:4px solid {palette[4]}}}code{{font:inherit}}.empty{{padding:32px;color:#8b93a5;text-align:center}}
</style></head><body>{f'<table>{"".join(rows)}</table>' if rows else '<p class="empty">空文件</p>'}</body></html>'''
    return HTMLResponse(document, headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})


@app.get('/api/workspace-file/download')
def download_output_workspace_file(path: str) -> FileResponse:
    file_path = output_workspace_file(path)
    return FileResponse(file_path, filename=file_path.name, headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})


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
    agent: Literal['','mentora','mentora-deal'] = ''
    images: list[UploadedImage] = Field(default_factory=list)
    sessionId: str = ""
    sessionScope: Literal['chat','widget'] = 'chat'
    studioSessionId: int | None = None
    engineSessionId: str = ""
    reasoningFramework: Literal["deepseek", "codex"] = Field(default_factory=default_reasoning_framework)
    inferenceModel: str = ""
    reasoningEffort: Literal["low", "medium", "high", "xhigh", "ultra"] = "low"
    resolvedInferenceModel: str = ""
    history: list[dict[str, Any]] = Field(default_factory=list)
    sessionTitle: str = ""
    nativeStreamViz: bool = False
    themeMode: Literal["light", "dark"] = "light"


class SessionTitleRequest(BaseModel):
    question: str
    interpretation: str = ""


from app.chat_sessions import ChatSessions,create_router as create_chat_session_router,identity as chat_identity

CHAT_SESSIONS=ChatSessions(ROOT/'outputs/chat-sessions')
from app.case_favorites import create_router as create_case_favorites_router
app.include_router(create_case_favorites_router(CHAT_SESSIONS))


def durable_chat_events(payload,user):
    portfolio=globals().get('PORTFOLIO')
    research_only=bool(portfolio and portfolio.workflow.research_only_request(payload.question))
    deal=bool(portfolio and not research_only and (payload.agent=='mentora-deal' or (not payload.agent and portfolio.workflow.handles_question(payload.question,payload.history))))
    events=portfolio.workflow.stream_idea(user,payload.question,payload.history,reasoning_effort=payload.reasoningEffort) if deal else framework_events(payload,user=user)
    if research_only:yield 'status',{'message':'正在研究当前品种与周期','agent':'mentora','lang':'zh-CN'}
    charts={}
    answer_started=False
    for event,data in events:
        if event=='answer_text' and str(data.get('text') or data.get('delta') or '').strip():answer_started=True
        if event in {'module','visualization','visualize_widget'}:
            url=str(data.get('htmlUrl') or data.get('url') or '')
            if url.startswith(('/generated/','/share-artifact/')):charts[url]={**data,'url':url,'label':data.get('label') or data.get('title') or ''}
        if event=='tool_step' and isinstance(data.get('output'),dict):
            artifact=data['output'].get('chartArtifact')
            if artifact and artifact.get('url'):charts[artifact['url']]=artifact
        if event=='final':
            data=dict(data)
            if research_only:data['agent']='mentora'
            for artifact in data.get('reportArtifacts') or []:
                if artifact.get('url'):charts[artifact['url']]={**charts.get(artifact['url'],{}),**artifact}
            if charts:
                data['reportArtifacts']=list(charts.values())
                data['reportUrl']=data.get('reportUrl') or next(iter(charts))
                # Artifact discovery is inventory, not a request to dump every
                # intermediate chart after the final prose and footnotes.
            if not answer_started and str(data.get('interpretation') or '').strip():
                answer_started=True
                yield 'answer_text',{'text':data['interpretation'],'replace':True,'lang':data.get('lang','zh-CN')}
        yield event,data


app.include_router(create_chat_session_router(CHAT_SESSIONS,ChatRequest,durable_chat_events,LOCAL_FRAMEWORKS.cancel))


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


def normalize_chat_result(data: dict[str, Any]) -> dict[str, Any]:
    """Adapt text/Deal finals without requiring a synthetic chart or symbol.

    Preserve provider metadata and validate the same required answer fields as
    ordinary chat. Rendering-only fields may be empty for text-only research.
    """
    result = dict(data)
    artifacts = result.get('reportArtifacts') or []
    url = result.get('reportUrl') or result.get('htmlUrl') or next(
        (item['url'] for item in artifacts if isinstance(item, dict) and item.get('url')), '')
    result.setdefault('code', '')
    result.setdefault('htmlUrl', url)
    result.setdefault('reportUrl', url)
    result.setdefault('status', [])
    return {**result, **ChatResponse(**result).model_dump()}


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
    """Finished HTML is a module snapshot, never synthetic model deltas."""
    yield "module", data


def framework_events(payload: ChatRequest, *, user=None) -> Iterator[tuple[str, dict[str, Any]]]:
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
    for event_name, data in LOCAL_FRAMEWORKS.stream(
        payload.reasoningFramework,
        question,
        list(payload.images),
        session_key=payload.sessionId,
        engine_session_id=payload.engineSessionId,
        history=payload.history,
        inference_model=payload.inferenceModel,
        reasoning_effort=payload.reasoningEffort,
        resolved_inference_model=payload.resolvedInferenceModel,
        visualization_theme=payload.themeMode,
        runtime_env=globals()["PERSONAL_DATA"].environment(user) if user and globals().get("PERSONAL_DATA") else {},
    ):
        yield event_name, data


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


def installed_package_version(distribution: str) -> str | None:
    """Return the installed distribution version without failing health checks."""
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return None


def locked_dependency_revision(filename: str) -> str | None:
    """Read a pinned dependency revision without making health checks fragile."""
    try:
        revision = json.loads((ROOT / filename).read_text(encoding="utf-8")).get("revision")
    except (OSError, json.JSONDecodeError):
        return None
    return str(revision) if revision else None


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "role": "presentation-gateway",
        "agent": "multi-framework",
        "versions": {
            "mentoraAgent": os.getenv("MENTORA_AGENT_REVISION"),
            "deepseekHarnessSdk": installed_package_version("deepseek-harness-sdk"),
            "deepseekHarnessRuntime": installed_package_version("deepseek-harness-runtime-bin"),
            "mentoraDeal": os.getenv("MENTORA_DEAL_REVISION"),
            "dataVisCharts": locked_dependency_revision("data-vis-charts.lock.json"),
        },
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
def chat(payload: ChatRequest, request: Request, response: Response) -> ChatResponse:
    try:
        final: dict[str, Any] | None = None
        for event_name, data in framework_events(payload,user=chat_identity(request,response)):
            if event_name == "final":
                final = data
        if final is None:
            raise ReasoningFrameworkError(f"{FRAMEWORKS[payload.reasoningFramework]} 未返回最终结果")
        return ChatResponse(**normalize_chat_result(final))
    except (StudioAgentError, ReasoningFrameworkError) as exc:
        raise HTTPException(status_code=502, detail=getattr(exc, 'public_detail', '') or str(exc)) from exc


@app.post("/api/chat/stream")
def chat_stream(payload: ChatRequest, request: Request) -> StreamingResponse:
    if not normalized_question(payload):raise HTTPException(status_code=400, detail="问题不能为空")
    cookie_response=Response()
    owner=chat_identity(request,cookie_response)
    run=CHAT_SESSIONS.start(owner,payload,durable_chat_events)
    response=StreamingResponse(CHAT_SESSIONS.events(owner,run['runId']),media_type='text/event-stream',headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no'})
    response.headers['set-cookie']=cookie_response.headers['set-cookie']
    return response


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
    from app.share_markup import share_markup
    title = html.escape(str(session.get("question") or session.get("title") or "Mentora"))
    answer_html = str(session.get("answerHtml") or "").strip()
    answer_html = answer_html.replace("http://127.0.0.1:8000/", "/")
    answer_html = re.sub(r'(<iframe\b[^>]*?)\sstyle="[^"]*"', r"\1", answer_html, flags=re.I)
    answer_html = re.sub(r'\sdata-(?:resize-observed|chart-embed)="[^"]*"', "", answer_html, flags=re.I)
    theme_mode = "dark" if session.get("themeMode") == "dark" else "light"
    artifacts=session.get('reportArtifacts') if isinstance(session.get('reportArtifacts'),list) else []
    urls=[canonical_host_url(str(a.get('url') or a.get('htmlUrl') or '')) for a in artifacts if isinstance(a,dict)]
    if not urls and session.get('reportUrl'):urls=[canonical_host_url(str(session['reportUrl']))]
    had_markup=bool(answer_html)
    answer_html=share_markup(answer_html,urls,theme_mode,os.getenv('AICHART_BASE_PATH','').strip().rstrip('/'))
    if not answer_html:
        answer_html = f'<div class="plainAnswer">{html.escape(str(session.get("interpretation") or ""))}</div>'
    if not had_markup:answer_html += _share_artifact_frames(session)
    typography=[]
    for key,css_name,low,high in [('shareBodyFontSize','--share-body-font-size',10,40),('shareBodyLineHeight','--share-body-line-height',12,100)]:
        try:value=float(session.get(key,0))
        except (TypeError,ValueError):continue
        if low<=value<=high:typography.append(f'{css_name}:{value:g}px')
    body_style=html.escape(';'.join(typography),quote=True)
    contexts=session.get('shareContextClasses') if isinstance(session.get('shareContextClasses'),list) else []
    context_classes=' '.join(name for name in contexts if name in ('cachedCaseAnswer','cachedReplay'))
    return f'''<!doctype html>
<html lang="zh-CN" data-theme="{theme_mode}" style="color-scheme:{theme_mode}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><link rel="stylesheet" href="/static/styles.css"><link rel="stylesheet" href="/static/vendor/streamviz/streamviz.css"><link rel="stylesheet" href="/static/share-answer.css">
<style>
.shareAnswerDocument{{box-sizing:border-box;width:100%;max-width:none;margin:0;background:transparent}}
.streamvizArtifactHost,.visualize-widget-block{{display:block;width:100%;max-width:100%;height:auto;overflow:visible}}
.visualize-widget-panel{{display:block;width:100%;height:var(--visualize-widget-height,260px)!important;min-height:0;overflow:visible}}
.visualize-widget-frame{{display:block;width:100%;height:var(--visualize-widget-height,260px)!important;border:0;background:transparent}}
</style></head><body style="{body_style}"><main class="shareAnswerDocument {context_classes}"><h1 class="shareAnswerTitle">{title}</h1><section class="mixedReport">{answer_html}</section></main>
<link rel="stylesheet" href="/static/image-viewer.css?v=20261027-viewer6"><script src="/static/image-viewer.js?v=20261027-viewer6"></script>
<script src="/static/share-chart-layout.js"></script></body></html>'''


STREAMVIZ_THEME_PATH = STATIC_DIR / "vendor" / "streamviz" / "artifact-theme.css"
KLINE_THEME_PATH = Path(__file__).parent / "skills/business-chart-recall/assets/kline-theme.css"


def sync_native_kline_theme(artifact: str, theme: str) -> str:
    from app.artifact_upgrades import sync_native_kline_theme as native_theme
    return native_theme(artifact, theme)

def share_streamviz_artifact(filename: str, theme: Literal["light", "dark"] = "light") -> HTMLResponse:
    """Serve a generated StreamViz artifact with the runtime theme frozen in."""
    path = generated_file(filename, ".html")
    try:
        artifact = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=500, detail="cannot read generated artifact") from exc
    from app.search_images import upgrade_image_gallery
    artifact=upgrade_image_gallery(artifact)
    # The same document is served under /share-artifact/ and /generated/.
    # Preserve its original resource directory (images, styles, scripts) when
    # previewing it at the alternate route, including old FLUX documents.
    artifact_base='<base href="/generated/">'
    if not re.search(r'<base\b[^>]*\bhref\s*=',artifact,re.I):
        if re.search(r'<head\b[^>]*>',artifact,re.I):
            artifact=re.sub(r'(<head\b[^>]*>)',lambda m:m[0]+artifact_base,artifact,count=1,flags=re.I)
    artifact = upgrade_legacy_intraday(artifact, theme)
    artifact = upgrade_legacy_grouped_bar(artifact, theme)
    artifact = upgrade_generic_chart_typography(artifact)
    artifact = upgrade_legacy_mobile_charts(artifact, theme)
    artifact = upgrade_native_kline_runtime(artifact)
    artifact = sync_native_kline_theme(artifact, theme)
    artifact = upgrade_widget_generic_chart(artifact)
    artifact = upgrade_widget_tradingview(artifact)
    artifact=upgrade_native_kline_pine(artifact)
    from app.artifact_upgrades import bind_pine_sources
    artifact=bind_pine_sources(artifact,GENERATED_DIR.parent)
    presentation_script=(STATIC_DIR/'artifact-presentation.js').read_text(encoding='utf-8')
    presentation_script+='\n'+(STATIC_DIR/'kline-pine.js').read_text(encoding='utf-8')
    host_controls=f'<script data-artifact-host-theme="{theme}">{presentation_script}</script>'
    artifact=re.sub(r'</body\s*>',lambda _:host_controls+'</body>',artifact,count=1,flags=re.I) if re.search(r'</body\s*>',artifact,re.I) else artifact+host_controls
    runtime_theme = f'<style data-streamviz-theme="dual">{STREAMVIZ_THEME_PATH.read_text(encoding="utf-8")}</style>'
    if 'data-sv-open-layout' not in artifact:
        layout = (Path(__file__).parent / 'skills/streamviz/assets/open-layout.js').read_text(encoding='utf-8')
        runtime_theme += '<script data-sv-open-layout>' + layout + '</script>'
    if 'data-sv-financial-semantics' not in artifact:
        financial=(Path(__file__).parent/'skills/streamviz/assets/financial-semantics.js').read_text(encoding='utf-8')
        runtime_theme+='<script data-sv-financial-semantics>'+financial+'</script>'
    if 'data-sv-chart-geometry' not in artifact:
        geometry = (Path(__file__).parent / 'skills/streamviz/assets/chart-geometry.js').read_text(encoding='utf-8')
        runtime_theme += '<script data-sv-chart-geometry>' + geometry + '</script>'
    if 'data-sv-svg-typography' not in artifact:
        typography = (Path(__file__).parent / 'skills/streamviz/assets/svg-typography.js').read_text(encoding='utf-8')
        runtime_theme += '<script data-sv-svg-typography>' + typography + '</script>'
    if 'data-sv-line-label-layout-v2' not in artifact:
        labels = (Path(__file__).parent / 'skills/streamviz/assets/svg-label-layout.js').read_text(encoding='utf-8')
        runtime_theme += '<script data-sv-line-label-layout-v2>' + labels + '</script>'
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
        base='' if re.search(r'<base\b[^>]*\bhref\s*=',artifact,re.I) else artifact_base
        document = f'<!doctype html><html lang="zh-CN" data-theme="{theme}"><head><meta charset="utf-8">{base}{runtime_theme}</head><body>{artifact}</body></html>'
    return HTMLResponse(document, headers={"Cache-Control": "no-store"})


@app.get("/share-artifact/{filename}", response_class=HTMLResponse)
def shared_streamviz_artifact_page(filename: str, theme: Literal["light", "dark"] = "light") -> HTMLResponse:
    return share_streamviz_artifact(filename, theme)


@app.get('/api/artifacts/{filename}/download')
def download_generated_artifact(filename: str, theme: Literal['light','dark']='light'):
    from app.file_artifacts import FILE_SUFFIXES
    suffix=Path(filename).suffix.lower()
    if suffix not in FILE_SUFFIXES:raise HTTPException(400,'unsupported generated file type')
    path=generated_file(filename,suffix)
    if not path.stat().st_size:raise HTTPException(404,'generated file is empty')
    if suffix=='.html':
        document=share_streamviz_artifact(path.name,theme)
        return Response(content=document.body,media_type='text/html',headers={
            'Content-Disposition':"attachment; filename*=UTF-8''"+quote(path.name),
            'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'})
    return FileResponse(path,filename=path.name,headers={'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'})


def screenshot_base_url(request: Request) -> str:
    configured = os.getenv("AICHART_LOCAL_BASE_URL", "").strip()
    if configured:
        return configured.rstrip("/")
    port = request.url.port or (443 if request.url.scheme == "https" else 80)
    return f"http://127.0.0.1:{port}"


def share_viewport_width(session: dict[str, Any]) -> int:
    """Return the CSS viewport width captured when the user opened Share."""
    try:
        width = int(float(session['shareContentWidth']))+56 if session.get('shareContentWidth') else int(float(session.get("shareViewportWidth") or 1320))
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
    # The answer and its chart documents have independent FontFaceSets.
    # Load the bundled CJK face explicitly so a missing font fails the export
    # instead of silently producing a different Chinese typeface.
    for frame in page.frames:
        frame.evaluate("""async () => {{
            if (!document.fonts) return;
            if ([...document.fonts].some(font => font.family.replaceAll('"', '') === 'Mentora CJK'))
                await document.fonts.load('16px "Mentora CJK"', '中文');
            await document.fonts.ready;
        }}""")
    answer = page.locator(".shareAnswerDocument")
    answer.wait_for(state="visible", timeout=60000)
    page.wait_for_timeout(2500)
    page.evaluate("window.resizeShareCharts?.()")
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
from app.day_tasks import DayTasks, create_router as create_day_router, MARKETS


def run_daily_research(config: dict[str, Any], run_id: str) -> dict[str, Any]:
    import datetime as dt
    from zoneinfo import ZoneInfo
    local_time = dt.datetime.now(ZoneInfo(MARKETS[config['market']]['zone']))
    # Scheduling metadata controls when to run, not what to research. Only
    # expand placeholders explicitly present in the user's research question.
    skill_only=bool(config.get('_workflowSkillOnly'))
    context = (
        "这是 Mentora Deal 定时任务。按任务正文明确约定执行：要求下单时，完成研究、候选筛选、模型决策和账户校验后，"
        "通过 portfolio-order 提交符合条件的订单；如果任务明确仅研究或不下单，必须保持只读。"
        "不得绕过行情时效、置信度、现金、仓位、可卖数量、交易时段及市场规则；卖出仅限实际持仓。"
        "只依据真实订单和账本回执报告成交，未成交说明具体原因。不得修改全局交易设置、设置提醒或向外部渠道发送消息。"
        if config.get('agent') == 'mentora-deal' and not skill_only else
        "这是自动研究任务，只进行信息查询与分析；不得交易、修改账户、设置提醒或向外部渠道发送消息。"
    )
    context += (
        "按项目技能获取数据，注明数据截至时间，缺少实时数据时明确说明，不得编造行情。历史对话仅供对照，每次都应重新核验最新数据。"
        "正文遵循现有渲染规范：使用标准 Markdown，先给出结论，再用二、三级标题分节，候选逐项分段，"
        "用列表或表格呈现可比较信息，关键结论适度加粗；引用写成[来源名称](https://...)，不堆砌裸链接或长篇无分节文字。\n\n"
    )
    question = config['question'].replace('{{date}}', local_time.date().isoformat()).replace('{{market}}', MARKETS[config['market']]['name']).replace('{{symbols}}', config['symbols'])
    payload=ChatRequest(question=context+question,agent='mentora' if skill_only else config.get('agent','mentora'),sessionId='day-'+run_id,reasoningFramework='deepseek',reasoningEffort=config.get('reasoningEffort','low'),themeMode='dark',history=config.get('_history',[]))
    answer=None
    events=framework_events(payload,user=config["_owner"]) if skill_only else durable_chat_events(payload,config['_owner'])
    for event_name,data in events:
        if event_name=='error':
            detail=str(data.get('detail') or data.get('message') or '').strip()
            raise RuntimeError(detail[:500] or '研究流未完成')
        if event_name=='final':
            answer=normalize_chat_result(data);answer['question']=question;data=answer
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


# The private Deal overlay is optional in a generic Mentora checkout.
if (ROOT/'app/portfolio.py').is_file():
    from app.portfolio import Portfolio, create_router as create_portfolio_router
    PORTFOLIO = Portfolio(Path(os.getenv('VEYA_PORTFOLIO_DATA_DIR', str(ROOT / 'outputs' / 'portfolio'))), DAY_TASKS)
    app.include_router(create_portfolio_router(PORTFOLIO))
    from app.personal_data import PersonalDataBridge
    PERSONAL_DATA=PersonalDataBridge(PORTFOLIO)

    @app.on_event('startup')
    def start_portfolio():
        if os.getenv('VEYA_PORTFOLIO_SCHEDULER', '1') != '0':
            PORTFOLIO.start()

    @app.on_event('shutdown')
    def stop_portfolio():
        PERSONAL_DATA.close()
        PORTFOLIO.stop()


# Workflow tasks share the same owner, scheduler and Agent execution runtime.
from app.workflows import WorkflowService, create_router as create_workflow_router
WORKFLOWS=WorkflowService(DAY_TASKS,globals().get("PORTFOLIO"),run_daily_research)
app.include_router(create_workflow_router(WORKFLOWS))
