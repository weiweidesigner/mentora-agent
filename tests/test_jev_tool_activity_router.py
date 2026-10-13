from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.jev_tool_activity_router import JevToolActivityRouter, JevToolActivityRouterError


class FakeClient:
    stage = "render-chart"
    last_state = None

    def __init__(self, **_kwargs: object) -> None:
        pass

    def __enter__(self) -> "FakeClient":
        return self

    def __exit__(self, *_args: object) -> None:
        pass

    def system_one(self, *, state: object, questions: object) -> object:
        FakeClient.last_state = state
        assert "activity_stage" in questions
        return SimpleNamespace(
            model="jev-test",
            answers={"activity_stage": SimpleNamespace(choice=self.stage, confidence=0.91)},
        )


def test_jev_maps_cli_invocation_to_user_facing_activity() -> None:
    router = JevToolActivityRouter(api_key="test-key", client_factory=FakeClient)

    decision = router.route(
        script="bash",
        arguments={"command": "python app/skills/generic-chart/scripts/grouped_bar.py --payload data.json"},
    )

    assert decision.stage == "render-chart"
    assert decision.confidence == 0.91
    assert router.summary(decision) == "正在把分析结果转换为图表"
    assert FakeClient.last_state["script"] == "bash"
    assert "grouped_bar.py" in FakeClient.last_state["cli"]


def test_jev_activity_router_redacts_cli_secrets() -> None:
    safe = JevToolActivityRouter._safe_cli_text("--api-key=secret-value --symbols AAPL")

    assert "secret-value" not in safe
    assert "[REDACTED]" in safe


def test_jev_activity_router_requires_configuration() -> None:
    router = JevToolActivityRouter(api_key="", client_factory=FakeClient)

    with pytest.raises(JevToolActivityRouterError, match="未配置"):
        router.route(script="bash", arguments="pwd")
