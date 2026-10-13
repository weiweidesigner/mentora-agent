from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "app" / "skills" / "business-chart-recall" / "scripts" / "kline.py"
SPEC = importlib.util.spec_from_file_location("kline_mark_period_layout", SCRIPT)
assert SPEC and SPEC.loader
kline = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(kline)


def test_kline_annotation_contract_binds_marks_to_period_tabs() -> None:
    schema = kline.component_schema()
    fields = schema["annotationContract"]["fields"]

    assert "period" in fields
    assert schema["annotationContract"]["examples"][0]["period"] == "1d"


def test_kline_html_filters_marks_by_active_period() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "period: item?.period || activePeriod" in source
    assert "item.period || config.dataType) === String(activePeriod)" in source
    assert "selectedAnnotationId = null;" in source
    assert "annotationDraft = null;" in source


def test_horizontal_mark_labels_use_left_collision_free_lane() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "function horizontalAnnotationLabelLayout" in source
    assert "x: main.x + 5" in source
    assert "entry.top + boxH + gap" in source
    assert "const horizontalLabels = horizontalAnnotationLabelLayout" in source
    assert "ctx.fillRect(label.x, label.y, label.w, label.h)" in source


def test_kline_callouts_avoid_overlap_keep_numbers_intact_and_render_on_top() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "function annotationTextTokens" in source
    assert "function isProtectedAnnotationToken" in source
    assert "function annotationBubbleLayout" in source
    assert "Math.max(160, main.w * .46, protectedWidth + 2)" in source
    assert "!occupied.some(rect => rectsOverlap(candidate, rect, 7))" in source
    assert "activeAnnotations.forEach(item => renderOne(item, false, 'geometry'))" in source
    assert "activeAnnotations.forEach(item => renderOne(item, false, 'connector'))" in source
    assert "activeAnnotations.forEach(item => renderOne(item, false, 'label'))" in source
