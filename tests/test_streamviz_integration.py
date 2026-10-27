import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import presentation
from app.artifact_upgrades import _native_kline
from app.native_streamviz import _flatten_native_canvas, _repair_streamed_html


ROOT = Path(__file__).resolve().parents[1]


def test_chat_body_matches_streamviz_default_body_size() -> None:
    styles = (ROOT / "app/static/styles.css").read_text(encoding="utf-8")
    assert "--chat-body-font-size: 16px;" in styles
    for selector in (".bubble", ".answerText", ".streamingAnswer"):
        rule = styles.split(selector + " {", 1)[1].split("}", 1)[0]
        assert "font-size: var(--chat-body-font-size);" in rule
    source = (ROOT / "app/static/app.js").read_text(encoding="utf-8")
    assert '/static/share-answer.css' in source
    assert 'var(--share-body-font-size,var(--chat-body-font-size))' in (ROOT/'app/static/share-answer.css').read_text()


def test_streamviz_dependency_and_bundle_are_present() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert package["dependencies"]["streamviz-react"].startswith("https://codeload.github.com/weiweidesigner/streamviz/tar.gz/")
    assert (ROOT / "app/static/vendor/streamviz/streamviz.js").stat().st_size > 0
    assert (ROOT / "app/static/vendor/streamviz/streamviz.css").stat().st_size > 0


def test_streamviz_uses_pinned_repository_source_and_shared_theme() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    dependency = package["dependencies"]["streamviz-react"]
    assert dependency.endswith("e3a0c79741b3b26510b72e4ec1159237e77ccde0")
    assert lock["packages"]["node_modules/streamviz-react"]["resolved"] == dependency
    config = (ROOT / "vite.streamviz.config.js").read_text(encoding="utf-8")
    assert "node_modules/streamviz-react/src/index.ts" in config
    assert 'find: "../theme/artifact-theme.css?raw"' in config
    assert 'resolve("app/skills/streamviz/assets/artifact-theme.css")' in config


def test_streamviz_browser_bundle_has_no_node_process_dependency() -> None:
    bundle = (ROOT / "app/static/vendor/streamviz/streamviz.js").read_text(encoding="utf-8")
    assert "process.env.NODE_ENV" not in bundle


def test_streamviz_build_uses_upstream_runtime_without_bundle_rewrites() -> None:
    config = (ROOT / "vite.streamviz.config.js").read_text(encoding="utf-8")

    assert "aime-streamviz-tall-artifacts" not in config
    assert ".replace(" not in config


def test_streamviz_host_applies_reported_iframe_height() -> None:
    source = (ROOT / "app/static/app.js").read_text(encoding="utf-8")

    assert 'data?.type !== "visualize-widget:size"' in source
    assert 'frame.style.setProperty("height", value, "important")' in source


def test_shared_page_keeps_streamviz_iframe_dimensions() -> None:
    page = presentation.standalone_share_html({"title": "测试", "answerHtml": "<div></div>"})

    assert '/static/vendor/streamviz/streamviz.css' in page
    assert '.visualize-widget-frame{display:block;width:100%;height:var(--visualize-widget-height,260px)!important;' in page


def test_shared_page_uses_saved_theme_and_full_viewport_width() -> None:
    page = presentation.standalone_share_html({
        "title": "测试",
        "answerHtml": "<div>内容</div>",
        "themeMode": "dark",
    })

    assert '<html lang="zh-CN" data-theme="dark" style="color-scheme:dark">' in page
    assert '/static/share-answer.css' in page
    assert 'background:var(--bg);color:var(--ink)' in (ROOT/'app/static/share-answer.css').read_text()
    assert ".shareAnswerDocument{box-sizing:border-box;width:100%;max-width:none" in page


def test_share_viewport_width_uses_saved_client_width_with_safe_bounds() -> None:
    assert presentation.share_viewport_width({"shareViewportWidth": 2048}) == 2048
    assert presentation.share_viewport_width({"shareViewportWidth": 9999}) == 3840
    assert presentation.share_viewport_width({"shareViewportWidth": "invalid"}) == 1320


def test_share_client_persists_live_theme_and_viewport_width() -> None:
    source = (ROOT / "app/static/app.js").read_text(encoding="utf-8")

    assert "session.themeMode = currentThemeMode();" in source
    assert "session.shareViewportWidth = Math.round(" in source
    assert "window.visualViewport?.width || window.innerWidth" in source
    assert 'url.searchParams.set("theme", theme)' in source
    assert 'const answer = shareAnswerMarkup(session);' in source


def test_share_image_captures_document_instead_of_full_viewport() -> None:
    source = (ROOT / "app/presentation.py").read_text(encoding="utf-8")

    assert 'answer.screenshot(path=str(output)' in source


def test_dark_theme_styles_tool_activity_blocks() -> None:
    styles = (ROOT / "app/static/styles.css").read_text(encoding="utf-8")

    assert ':root[data-theme="dark"] .toolStepBlock {' in styles
    assert "background: #080808;" in styles
    assert "border: 1px solid #303030;" in styles
    assert ':root[data-theme="dark"] .toolStepBlock code {' in styles
    assert "color: #dce4ef;" in styles


def test_shared_page_replaces_live_streamviz_dom_with_saved_artifact() -> None:
    page = presentation.standalone_share_html({
        "title": "测试",
        "answerHtml": '<p>解读</p><div class="streamvizArtifactHost"><div>临时组件</div></div>',
        "reportArtifacts": [{"url": "/generated/report.html"}],
    })

    assert "临时组件" not in page
    assert '<iframe class="reportDocumentFrame" src="/share-artifact/report.html?theme=light"' in page


def test_shared_streamviz_artifact_freezes_runtime_theme(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    (tmp_path / "report.html").write_text('<section><rect fill="var(--sv-chart-series-1)"></rect></section>', encoding="utf-8")

    page = presentation.share_streamviz_artifact("report.html")

    assert "--sv-chart-series-1:#4d63f6" in page.body.decode("utf-8")
    assert 'data-theme="light"' in page.body.decode("utf-8")
    dark = presentation.share_streamviz_artifact("report.html", theme="dark").body.decode("utf-8")
    assert 'data-theme="dark"' in dark
    assert 'data-streamviz-theme="dual"' in dark
    assert '--sv-text-primary:#f5f5f5' in dark
    assert '--sv-surface-primary:#181818' in dark
    assert 'data-sv-financial-semantics' in dark


def test_saved_native_kline_follows_host_theme_without_changing_data(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    artifact = '''<!doctype html><html><head></head><body>
    <div data-kline-contract="{}"><canvas id="kline-canvas"></canvas></div>
    <script>(() => {
      const config = {"code": "000001.SH", "themeMode": "light", "candleColorMode": "red_up_green_down"};
      const canvas = document.getElementById('kline-canvas');
      const dataByPeriod = {"1d": [{"close": 3797.24}]};
    })();</script>
    <script>const config = {"themeMode": "light"};</script></body></html>'''
    (tmp_path / "index.html").write_text(artifact, encoding="utf-8")
    for mode in ("dark", "light"):
        page = presentation.share_streamviz_artifact("index.html", theme=mode).body.decode()
        assert f'"code": "000001.SH", "themeMode": "{mode}"' in page
        assert '"candleColorMode": "red_up_green_down"' in page
        assert 'const dataByPeriod = {"1d": [{"close": 3797.24}]};' in page
        assert '<script>const config = {"themeMode": "light"};</script>' in page
        assert 'data-kline-theme="dual"' in page
        assert '--kl-text:#e6edf3' in page
    assert (tmp_path / "index.html").read_text(encoding="utf-8") == artifact


def test_native_kline_compatibility_does_not_patch_generic_artifacts() -> None:
    artifact = '<html><head></head><body><script>const config = {"themeMode": "light"};</script></body></html>'
    assert presentation.sync_native_kline_theme(artifact, "dark") == artifact


def test_saved_native_kline_gets_live_config_runtime_without_refetching(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    rows = [
        {"time": 1700000000000 + index * 86400000, "open": 100 + index,
         "high": 102 + index, "low": 99 + index, "close": 101 + index, "volume": 1000 + index}
        for index in range(90)
    ]
    payload = {"type": "kline", "props": {"code": "AAPL", "dataType": "1d", "availablePeriods": ["1d"]}, "dataByPeriod": {"1d": rows}}
    legacy = _native_kline().render_document(payload).replace("mentora:kline-config", "legacy:kline-config")
    (tmp_path / "legacy-kline.html").write_text(legacy, encoding="utf-8")
    page = presentation.share_streamviz_artifact("legacy-kline.html", theme="dark").body.decode()
    assert "mentora:kline-config" in page
    assert '"close": 190' in page
    assert '"code": "AAPL"' in page


def test_streamviz_repairs_streaming_whitespace_in_list_markup() -> None:
    repaired = _repair_streamed_html('<ulstyle="margin:8px 00;padding-left:18px"><li>风险</li></ul>')

    assert '<ul style="margin:8px 0 0;padding-left:18px">' in repaired


def test_streamviz_repairs_streaming_whitespace_in_svg_polyline() -> None:
    repaired = _repair_streamed_html('<polylinepoints="10,20 30,40" stroke="red"></polyline>')

    assert '<polyline points="10,20 30,40" stroke="red">' in repaired


def test_streamviz_repairs_missing_spaces_between_svg_points() -> None:
    repaired = _repair_streamed_html('<polyline points="166,117290,230414,246"></polyline>')

    assert 'points="166,117 290,230 414,246"' in repaired


def test_native_streamviz_canvas_removes_root_width_constraints() -> None:
    flattened = _flatten_native_canvas('<section><div style="max-width:960px;margin:0 auto">chart</div></section>')

    assert 'class="sv-native-canvas"' in flattened
    assert 'max-width:none!important' in flattened


def test_native_streamviz_prompt_requires_aligned_dual_axis_labels() -> None:
    from app.native_streamviz import SYSTEM_PROMPT

    assert "shared plot rectangle" in SYSTEM_PROMPT
    assert "dedicated band below the x-axis" in SYSTEM_PROMPT


def test_native_streamviz_prompt_limits_horizontal_chart_side_gutters() -> None:
    from app.native_streamviz import SYSTEM_PROMPT

    assert "no more than 12%" in SYSTEM_PROMPT
    assert "do not\ninsert decorative outer gutters" in SYSTEM_PROMPT


def test_native_streamviz_prompt_requires_outside_bar_labels() -> None:
    from app.native_streamviz import SYSTEM_PROMPT

    assert "put the value in the reserved value column" in SYSTEM_PROMPT
    assert "Never place dark text over a colored bar" in SYSTEM_PROMPT


def test_native_streamviz_prompt_requires_svg_boundary_and_category_checks() -> None:
    from app.native_streamviz import SYSTEM_PROMPT

    assert "stays inside its viewBox" in SYSTEM_PROMPT
    assert "distinct x position" in SYSTEM_PROMPT


def test_native_streamviz_prompt_prevents_svg_text_upscaling_and_label_overlap() -> None:
    from app.native_streamviz import SYSTEM_PROMPT

    assert "Never stretch a small fixed-viewBox SVG" in SYSTEM_PROMPT
    assert "must not shrink the plot itself" in SYSTEM_PROMPT
    assert "use container-query font-size compensation" in SYSTEM_PROMPT
    assert "end the viewBox just after the x-axis label band" in SYSTEM_PROMPT
    assert "axis and data labels must never appear larger than the title" in SYSTEM_PROMPT
    assert "two centered `tspan` lines" in SYSTEM_PROMPT
    assert '`vector-effect="non-scaling-stroke"`' in SYSTEM_PROMPT
    assert "ordinary bars about 20–32px thick" in SYSTEM_PROMPT
    assert "edge touching the zero/category axis must be square" in SYSTEM_PROMPT
    assert "round only the free outer end" in SYSTEM_PROMPT
    assert "positive bars round only the top" in SYSTEM_PROMPT
    assert "negative bars round only the bottom" in SYSTEM_PROMPT
    assert "Place compact legends below the" in SYSTEM_PROMPT
    assert "outside the SVG/canvas" in SYSTEM_PROMPT
    assert "centered as a group" in SYSTEM_PROMPT
    assert "ranked rows 36–44px" in SYSTEM_PROMPT
    assert "more than seven categories" in SYSTEM_PROMPT
    assert "use `align-items:start`" in SYSTEM_PROMPT
    assert "instead of stretching to match" in SYSTEM_PROMPT


def test_page_loads_streamviz_before_application_bundle() -> None:
    html = (ROOT / "app/static/index.html").read_text(encoding="utf-8")
    streamviz_index = html.index("/static/vendor/streamviz/streamviz.js")
    app_index = html.index("/static/app.js")
    assert streamviz_index < app_index


def test_streamviz_artifacts_refresh_without_stale_browser_cache() -> None:
    source = (ROOT / "app/static/app.js").read_text(encoding="utf-8")
    presentation_source = (ROOT / "app/presentation.py").read_text(encoding="utf-8")

    assert 'artifactSource.searchParams.set("v", String(Date.now()))' in source
    assert "streamVisualizationCodeCache.delete(absoluteUrl)" in source
    assert '"/generated/", "/share-artifact/"' in presentation_source


def test_artifact_only_sessions_are_restorable_after_refresh() -> None:
    source = (ROOT / "app/static/app.js").read_text(encoding="utf-8")

    assert source.count("session.reportArtifacts.some((item) => item?.url)") >= 2


def test_streamviz_handles_stream_events_and_preserves_iframe_fallback() -> None:
    source = (ROOT / "app/static/app.js").read_text(encoding="utf-8")
    assert 'eventName === "visualization"' in source
    assert 'eventName === "visualize_widget"' in source
    assert "/<iframe\\b/i.test(source)" in source
    assert "createArtifactFallbackFrame" in source


def test_finished_html_is_published_once_without_synthetic_deltas():
    module={"htmlUrl":"/generated/sample.html","label":"Chart"}
    assert list(presentation.streamviz_events_for_module(module))==[("module",module)]

def test_durable_chat_streams_generated_html_and_places_unmarked_artifact(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    monkeypatch.setenv("AICHART_STREAMVIZ_FRAME_DELAY", "0")
    report = tmp_path / "live-report.html"
    report.write_text("<!doctype html><html><body><section>live</section></body></html>", encoding="utf-8")

    def upstream(_payload):
        yield "module", {"htmlUrl": "/generated/live-report.html", "label": "Live report"}
        yield "final", {"interpretation": "报告已生成", "reportArtifacts": []}

    monkeypatch.setattr(presentation, "framework_events", upstream)
    events = list(presentation.durable_chat_events(
        presentation.ChatRequest(question="生成 HTML 报告"), "owner",
    ))

    assert events[0][0] == "module"
    assert not any(name == "visualization" for name, data in events)
    final = next(data for name, data in events if name == "final")
    assert final["reportArtifacts"] == [{"url": "/generated/live-report.html", "label": "Live report"}]
    assert "[[AIME_CHART:/generated/live-report.html]]" in final["interpretation"]


def test_script_backed_html_is_published_as_live_iframe_module(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    (tmp_path / "interactive.html").write_text(
        "<!doctype html><html><body><main>interactive</main><script>void 0</script></body></html>",
        encoding="utf-8",
    )
    module = {"htmlUrl": "/generated/interactive.html", "label": "Interactive"}
    events = list(presentation.streamviz_events_for_module(module))
    assert events == [("module", module)]
    assert not module.get("streamvizCompatible")


def test_frontend_buffers_visualizations_and_iframe_modules_until_answer_text() -> None:
    source = (ROOT / "app/static/app.js").read_text(encoding="utf-8")
    queue = source[source.index("function queueStreamVisualization"):source.index("function revealPendingVisualizations")]
    module = source[source.index("function appendStreamVisualizationModule"):source.index("function renderStreamAnswerText")]
    assert "!article.answerTextStarted" not in queue
    assert "article.pendingVisualizations" not in queue
    assert "upsertStreamVisualization(article, data)" in queue
    assert "!article.answerTextStarted" not in module
    assert "article.pendingVisualizationModules" not in module
    assert "createArtifactFallbackFrame" in module


def test_answer_text_stream_finishes_before_buffered_visualization(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    monkeypatch.setenv("AICHART_STREAMVIZ_FRAME_DELAY", "0")
    (tmp_path / "ordered.html").write_text("<html><body><p>chart</p></body></html>", encoding="utf-8")
    long_answer = "先展示文本。" * 80

    def upstream(_payload):
        yield "module", {"htmlUrl": "/generated/ordered.html"}
        yield from presentation.LOCAL_FRAMEWORKS._answer_text_events(long_answer)
        yield "final", {"interpretation": long_answer, "reportArtifacts": []}

    monkeypatch.setattr(presentation, "framework_events", upstream)
    events = list(presentation.durable_chat_events(presentation.ChatRequest(question="ordered"), "owner"))
    answer_indexes = [index for index, (name, _data) in enumerate(events) if name == "answer_text"]
    assert len(answer_indexes) == 1
    assert events[answer_indexes[0]][1]["text"] == long_answer
    assert [name for name,_ in events] == ["module","answer_text","final"]


def test_native_streamviz_stays_in_same_agent_loop(monkeypatch):
    expected=[("answer_text",{"blockId":"a","delta":"first"}),("visualization",{"id":"v","argumentDelta":"actual"}),("answer_text",{"blockId":"b","delta":"second"}),("final",{"interpretation":"first second"})]
    monkeypatch.setattr(presentation.LOCAL_FRAMEWORKS,"stream",lambda *args,**kwargs:iter(expected))
    monkeypatch.setattr(presentation,"stream_native_widget",lambda *args,**kwargs:(_ for _ in ()).throw(AssertionError("second model pass")))
    assert list(presentation.framework_events(presentation.ChatRequest(question="streamviz",reasoningFramework="deepseek")))==expected

def test_streamviz_model_failure_keeps_existing_html(tmp_path, monkeypatch) -> None:
    report = {"interpretation": "事实", "reportUrl": "/generated/evidence.html", "reportArtifacts": [{"url": "/generated/evidence.html"}]}
    def upstream(*_args, **_kwargs):
        yield "final", report
    def native(*_args, **_kwargs):
        yield "visualization", {"id": "failed", "argumentDelta": "{"}
        raise RuntimeError("renderer unavailable")
    monkeypatch.setattr(presentation.LOCAL_FRAMEWORKS, "stream", upstream)
    monkeypatch.setattr(presentation, "stream_native_widget", native)
    events = list(presentation.framework_events(presentation.ChatRequest(question="用 streamviz 展示", reasoningFramework="deepseek")))
    assert not any(name == "visualization" for name, data in events)
    assert events[-1] == ("final", report)


def test_nested_iframe_module_keeps_existing_renderer(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    (tmp_path / "nested.html").write_text("<main><iframe srcdoc='x'></iframe></main>", encoding="utf-8")
    module = {"htmlUrl": "/generated/nested.html", "label": "多分时"}

    events = list(presentation.streamviz_events_for_module(module))

    assert events == [("module", module)]
    assert not module.get("streamvizCompatible")


def test_mobile_artifact_layout_is_owned_by_streamviz() -> None:
    css = presentation.STREAMVIZ_THEME_PATH.read_text(encoding="utf-8")
    assert 'min-width:0' in css
    assert '@media(max-width:640px)' in css
    assert '.metrics{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))!important}' in css
    assert 'white-space:normal;overflow-wrap:anywhere' in css
    assert '.svx .bd{min-width:0!important}' in css


def test_project_streamviz_hides_copy_and_download_actions() -> None:
    bridge = (ROOT / "frontend/streamviz-entry.jsx").read_text(encoding="utf-8")
    assert 'normalizeStreamVisualizationPayload(payload)' in bridge
    payload = (ROOT / 'node_modules/streamviz-react/src/react/payload.ts').read_text(encoding='utf-8')
    assert 'showActions: false' in payload
    assert not (ROOT / 'frontend/local-streaming-preview.jsx').exists()


def test_streamviz_compact_spacing_and_centered_line_dots() -> None:
    css = presentation.STREAMVIZ_THEME_PATH.read_text(encoding="utf-8")
    assert '--sv-card-gap:16px;--sv-card-padding:12px;--sv-component-gap:8px' in css
    assert 'transform:translate(-50%,-50%)' in css
    assert 'flex-direction:column!important;gap:var(--sv-component-gap)!important' in css
    assert '[data-sv-layout="metrics"]' in css
    assert 'margin-block:0!important' in css
    assert 'box-sizing:border-box;padding-top:8px' in css
    assert '.card>h2:has(+.sv-responsive-line)' not in css


def test_final_artifacts_are_not_replayed_as_fake_deltas(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    monkeypatch.setenv("AICHART_STREAMVIZ_FRAME_DELAY", "0")
    (tmp_path / "final-chart.html").write_text(
        "<!doctype html><html><body><div>final chart</div></body></html>",
        encoding="utf-8",
    )

    def fake_framework_events(_payload):
        yield "final", {
            "reportArtifacts": [{"url": "/generated/final-chart.html", "title": "最终图表"}],
            "interpretation": "done",
        }

    monkeypatch.setattr(presentation, "framework_events", fake_framework_events)
    response = TestClient(presentation.app).post(
        "/api/chat/stream",
        json={"question": "test", "reasoningFramework": "deepseek"},
    )

    assert response.status_code == 200
    assert "event: visualization" not in response.text
    assert "event: final" in response.text
    assert '"delta"' not in response.text
    payload=[json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")][-1]
    assert payload["reportArtifacts"][0]["url"]=="/generated/final-chart.html"


def test_prefixed_cloud_artifacts_remain_visible_in_shared_report(monkeypatch):
    from app import presentation
    monkeypatch.setenv("AICHART_BASE_PATH", "/veya")
    markup = presentation.standalone_share_html({
        "question": "Cloud report", "interpretation": "A trend",
        "reportArtifacts": [{"url": "/veya/generated/cloud-check.html"}], "themeMode": "dark",
    })
    assert 'src="/share-artifact/cloud-check.html?theme=dark"' in markup
    assert presentation.canonical_host_url("/veya/generated/chart.html") == "/generated/chart.html"
    assert presentation.canonical_host_url("https://example.com/veya/generated/chart.html").startswith("https://example.com/")


def test_chat_stream_preserves_public_text_and_real_widget_events_with_html_publishing(monkeypatch):
    def events(_payload):
        yield "module", {"htmlUrl":"/generated/evidence.html"}
        yield "answer_text", {"text":"公开分析正文", "replace":True}
        yield "visualization", {"id":"native-widget", "delta":"<p>actual model delta</p>"}
        yield "final", {"interpretation":"公开分析正文", "reportArtifacts":[{"url":"/generated/evidence.html"}]}
    monkeypatch.setattr(presentation, "framework_events", events)
    response=TestClient(presentation.app).post("/api/chat/stream",json={"question":"test", "reasoningFramework":"deepseek"})
    assert response.status_code==200
    names=[line[7:] for line in response.text.splitlines() if line.startswith('event: ')]
    assert names==["module", "answer_text", "visualization", "final"]


def test_embedded_runtime_bundles_the_current_mobile_metric_and_table_contract():
    bundle = (ROOT / "app/static/vendor/streamviz/streamviz.js").read_text()
    assert "Mobile summary metrics form compact swipeable cards" in bundle
    assert "Table headers stay on one line" in bundle


def test_shared_cached_case_keeps_its_report_frame_and_rejects_nonlocal_urls():
    page = presentation.standalone_share_html({
        "question": "缓存问句", "answerHtml": '<div class="streamvizArtifactHost"><div>live host</div></div><p>缓存正文</p>',
        "reportArtifacts": [{"url": "/static/cases/ashare-dashboard/case-ashare-streamviz-report.html"}, {"url": "https://example.com/report.html"}, {"url": "/static/cases/../private.html"}],
    })
    assert 'src="/static/cases/ashare-dashboard/case-ashare-streamviz-report.html"' in page
    assert "缓存问句" in page and "缓存正文" in page
    assert "live host" not in page
    assert 'src="https://example.com/report.html"' not in page
    assert '/static/cases/../private.html' not in page
