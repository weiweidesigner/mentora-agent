from __future__ import annotations

import io
import json
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest

from app.reasoning_frameworks import LocalAgentFrameworks, ReasoningFrameworkError


@pytest.fixture(autouse=True)
def _codex_deepseek_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AICHART_CODEX_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-key")


def test_inference_models_keep_complete_ids_and_use_display_names(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    monkeypatch.setattr(frameworks, "_ollama_models", lambda: ["haervwe/GLM-4.6V-Flash-9B:latest"])

    assert frameworks.inference_models() == [
        {"id": "deepseek-flash", "name": "deepseek-flash", "provider": "deepseek", "available": True},
        {"id": "haervwe/GLM-4.6V-Flash-9B:latest", "name": "GLM-4.6v-Flash (自部署)", "provider": "ollama", "available": True},
    ]


def test_inference_models_do_not_expose_jev_as_an_execution_model(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("TYPESAFE_API_KEY", "test-key")
    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    monkeypatch.setattr(frameworks, "_ollama_models", lambda: [])

    assert all(model["id"] != "jev-router" for model in frameworks.inference_models())


def test_codex_publishes_generated_html_before_final(monkeypatch, tmp_path: Path) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    artifact = generated / "streamviz-live.html"
    artifact.write_text("<html><body>chart</body></html>", encoding="utf-8")
    tool_output = json.dumps({
        "ok": True,
        "title": "流式图表",
        "output": str(artifact),
    }, ensure_ascii=False)

    class FakeProcess:
        def __init__(self, _command: list[str], **_kwargs: object) -> None:
            self.stdin = io.StringIO()
            self.stdout = io.StringIO("\n".join([
                json.dumps({"type": "thread.started", "thread_id": "thread-streamviz"}),
                json.dumps({"type": "item.completed", "item": {
                    "type": "command_execution",
                    "command": "python3 app/skills/generic-chart/scripts/bar_chart.py",
                    "status": "completed",
                    "aggregated_output": tool_output,
                }}),
                json.dumps({"type": "item.completed", "item": {
                    "type": "agent_message",
                    "text": f"完成\n[[AIME_CHART:{artifact}]]",
                }}),
            ]) + "\n")

        def wait(self, timeout: int) -> int:
            return 0

    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    monkeypatch.setattr("app.reasoning_frameworks.shutil.which", lambda _name: "/usr/local/bin/codex")
    monkeypatch.setattr("app.reasoning_frameworks.subprocess.Popen", FakeProcess)

    events = list(client.stream("codex", "生成流式图表", [], session_key="streamviz-test"))
    names = [name for name, _data in events]

    assert names.index("module") < names.index("final")
    module = next(data for name, data in events if name == "module")
    assert module["htmlUrl"] == "/generated/streamviz-live.html"


def test_deepseek_framework_routes_glm_model_to_local_ollama(monkeypatch, tmp_path: Path) -> None:
    captured: dict[str, object] = {}

    class FakeHarness:
        def __init__(self, **kwargs: object) -> None:
            captured.update(kwargs)

        def run(self, prompt: str, *, session_id: str, on_notification: object) -> object:
            return SimpleNamespace(final_response="本地回答", session_id=session_id)

        def close(self) -> None:
            pass

    module = ModuleType("deepseek_harness")
    module.DeepSeekHarness = FakeHarness  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "deepseek_harness", module)

    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    monkeypatch.setattr(frameworks, "_ollama_models", lambda: ["haervwe/GLM-4.6V-Flash-9B:latest"])
    events = list(
        frameworks.stream(
            "deepseek",
            "你好",
            [],
            session_key="session-1",
            inference_model="haervwe/GLM-4.6V-Flash-9B:latest",
        )
    )

    assert captured["model"] == "haervwe/GLM-4.6V-Flash-9B:latest"
    assert captured["base_url"] == "http://127.0.0.1:11434/v1"
    assert captured["api_key"] == "ollama"
    final = next(data for event, data in events if event == "final")
    assert final["reasoningFramework"] == "deepseek"
    assert final["inferenceModel"] == "haervwe/GLM-4.6V-Flash-9B:latest"
    assert final["interpretation"] == "本地回答"


def test_codex_framework_routes_glm_model_to_local_ollama(monkeypatch, tmp_path: Path) -> None:
    captured: dict[str, object] = {}
    codex_local_model = "aimechart/glm-4.6v-flash-9b-codex:latest"

    class FakeProcess:
        def __init__(self, command: list[str], **kwargs: object) -> None:
            captured["command"] = command
            self.stdin = io.StringIO()
            self.stdout = io.StringIO(
                "\n".join(
                    [
                        json.dumps({"type": "thread.started", "thread_id": "codex-local-thread"}),
                        json.dumps(
                            {
                                "type": "item.completed",
                                "item": {"type": "agent_message", "text": "Codex 本地回答"},
                            }
                        ),
                    ]
                )
                + "\n"
            )

        def wait(self, timeout: int) -> int:
            return 0

    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    monkeypatch.setattr("app.reasoning_frameworks.shutil.which", lambda _name: "/usr/local/bin/codex")
    monkeypatch.setattr("app.reasoning_frameworks.subprocess.Popen", FakeProcess)
    monkeypatch.setenv("AICHART_CODEX_OLLAMA_MODEL", codex_local_model)
    monkeypatch.setattr(
        frameworks,
        "_ollama_models",
        lambda: ["haervwe/GLM-4.6V-Flash-9B:latest", codex_local_model],
    )

    events = list(
        frameworks.stream(
            "codex",
            "你好",
            [],
            session_key="session-2",
            inference_model="haervwe/GLM-4.6V-Flash-9B:latest",
        )
    )

    command = captured["command"]
    assert isinstance(command, list)
    assert command[command.index("--model") + 1] == codex_local_model
    assert "--local-provider" not in command
    assert "--oss" not in command
    assert "--ignore-user-config" in command
    config_values = [command[index + 1] for index, value in enumerate(command) if value == "--config"]
    assert "tool_output_token_limit=3000" in config_values
    enabled_features = [command[index + 1] for index, value in enumerate(command) if value == "--enable"]
    disabled_features = [command[index + 1] for index, value in enumerate(command) if value == "--disable"]
    assert enabled_features == ["unified_exec", "skip_host_skill_discovery"]
    assert disabled_features == [
        "apps",
        "plugins",
        "plugin_sharing",
        "remote_plugin",
        "recommended_plugins",
        "multi_agent",
        "multi_agent_v2",
    ]
    config_values = [command[index + 1] for index, value in enumerate(command) if value == "--config"]
    assert 'model_provider="aimechart_glm"' in config_values
    assert 'model_providers.aimechart_glm.base_url="http://127.0.0.1:8010/local-glm/v1"' in config_values
    assert 'model_providers.aimechart_glm.wire_api="responses"' in config_values
    assert 'web_search="disabled"' in config_values
    assert 'model_reasoning_effort="low"' in config_values
    assert "model_context_window=16384" in config_values
    assert "model_auto_compact_token_limit=12288" in config_values
    final = next(data for event, data in events if event == "final")
    assert final["reasoningFramework"] == "codex"
    assert final["inferenceModel"] == "haervwe/GLM-4.6V-Flash-9B:latest"
    assert final["interpretation"] == "Codex 本地回答"


def test_codex_framework_preserves_original_model_for_existing_remote_selection(monkeypatch, tmp_path: Path) -> None:
    captured: dict[str, object] = {}

    class FakeProcess:
        def __init__(self, command: list[str], **kwargs: object) -> None:
            captured["command"] = command
            self.stdin = io.StringIO()
            self.stdout = io.StringIO(
                json.dumps({"type": "thread.started", "thread_id": "codex-original-thread"})
                + "\n"
                + json.dumps(
                    {"type": "item.completed", "item": {"type": "agent_message", "text": "原有 Codex 回答"}}
                )
                + "\n"
            )

        def wait(self, timeout: int) -> int:
            return 0

    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    monkeypatch.setattr("app.reasoning_frameworks.shutil.which", lambda _name: "/usr/local/bin/codex")
    monkeypatch.setattr("app.reasoning_frameworks.subprocess.Popen", FakeProcess)

    events = list(
        frameworks.stream(
            "codex",
            "你好",
            [],
            session_key="session-original",
            inference_model="deepseek-v4-flash",
            reasoning_effort="high",
        )
    )

    command = captured["command"]
    assert isinstance(command, list)
    assert "--oss" not in command
    assert "--local-provider" not in command
    assert "deepseek-v4-flash" not in command
    assert "--ignore-user-config" in command
    assert command[command.index("--model") + 1] == "deepseek-flash"
    config_values = [command[index + 1] for index, value in enumerate(command) if value == "--config"]
    assert 'model_provider="deepseek"' in config_values
    assert 'model_providers.deepseek.wire_api="responses"' in config_values
    assert 'model_providers.deepseek.env_key="DEEPSEEK_API_KEY"' in config_values
    assert 'web_search="disabled"' in config_values
    assert 'model_reasoning_effort="high"' in command
    final = next(data for event, data in events if event == "final")
    assert final["reasoningFramework"] == "codex"
    assert final["inferenceModel"] == "deepseek-v4-flash"
    assert final["interpretation"] == "原有 Codex 回答"


def test_codex_local_resume_keeps_ollama_provider(monkeypatch, tmp_path: Path) -> None:
    captured: dict[str, object] = {}

    class FakeProcess:
        def __init__(self, command: list[str], **kwargs: object) -> None:
            captured["command"] = command
            self.stdin = io.StringIO()
            self.stdout = io.StringIO(
                json.dumps({"type": "thread.started", "thread_id": "existing-local-thread"})
                + "\n"
                + json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": "已完成"}})
                + "\n"
            )

        def wait(self, timeout: int) -> int:
            return 0

    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    monkeypatch.setattr("app.reasoning_frameworks.shutil.which", lambda _name: "/usr/local/bin/codex")
    monkeypatch.setattr("app.reasoning_frameworks.subprocess.Popen", FakeProcess)
    monkeypatch.setattr(
        frameworks,
        "_ollama_models",
        lambda: ["haervwe/GLM-4.6V-Flash-9B:latest", "aimechart/glm-4.6v-flash-9b-codex:latest"],
    )

    list(frameworks.stream(
        "codex", "继续", [], session_key="session-local", engine_session_id="existing-local-thread",
        inference_model="haervwe/GLM-4.6V-Flash-9B:latest",
    ))

    command = captured["command"]
    assert isinstance(command, list)
    assert command[:3] == ["/usr/local/bin/codex", "exec", "resume"]
    assert "--oss" not in command
    assert "--ignore-user-config" in command
    assert 'model_provider="aimechart_glm"' in command


def test_codex_local_retries_plan_only_answer_once(monkeypatch, tmp_path: Path) -> None:
    commands: list[list[str]] = []

    class FakeProcess:
        def __init__(self, command: list[str], **kwargs: object) -> None:
            commands.append(command)
            self.stdin = io.StringIO()
            answer = "我将执行脚本。"
            events = [json.dumps({"type": "thread.started", "thread_id": "local-thread"})]
            events.append(json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": answer}}))
            self.stdout = io.StringIO("\n".join(events) + "\n")

        def wait(self, timeout: int) -> int:
            return 0

    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    monkeypatch.setattr("app.reasoning_frameworks.shutil.which", lambda _name: "/usr/local/bin/codex")
    monkeypatch.setattr("app.reasoning_frameworks.subprocess.Popen", FakeProcess)
    monkeypatch.setattr(
        frameworks,
        "_ollama_models",
        lambda: ["haervwe/GLM-4.6V-Flash-9B:latest", "aimechart/glm-4.6v-flash-9b-codex:latest"],
    )

    with pytest.raises(ReasoningFrameworkError, match="未完成可信的工具执行"):
        list(frameworks.stream(
            "codex", "执行任务", [], session_key="session-local",
            inference_model="haervwe/GLM-4.6V-Flash-9B:latest",
        ))

    assert len(commands) == 2
    assert commands[1][:3] == ["/usr/local/bin/codex", "exec", "resume"]
    assert "local-thread" in commands[1]


def test_codex_local_repairs_pseudo_tool_call_and_requires_chart(monkeypatch, tmp_path: Path) -> None:
    processes: list[object] = []
    chart = tmp_path / "generated" / "amd-weekly.html"
    chart.parent.mkdir()
    chart.write_text("<html>AMD chart</html>", encoding="utf-8")

    class CapturedStdin(io.StringIO):
        def close(self) -> None:
            pass

    class FakeProcess:
        def __init__(self, command: list[str], **kwargs: object) -> None:
            processes.append(self)
            self.command = command
            self.stdin = CapturedStdin()
            answer = (
                '{"name":"exec_command","arguments":{"cmd":"python kline.py --period 1w"}}'
                if len(processes) == 1 else f"已生成 AMD 周线图。\n[[AIME_CHART:{chart}]]"
            )
            self.stdout = io.StringIO("\n".join([
                json.dumps({"type": "thread.started", "thread_id": "local-thread"}),
                *([json.dumps({"type": "item.completed", "item": {
                    "type": "command_execution", "command": "test -s generated/amd-weekly.html",
                    "status": "completed", "aggregated_output": "chart exists",
                }})] if len(processes) == 2 else []),
                json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": answer}}),
            ]) + "\n")

        def wait(self, timeout: int) -> int:
            return 0

    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=chart.parent)
    monkeypatch.setattr("app.reasoning_frameworks.shutil.which", lambda _name: "/usr/local/bin/codex")
    monkeypatch.setattr("app.reasoning_frameworks.subprocess.Popen", FakeProcess)
    monkeypatch.setattr(
        frameworks, "_ollama_models",
        lambda: ["haervwe/GLM-4.6V-Flash-9B:latest", "aimechart/glm-4.6v-flash-9b-codex:latest"],
    )

    events = list(frameworks.stream(
        "codex", "AMD 周线 K 线图", [], session_key="session-local",
        inference_model="haervwe/GLM-4.6V-Flash-9B:latest",
    ))

    assert len(processes) == 2
    assert processes[1].command[:3] == ["/usr/local/bin/codex", "exec", "resume"]
    assert "继续同一会话中尚未完成的用户任务" in processes[1].stdin.getvalue()
    assert "K 线脚本真实路径" not in processes[1].stdin.getvalue()
    final = next(data for event, data in events if event == "final")
    assert final["reportArtifacts"] == [{"path": str(chart), "url": "/generated/amd-weekly.html"}]
    assert "exec_command" not in final["interpretation"]


def test_codex_local_does_not_route_kline_without_model_tool_call(monkeypatch, tmp_path: Path) -> None:
    script = tmp_path / "app/skills/business-chart-recall/scripts/kline.py"
    script.parent.mkdir(parents=True)
    script.write_text("# test fixture\n", encoding="utf-8")
    class FakeProcess:
        def __init__(self, command: list[str], **kwargs: object) -> None:
            self.stdin = io.StringIO()
            self.stdout = io.StringIO("\n".join([
                json.dumps({"type": "thread.started", "thread_id": "local-thread"}),
                json.dumps({"type": "item.completed", "item": {
                    "type": "agent_message", "text": "我将执行脚本。",
                }}),
            ]) + "\n")

        def wait(self, timeout: int) -> int:
            return 0

    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    monkeypatch.setattr("app.reasoning_frameworks.shutil.which", lambda _name: "/usr/local/bin/codex")
    monkeypatch.setattr("app.reasoning_frameworks.subprocess.Popen", FakeProcess)
    monkeypatch.setattr(
        "app.reasoning_frameworks.subprocess.run",
        lambda *_args, **_kwargs: pytest.fail("本地 GLM 路径不得绕过模型写死执行 K 线脚本"),
    )
    monkeypatch.setattr(
        frameworks, "_ollama_models",
        lambda: ["haervwe/GLM-4.6V-Flash-9B:latest", "aimechart/glm-4.6v-flash-9b-codex:latest"],
    )

    with pytest.raises(ReasoningFrameworkError, match="未完成可信的工具执行"):
        list(frameworks.stream(
            "codex", "AMD 周线 K 线图", [], session_key="session-local",
            inference_model="haervwe/GLM-4.6V-Flash-9B:latest",
        ))


def test_codex_local_rejects_false_missing_script_claim(monkeypatch, tmp_path: Path) -> None:
    script = tmp_path / "app/skills/business-chart-recall/scripts/analyst_recommendations.py"
    script.parent.mkdir(parents=True)
    script.write_text("# present\n", encoding="utf-8")
    commands: list[list[str]] = []

    class FakeProcess:
        def __init__(self, command: list[str], **kwargs: object) -> None:
            commands.append(command)
            self.stdin = io.StringIO()
            self.stdout = io.StringIO("\n".join([
                json.dumps({"type": "thread.started", "thread_id": "local-thread"}),
                json.dumps({"type": "item.completed", "item": {
                    "type": "command_execution",
                    "command": "ls .agents/skills/business-chart-recall/app/scripts/analyst_recommendations.py",
                    "status": "failed", "aggregated_output": "No such file or directory",
                }}),
                json.dumps({"type": "item.completed", "item": {
                    "type": "agent_message",
                    "text": "analyst_recommendations.py 脚本不存在，无法执行。",
                }}),
            ]) + "\n")

        def wait(self, timeout: int) -> int:
            return 0

    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    monkeypatch.setattr("app.reasoning_frameworks.shutil.which", lambda _name: "/usr/local/bin/codex")
    monkeypatch.setattr("app.reasoning_frameworks.subprocess.Popen", FakeProcess)
    monkeypatch.setattr(
        frameworks, "_ollama_models",
        lambda: ["haervwe/GLM-4.6V-Flash-9B:latest", "aimechart/glm-4.6v-flash-9b-codex:latest"],
    )

    with pytest.raises(ReasoningFrameworkError, match="项目中实际存在：app/skills/business-chart-recall/scripts/analyst_recommendations.py"):
        list(frameworks.stream(
            "codex", "谷歌分析师评级", [], session_key="session-local",
            inference_model="haervwe/GLM-4.6V-Flash-9B:latest",
        ))

    assert len(commands) == 2
    assert commands[1][:3] == ["/usr/local/bin/codex", "exec", "resume"]


def test_codex_local_does_not_break_on_repeated_commands(monkeypatch, tmp_path: Path) -> None:
    process_box: list[object] = []

    class CapturedStdin(io.StringIO):
        def close(self) -> None:
            pass

    def command_event(event_type: str, command: str, status: str = "completed") -> str:
        return json.dumps({
            "type": event_type,
            "item": {"type": "command_execution", "command": command, "status": status},
        })

    class FakeProcess:
        def __init__(self, command: list[str], **kwargs: object) -> None:
            process_box.append(self)
            self.stdin = CapturedStdin()
            self.stdout = io.StringIO("\n".join([
                json.dumps({"type": "thread.started", "thread_id": "local-thread"}),
                command_event("item.started", "cat missing/SKILL.md"),
                command_event("item.completed", "cat missing/SKILL.md", "failed"),
                command_event("item.started", "cat missing/SKILL.md"),
                command_event("item.completed", "cat missing/SKILL.md", "failed"),
                command_event("item.started", "ls -la .agents/skills/"),
                command_event("item.completed", "ls -la .agents/skills/"),
                command_event("item.started", "ls -la .agents/skills/"),
                command_event("item.completed", "ls -la .agents/skills/"),
                json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": "已完成查询。"}}),
            ]) + "\n")

        def wait(self, timeout: int) -> int:
            return 0

    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    monkeypatch.setattr("app.reasoning_frameworks.shutil.which", lambda _name: "/usr/local/bin/codex")
    monkeypatch.setattr("app.reasoning_frameworks.subprocess.Popen", FakeProcess)
    monkeypatch.setattr(
        frameworks,
        "_ollama_models",
        lambda: ["haervwe/GLM-4.6V-Flash-9B:latest", "aimechart/glm-4.6v-flash-9b-codex:latest"],
    )

    events = list(frameworks.stream(
        "codex", "查询", [], session_key="session-local",
        inference_model="haervwe/GLM-4.6V-Flash-9B:latest",
    ))

    assert next(data for event, data in events if event == "final")["interpretation"] == "已完成查询。"
    prompt = process_box[0].stdin.getvalue()
    assert "根据退出状态和输出判断目标是否已达成" in prompt
    assert "不要在没有新信息或明确理由时重复同一命令" in prompt
    assert "若工具返回成功和产物路径，不要再次执行同一生成命令" in prompt
    assert "'我将验证'、'接下来会执行'等计划句只能用于过程消息，不能作为最终回答" in prompt
    assert "[[AIME_CHART:/absolute/path.html]]" in prompt
    assert "app/skills/<skill>/scripts/" in prompt
    assert ".agents/skills/<skill>/app/scripts/" in prompt
    assert "先改用 python3 并确认脚本路径" in prompt
    assert "若它支持 --output 且能直接产出所需 HTML" in prompt
    assert "不要把 JSON 数组当作要求 JSON 对象的输入" in prompt
    assert "将 streamviz 作为最后的展示 Skill" in prompt
    assert "不能单独承担事实查询" in prompt


def test_codex_trace_shows_local_reasoning_only(monkeypatch, tmp_path: Path) -> None:
    frameworks = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    lines: list[str] = []
    monkeypatch.setattr(frameworks, "_write_codex_trace", lines.append)

    reasoning = {"type": "reasoning", "text": "先检查脚本参数，再调用工具。"}
    frameworks._trace_codex_event("item.completed", reasoning, show_local_reasoning=True)
    frameworks._trace_codex_event("item.completed", reasoning, show_local_reasoning=False)

    assert lines[0] == "本地模型推理记录：先检查脚本参数，再调用工具。"
    assert lines[1] == "推理阶段完成（未提供可显示文本）"
