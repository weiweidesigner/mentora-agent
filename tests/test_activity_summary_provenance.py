import pytest

from app.reasoning_frameworks import LocalAgentFrameworks


@pytest.mark.parametrize("command", [
    "python3 analysis.py",
    "python3 app/skill_runner.py execute --script code_interpreter.py",
    "python3 app/skill_runner.py execute --script render_streamviz.py",
    "cat app/skills/sample/SKILL.md",
    "pwd",
])
def test_tool_without_model_summary_does_not_generate_one(command):
    event = LocalAgentFrameworks._codex_tool_event({"type": "command_execution", "command": command}, 1)
    assert event["thoughtSummary"] == ""
    assert event["params"] == [command]


def test_model_supplied_progress_is_forwarded():
    event = LocalAgentFrameworks._codex_tool_event({
        "type": "command_execution",
        "command": "python3 analysis.py",
        "thoughtSummary": "核验缺失样本是否影响比较口径",
    }, 1)
    assert event["thoughtSummary"] == "核验缺失样本是否影响比较口径"
