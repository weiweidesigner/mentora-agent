import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "app/skills/streamviz/scripts/render_streamviz.py"


def test_streamviz_is_registered_as_a_collaborating_skill() -> None:
    bridge = (ROOT / ".agents/skills/streamviz/SKILL.md").read_text(encoding="utf-8")
    skill = (ROOT / "app/skills/streamviz/SKILL.md").read_text(encoding="utf-8")

    assert "name: streamviz" in bridge
    assert "presentation stage" in bridge
    assert "展示 Skill" in skill
    assert "数据、搜索、计算、分析" in skill
    assert "不得跳过前两步" in skill


def test_renderer_uses_only_supplied_evidence_and_omits_missing_metrics(tmp_path: Path) -> None:
    source = tmp_path / "payload.json"
    output = tmp_path / "market.html"
    source.write_text(json.dumps({
        "title": "市场 <复盘>",
        "summary": "来自上游验证的数据。",
        "metrics": [{"label": "上证指数", "value": "+0.18%", "detail": "收盘"}],
        "flow": {
            "nodes": [
                {"id": "news", "label": "消息面", "detail": "已验证"},
                {"id": "market", "label": "市场表现", "detail": "收盘数据"},
            ],
            "edges": [{"from": "news", "to": "market", "label": "传导"}],
        },
        "note": "截至收盘。",
    }, ensure_ascii=False), encoding="utf-8")

    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--input", str(source), "--output", str(output)],
        check=True,
        text=True,
        capture_output=True,
    )
    report = json.loads(result.stdout)
    page = output.read_text(encoding="utf-8")

    assert report["ok"] is True
    assert report["tool"] == "streamviz"
    assert report["output"] == str(output.resolve())
    assert "市场 &lt;复盘&gt;" in page
    assert "+0.18%" in page
    assert "消息面" in page and "市场表现" in page
    assert "→" in page
    assert "—" not in page
    assert "background:transparent" in page
    assert "height:520" not in page


def test_renderer_can_compose_non_card_evidence_blocks(tmp_path: Path) -> None:
    source = tmp_path / "comparison.json"
    output = tmp_path / "comparison.html"
    source.write_text(json.dumps({
        "layout": "comparison",
        "title": "板块对照",
        "blocks": [
            {"type": "table", "title": "指数", "columns": ["名称", "涨跌幅"], "rows": [
                {"名称": "沪深 300", "涨跌幅": "+0.5%"},
            ]},
            {"type": "timeline", "title": "盘中节点", "items": [
                {"time": "10:00", "label": "成交放量", "detail": "上游记录"},
            ]},
            {"type": "rankings", "title": "排名", "items": [
                {"label": "半导体", "value": "+1.2%", "detail": "已验证"},
            ]},
        ],
    }, ensure_ascii=False), encoding="utf-8")

    subprocess.run([sys.executable, str(SCRIPT), "--input", str(source), "--output", str(output)], check=True)
    page = output.read_text(encoding="utf-8")

    assert 'sv--comparison' in page
    assert "沪深 300" in page
    assert "成交放量" in page
    assert "半导体" in page


def test_renderer_preserves_an_evidence_backed_custom_html_artifact(tmp_path: Path) -> None:
    source = tmp_path / "custom.json"
    output = tmp_path / "custom.html"
    source.write_text(json.dumps({
        "html": "<style>.custom{color:teal}</style><section class='custom'><svg viewBox='0 0 20 20'><circle cx='10' cy='10' r='8'/></svg>真实上游值</section>",
    }, ensure_ascii=False), encoding="utf-8")

    subprocess.run([sys.executable, str(SCRIPT), "--input", str(source), "--output", str(output)], check=True)
    page = output.read_text(encoding="utf-8")

    assert "真实上游值" in page
    assert "<svg" in page
    assert 'class="sv-metric"' not in page
    assert 'data-streamviz-theme="dual"' in page
