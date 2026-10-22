import importlib.util
import base64
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.reasoning_frameworks import LocalAgentFrameworks, ReasoningFrameworkError


SCRIPT = Path(__file__).resolve().parents[1] / "app/skills/flux-image/scripts/generate_image.py"
SPEC = importlib.util.spec_from_file_location("flux_image_skill", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_size_and_output_validation(tmp_path, monkeypatch):
    generated = tmp_path / "generated"
    generated.mkdir()
    monkeypatch.setattr(MODULE, "GENERATED_DIR", generated)
    assert MODULE.parse_size("512x768") == "512x768"
    with pytest.raises(Exception):
        MODULE.parse_size("513x512")
    assert MODULE.output_path(str(generated / "picture.html")) == generated / "picture.html"
    with pytest.raises(Exception):
        MODULE.output_path(str(tmp_path / "elsewhere.html"))


def test_generates_html_wrapper_for_fresh_png(tmp_path, monkeypatch, capsys):
    generated = tmp_path / "generated"
    generated.mkdir()
    runner = tmp_path / "run.sh"
    runner.write_text("#!/bin/sh\n", encoding="utf-8")
    runner.chmod(0o755)
    monkeypatch.setenv("AICHART_FLUX_RUNNER", str(runner))
    monkeypatch.setattr(MODULE, "GENERATED_DIR", generated)

    def fake_run(command, **_kwargs):
        Path(command[command.index("--output") + 1]).write_bytes(b"\x89PNG\r\n\x1a\n")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(MODULE.subprocess, "run", fake_run)
    output = generated / "fox.html"
    assert MODULE.main(["--prompt", '<fox & snow>', "--output", str(output), "--seed", "7"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["html"] == str(output)
    assert payload["image"] == str(output.with_suffix(".png"))
    html = output.read_text(encoding="utf-8")
    assert 'src="fox.png"' in html
    assert "&lt;fox &amp; snow&gt;" in html
    assert "<fox & snow>" not in html
    assert 'class="frame"' not in html
    assert "max-width: 560px" in html
    assert "background: transparent" in html
    assert "<p>" not in html
    assert "seed 7" not in html


def test_non_ascii_prompt_uses_selected_remote_model(monkeypatch):
    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"choices":[{"message":{"content":"A pelican riding a bicycle."}}]}'

    requests = []

    def fake_urlopen(request, timeout):
        requests.append(request)
        assert timeout == 90
        return FakeResponse()

    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("AICHART_FLUX_SELECTED_MODEL", "deepseek-v4-flash")
    monkeypatch.setattr(MODULE.urllib_request, "urlopen", fake_urlopen)
    assert MODULE.model_prompt("画一个鹈鹕骑车") == "A pelican riding a bicycle."
    assert MODULE.model_prompt("A red apple") == "A red apple"
    assert len(requests) == 1
    body = json.loads(requests[0].data)
    assert body["model"] == "deepseek-v4-flash"
    assert "画一个鹈鹕骑车" in body["messages"][1]["content"]
    assert requests[0].get_header("Authorization") == "Bearer test-key"


def test_non_ascii_prompt_falls_back_to_ollama(monkeypatch):
    class FakeResponse:
        def __init__(self, body):
            self.body = body

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return self.body

    requests = []

    def fake_urlopen(request, timeout):
        requests.append(request)
        if request.full_url.endswith("/chat/completions"):
            raise MODULE.urllib_error.URLError("remote unavailable")
        return FakeResponse(b'{"response":"A pelican riding a bicycle."}')

    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setattr(MODULE.urllib_request, "urlopen", fake_urlopen)
    assert MODULE.model_prompt("画一个鹈鹕骑车") == "A pelican riding a bicycle."
    assert [request.full_url.rsplit("/", 2)[-1] for request in requests] == ["completions", "generate"]


def test_flux2_runner_uses_reference_edit_without_legacy_strength(tmp_path, monkeypatch, capsys):
    generated = tmp_path / "generated"
    generated.mkdir()
    runner = tmp_path / "run.sh"
    runner.write_text("#!/bin/sh\n", encoding="utf-8")
    runner.chmod(0o755)
    source = tmp_path / "source.png"
    source.write_bytes(b"source")
    monkeypatch.setenv("AICHART_FLUX_RUNNER", str(runner))
    monkeypatch.setattr(MODULE, "FLUX2_RUNNER", runner)
    monkeypatch.setattr(MODULE, "GENERATED_DIR", generated)
    commands = []

    def fake_run(command, **_kwargs):
        commands.append(command)
        Path(command[command.index("--output") + 1]).write_bytes(b"\x89PNG\r\n\x1a\n")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(MODULE.subprocess, "run", fake_run)
    output = generated / "edited.html"
    assert MODULE.main(["--prompt", "Watercolor cat", "--input-image", str(source),
                        "--output", str(output)]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["model"] == "FLUX.2 [klein] 4B"
    assert "--input-image" in commands[0]
    assert "--strength" not in commands[0]


def test_creative_image_routing_excludes_financial_charts_and_edits():
    is_image = LocalAgentFrameworks.is_flux_image_request
    assert is_image("给我画一个新海诚风格的女生", [])
    assert is_image("生成一张蓝色陶瓷杯的图片", [])
    assert not is_image("画 AMD 周线 K 线图", [])
    assert not is_image("为什么图片没生成", [])
    assert not is_image("生成一份简短HTML科普，解释久期和凸性的区别", [])
    assert not is_image("制作一个网页说明交易规则", [])
    assert not is_image("Generate an HTML report about bonds", [])
    assert not is_image("画一张猫的插画", [SimpleNamespace(dataUrl="data:image/png;base64,aA==")])
    uploaded = [SimpleNamespace(dataUrl="data:image/png;base64,aA==")]
    assert is_image("画一个这个风格的鹈鹕骑车", uploaded)
    assert is_image("请画一只这种画风的小猫", uploaded)
    assert is_image("生成一个类似样式的机器人", uploaded)
    assert is_image("把这张图片改成水彩风格", uploaded)
    assert is_image("把这个照片生成卡通版本", uploaded)
    assert is_image("把这张照片生成卡通版本", uploaded)
    assert is_image("Restyle this image as a watercolor painting", uploaded)
    assert is_image(
        "Convert this exact photo into a Pixar-inspired 3D cartoon style while "
        "preserving the cat's original identity and the background composition.", uploaded,
    )
    assert not is_image("这张图片里是什么？", uploaded)
    assert not is_image("把图表改成柱状图", uploaded)
    assert is_image(
        "Cinematic autumn evening in a rural village of northern Jiangsu, China. "
        "A vast golden wheat field under a warm sunset sky. Realistic documentary "
        "photography style, ultra detailed, cinematic composition, 8K.",
        [],
    )
    assert is_image(
        "一位绝美的东方古风女剑客，身穿洁白轻盈的薄纱长裙，衣袂随山风飘动，手持一柄古朴长剑，"
        "独自站立在巍峨山峰之巅。她拥有清冷绝美的面容，乌黑长发随风飞扬，目光坚定而淡然，"
        "气质高冷优雅，仿佛一位隐世剑仙。脚下是翻涌的云海，远处群山连绵，晨雾环绕，"
        "阳光穿透云层洒在她身上。仙侠世界氛围，东方美学，唯美古风，电影级构图，"
        "动态飘逸感，超细节，8K高清。",
        [],
    )
    assert not is_image("请分析这段文字的电影级构图和光影氛围吗？", [])
    assert is_image("Generate a photographic portrait of a cat", [])
    assert not is_image("Analyze the photography market chart for this quarter", [])


def test_framework_runs_flux_skill_and_requires_fresh_image(tmp_path, monkeypatch):
    script = tmp_path / "app/skills/flux-image/scripts/generate_image.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture\n", encoding="utf-8")
    generated = tmp_path / "outputs/generated"
    framework = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    commands = []

    def fake_run(command, **_kwargs):
        commands.append(command)
        html = Path(command[-1])
        html.write_text("<html><img src='test.png'></html>", encoding="utf-8")
        html.with_suffix(".png").write_bytes(b"\x89PNG\r\n\x1a\nimage")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr("app.reasoning_frameworks.subprocess.run", fake_run)
    events = list(framework.stream_flux_image(
        "codex", "给我画一个女生", engine_session_id="old-thread", inference_model="deepseek-v4-flash",
    ))
    assert len(commands) == 1
    assert commands[0][0]
    assert commands[0][commands[0].index("--prompt") + 1] == "给我画一个女生"
    final = next(data for event, data in events if event == "final")
    assert final["selectedSkill"]["key"] == "flux-image"
    assert final["engineSessionId"] == "old-thread"
    assert final["inferenceModel"] == "deepseek-v4-flash"
    assert len(final["reportArtifacts"]) == 1
    assert final["reportArtifacts"][0]["imageUrl"].endswith(".png")
    assert final["interpretation"] == f"[[AIME_CHART:{final['reportArtifacts'][0]['path']}]]"


def test_framework_rejects_skill_success_without_image(tmp_path, monkeypatch):
    script = tmp_path / "app/skills/flux-image/scripts/generate_image.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture\n", encoding="utf-8")
    framework = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "outputs/generated")
    monkeypatch.setattr(
        "app.reasoning_frameworks.subprocess.run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=0, stdout="", stderr=""),
    )
    with pytest.raises(ReasoningFrameworkError, match="未生成本次请求的新 PNG 和 HTML"):
        list(framework.stream_flux_image("codex", "给我画一只猫"))


def test_uploaded_image_is_forwarded_to_flux_skill(tmp_path, monkeypatch):
    script = tmp_path / "app/skills/flux-image/scripts/generate_image.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture\n", encoding="utf-8")
    framework = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "outputs/generated")
    commands = []

    def fake_run(command, **_kwargs):
        commands.append(command)
        html = Path(command[command.index("--output") + 1])
        html.write_text("<html><img src='test.png'></html>", encoding="utf-8")
        html.with_suffix(".png").write_bytes(b"\x89PNG\r\n\x1a\nimage")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr("app.reasoning_frameworks.subprocess.run", fake_run)
    uploaded = SimpleNamespace(name="original.png", dataUrl="data:image/png;base64," + base64.b64encode(b"image").decode())
    events = list(framework.stream_flux_image("codex", "把这张图改成水彩风格", images=[uploaded]))
    input_path = Path(commands[0][commands[0].index("--input-image") + 1])
    assert input_path.read_bytes() == b"image"
    assert input_path.parent != framework.generated_dir
    assert next(data for event, data in events if event == "final")["reportArtifacts"][0]["imageUrl"].endswith(".png")


def test_chat_request_routes_artwork_before_codex_agent(monkeypatch):
    from app import presentation

    class FakeFrameworks:
        def is_flux_image_request(self, question, images):
            return question == "给我画一个女生" and not images

        def stream_flux_image(self, framework, question, *, images, engine_session_id, inference_model):
            assert images == []
            yield "final", {"reasoningFramework": framework, "question": question,
                            "engineSessionId": engine_session_id, "inferenceModel": inference_model}

    monkeypatch.setattr(presentation, "LOCAL_FRAMEWORKS", FakeFrameworks())
    events = list(presentation.framework_events(presentation.ChatRequest(
        question="给我画一个女生", reasoningFramework="codex", engineSessionId="prior-thread",
        inferenceModel="deepseek-v4-flash",
    )))
    assert events == [("final", {
        "reasoningFramework": "codex", "question": "给我画一个女生",
        "engineSessionId": "prior-thread", "inferenceModel": "deepseek-v4-flash",
    })]
