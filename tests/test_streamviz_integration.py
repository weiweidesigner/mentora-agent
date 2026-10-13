import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import presentation
from app.native_streamviz import _flatten_native_canvas, _repair_streamed_html


ROOT = Path(__file__).resolve().parents[1]


def test_chat_body_matches_streamviz_default_body_size() -> None:
    styles = (ROOT / "app/static/styles.css").read_text(encoding="utf-8")
    assert "--chat-body-font-size: 16px;" in styles
    for selector in (".bubble", ".answerText", ".streamingAnswer"):
        rule = styles.split(selector + " {", 1)[1].split("}", 1)[0]
        assert "font-size: var(--chat-body-font-size);" in rule
    source = (ROOT / "app/static/app.js").read_text(encoding="utf-8")
    assert ".streamingAnswer{font-size:16px;line-height:1.65}" in source


def test_streamviz_dependency_and_bundle_are_present() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert package["dependencies"]["streamviz-react"].startswith("https://codeload.github.com/weiweidesigner/streamviz/tar.gz/")
    assert (ROOT / "app/static/vendor/streamviz/streamviz.js").stat().st_size > 0
    assert (ROOT / "app/static/vendor/streamviz/streamviz.css").stat().st_size > 0


def test_streamviz_uses_pinned_repository_source_and_shared_theme() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    dependency = package["dependencies"]["streamviz-react"]
    assert dependency.endswith("04365a23cfb7562489e63ff74fb401571a7db67a")
    assert lock["packages"]["node_modules/streamviz-react"]["resolved"] == dependency
    config = (ROOT / "vite.streamviz.config.js").read_text(encoding="utf-8")
    assert "node_modules/streamviz-react/src/index.ts" in config
    assert "node_modules/streamviz-react/src/theme/artifact-theme.css" in config


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
    assert "background:#10131a;color:#eef2f7" in page
    assert "body{box-sizing:border-box;padding:0}" in page
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
    assert "background: #171e28;" in styles
    assert ':root[data-theme="dark"] .toolStepBlock code {' in styles
    assert "color: #dce4ef;" in styles


def test_shared_page_replaces_live_streamviz_dom_with_saved_artifact() -> None:
    page = presentation.standalone_share_html({
        "title": "测试",
        "answerHtml": '<p>解读</p><div class="streamvizArtifactHost"><div>临时组件</div></div>',
        "reportArtifacts": [{"url": "/generated/report.html"}],
    })

    assert "临时组件" not in page
    assert '<iframe class="reportDocumentFrame" src="/share-artifact/report.html"' in page


def test_shared_streamviz_artifact_freezes_runtime_theme(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    (tmp_path / "report.html").write_text('<section><rect fill="var(--sv-chart-series-1)"></rect></section>', encoding="utf-8")

    page = presentation.share_streamviz_artifact("report.html")

    assert "--sv-chart-series-1:#4d63f6" in page.body.decode("utf-8")
    assert 'data-theme="light"' in page.body.decode("utf-8")
    dark = presentation.share_streamviz_artifact("report.html", theme="dark").body.decode("utf-8")
    assert 'data-theme="dark"' in dark
    assert 'data-streamviz-theme="dual"' in dark
    assert '--sv-text-primary:#f1f5f9' in dark


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


def test_module_html_is_emitted_as_streamviz_deltas(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    monkeypatch.setenv("AICHART_STREAMVIZ_FRAME_DELAY", "0")
    code = "<!doctype html><html><body><section>streamed</section></body></html>"
    (tmp_path / "sample.html").write_text(code, encoding="utf-8")
    module = {"htmlUrl": "/generated/sample.html", "label": "示例图表"}

    events = list(presentation.streamviz_events_for_module(module))

    assert events[0][0] == "visualization"
    assert events[0][1]["reset"] is True
    assert events[0][1]["htmlUrl"] == "/generated/sample.html"
    assert events[-2][0] == "visualization"
    assert events[-2][1]["final"] is True
    assert events[-1] == ("module", module)
    streamed_code = "".join(item[1].get("delta", "") for item in events)
    assert "streamed" in streamed_code
    assert 'data-aime-streamviz-root="true"' in streamed_code
    assert module["streamvizCompatible"] is True


def test_explicit_streamviz_uses_model_deltas_even_with_upstream_html(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    old = tmp_path / "evidence.html"
    old.write_text('<section>已核验的事实</section>', encoding="utf-8")
    def upstream(*_args, **_kwargs):
        yield "module", {"htmlUrl": "/generated/evidence.html"}
        yield "final", {"interpretation": f"事实\n[[AIME_CHART:{old}]]", "reportUrl": "/generated/evidence.html", "reportArtifacts": [{"url": "/generated/evidence.html"}]}
    def native(_question, _dir, *, evidence, theme_mode):
        assert "已核验的事实" in evidence
        yield "visualization", {"id": "live", "argumentDelta": '{"widget_code":"<section>事实'}
        yield "final", {"reportArtifacts": [{"url": "/generated/live.html", "path": str(tmp_path / "live.html")}]}
    monkeypatch.setattr(presentation.LOCAL_FRAMEWORKS, "stream", upstream)
    monkeypatch.setattr(presentation, "stream_native_widget", native)
    events = list(presentation.framework_events(presentation.ChatRequest(question="用 streamviz 展示", reasoningFramework="deepseek")))
    assert [name for name, _data in events] == ["visualization", "final"]
    assert events[-1][1]["reportArtifacts"][0]["url"] == "/generated/live.html"
    assert "[[AIME_CHART:" + str(tmp_path / "live.html") + "]]" in events[-1][1]["interpretation"]


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
    assert any(data.get("discard") for name, data in events if name == "visualization")
    assert events[-1] == ("final", report)


def test_nested_iframe_module_keeps_existing_renderer(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(presentation, "GENERATED_DIR", tmp_path)
    (tmp_path / "nested.html").write_text("<main><iframe srcdoc='x'></iframe></main>", encoding="utf-8")
    module = {"htmlUrl": "/generated/nested.html", "label": "多分时"}

    events = list(presentation.streamviz_events_for_module(module))

    assert events == [("module", module)]
    assert module["streamvizCompatible"] is False


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


def test_final_artifacts_stream_before_final_answer(tmp_path, monkeypatch) -> None:
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
    assert response.text.index("event: visualization") < response.text.index("event: final")
    assert '"delta"' in response.text
    assert '"final": true' in response.text


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
