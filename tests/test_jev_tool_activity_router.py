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
        key=next(iter(questions))
        assert len(questions[key].criteria)<=3
        choice={'activity_family':'生成产物','activity_work':'deliver','activity_stage':self.stage}[key]
        return SimpleNamespace(
            model="local-laya-test",
            answers={key: SimpleNamespace(choice=choice, confidence=0.91)},
        )


def test_jev_maps_cli_invocation_to_user_facing_activity() -> None:
    router = JevToolActivityRouter(endpoint="http://127.0.0.1:8791/predict", client_factory=FakeClient)

    decision = router.route(
        script="bash",
        arguments={"command": "python app/skills/generic-chart/scripts/grouped_bar.py --payload data.json"},
    )

    assert decision.stage == "render-chart"
    assert decision.confidence == 0.91
    assert router.summary(decision) == "正在把分析结果转换为图表"
    assert "tool" not in FakeClient.last_state  # the shell wrapper is not the operation
    assert "grouped_bar.py" in FakeClient.last_state["command"]


def test_jev_activity_router_redacts_cli_secrets() -> None:
    safe = JevToolActivityRouter._safe_cli_text("--api-key=secret-value --symbols AAPL")

    assert "secret-value" not in safe
    assert "[REDACTED]" in safe


def test_jev_activity_router_requires_configuration() -> None:
    router = JevToolActivityRouter(endpoint="", client_factory=FakeClient)

    with pytest.raises(JevToolActivityRouterError, match="未配置"):
        router.route(script="bash", arguments="pwd")


def test_uncertain_local_decisions_abstain() -> None:
    class Uncertain(FakeClient):
        def system_one(self, **kwargs):
            result = super().system_one(**kwargs)
            next(iter(result.answers.values())).confidence = .4
            return result
    router = JevToolActivityRouter(endpoint="http://127.0.0.1:8791/predict", client_factory=Uncertain)
    with pytest.raises(JevToolActivityRouterError, match="不确定"):
        router.route(script="bash", arguments={"command": "example.py"})
