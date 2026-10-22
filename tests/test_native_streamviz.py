from __future__ import annotations

from app import native_streamviz


class _FakeCompletions:
    def create(self, **_kwargs):
        # Deliberately split in the middle of JSON/SVG so the adapter's delta
        # contract is exercised rather than only the completed artifact path.
        return iter([
            {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "call_1", "function": {"name": "visualize_show_widget", "arguments": '{"title":"流式图","widget_code":"<svg' }}]}}]},
            {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": ' viewBox=\\"0 0 10 10\\"><circle cx=\\"5\\" cy=\\"5\\" r=\\"4\\"/></svg>","loading_messages":["搭建中"]}' }}]}}]},
        ])


class _FakeClient:
    class chat:
        completions = _FakeCompletions()


def test_native_tool_arguments_are_forwarded_as_visualization_deltas(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(native_streamviz, "_client_from_env", lambda: (_FakeClient(), "test-tools-model"))

    events = list(native_streamviz.stream_native_widget("画一个圆", tmp_path))

    visualization = [data for name, data in events if name == "visualization"]
    assert visualization[0]["reset"] is True
    assert visualization[1]["argumentDelta"].startswith('{"title"')
    assert visualization[2]["argumentDelta"].startswith(" viewBox")
    assert visualization[-1]["final"] is True
    assert visualization[-1]["htmlUrl"].startswith("/generated/native-streamviz-")
    final = next(data for name, data in events if name == "final")
    assert final["reportArtifacts"][0]["url"].startswith("/generated/native-streamviz-")
    assert final["fileArtifacts"][0]["type"] == "HTML"
    assert final["fileArtifacts"][0]["downloadUrl"].endswith("/download")
    assert "<circle" in (tmp_path / final["reportArtifacts"][0]["path"].split("/")[-1]).read_text(encoding="utf-8")


def test_streamed_html_whitespace_repair_keeps_svg_renderable() -> None:
    source = '<svgxmlns="x"viewBox="00900340"style="width:100%"><markerid="a"viewBox="001010"></marker><linex1="1"y1="2"stroke="x"stroke-width="1pxsolidvar(--x)"></line></svg>'

    repaired = native_streamviz._repair_streamed_html(source)

    assert '<svg xmlns="x" viewBox="0 0 900 340" style=' in repaired
    assert '<marker id="a"' in repaired
    assert 'viewBox="0 0 10 10"' in repaired
    assert 'x1="1" y1="2"' in repaired
    assert '1px solid var(--x)' in repaired


def test_empty_native_widget_is_not_persisted(tmp_path) -> None:
    assert native_streamviz._save_widget(tmp_path, "空图", "") is None
