import importlib.util
import json
from pathlib import Path
import sys

import pytest
from app.reasoning_frameworks import LocalAgentFrameworks

ROOT = Path(__file__).resolve().parents[1]


def search_module():
    spec = importlib.util.spec_from_file_location(
        "external_search_route",
        ROOT / "app/skills/external-search/scripts/external_info_search.py",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_auto_uses_tavily_first(monkeypatch, tmp_path):
    search = search_module()
    calls = []
    monkeypatch.setattr(search, "search_tavily", lambda *_args: calls.append("tavily") or {
        "source": "tavily", "model": "test", "answer": "Tavily result", "articles": [],
    })
    monkeypatch.setattr(search, "search_serper", lambda *_args: pytest.fail("Serper should not run after success"))
    output = tmp_path / "search.json"
    monkeypatch.setattr(sys, "argv", ["search", "--query", "test", "--output", str(output)])
    assert search.main() == 0
    value = json.loads(output.read_text())
    assert calls == ["tavily"]
    assert value["source"] == "tavily"
    assert value["fallback_attempts"] == [{"provider": "tavily", "status": "success"}]


def test_auto_falls_back_to_serper_and_records_failure(monkeypatch, tmp_path):
    search = search_module()
    def fail(*_args):
        raise search.SearchProviderError("Tavily unavailable")
    monkeypatch.setattr(search, "search_tavily", fail)
    monkeypatch.setattr(search, "search_serper", lambda *_args: {
        "source": "serper", "model": "test", "answer": "Serper result", "articles": [],
    })
    output = tmp_path / "search.json"
    monkeypatch.setattr(sys, "argv", ["search", "--query", "test", "--output", str(output)])
    assert search.main() == 0
    value = json.loads(output.read_text())
    assert value["source"] == "serper"
    assert [item["provider"] for item in value["fallback_attempts"]] == ["tavily", "serper"]
    assert value["fallback_attempts"][0]["status"] == "failed"


@pytest.mark.parametrize("source", ["kimi", "moonshot"])
def test_kimi_remains_explicit(monkeypatch, tmp_path, source):
    search = search_module()
    monkeypatch.setattr(search, "search_tavily", lambda *_args: pytest.fail("explicit Kimi must not route"))
    monkeypatch.setattr(search, "search_serper", lambda *_args: pytest.fail("explicit Kimi must not route"))
    monkeypatch.setattr(search, "search_kimi", lambda *_args: {
        "source": "kimi", "model": "kimi-test", "answer": "Kimi result", "articles": [],
    })
    output = tmp_path / "search.json"
    monkeypatch.setattr(sys, "argv", ["search", "--query", "test", "--source", source, "--output", str(output)])
    assert search.main() == 0
    value = json.loads(output.read_text())
    assert value["source"] == "kimi"
    assert value["fallback_attempts"] == [{"provider": "kimi", "status": "success"}]


def test_prompt_keeps_general_reasoning_and_declares_search_route(tmp_path):
    client = LocalAgentFrameworks(project_root=ROOT, generated_dir=tmp_path / "generated")
    prompt = client._prompt("deepseek", "用一个Dashboard解释今晚美股科技反弹", [], [])
    assert "默认 Tavily" in prompt
    assert "自动切换 Serper" in prompt
    assert "明确要求 Kimi" in prompt
    assert "按用户问题的实际范围选择" in prompt
