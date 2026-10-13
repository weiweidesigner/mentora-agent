from app.autogen_reasoning import (
    AUTOGEN_INTERPRETER_VISUAL_GUIDANCE,
    AUTOGEN_PLANNER_VISUAL_GUIDANCE,
)


def test_autogen_planner_prefers_one_evidence_backed_primary_visual() -> None:
    assert "Skill 优先、证据先行、图文协同" in AUTOGEN_PLANNER_VISUAL_GUIDANCE
    assert "默认规划 1 个最能支撑核心结论的主图" in AUTOGEN_PLANNER_VISUAL_GUIDANCE
    assert "不要强行追加图表" in AUTOGEN_PLANNER_VISUAL_GUIDANCE


def test_autogen_interpreter_explains_visual_without_dumping_values() -> None:
    assert "先给核心结论" in AUTOGEN_INTERPRETER_VISUAL_GUIDANCE
    assert "不要机械复述图中全部数值" in AUTOGEN_INTERPRETER_VISUAL_GUIDANCE
    assert "代理、降级、不完整或非实时数据必须明确披露" in AUTOGEN_INTERPRETER_VISUAL_GUIDANCE
