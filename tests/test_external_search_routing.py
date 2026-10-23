import importlib.util
import json
from pathlib import Path
import sys
import threading
import time

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


def test_batch_queries_run_concurrently_and_preserve_input_order(monkeypatch, tmp_path):
    search = search_module()
    barrier = threading.Barrier(3)

    def tavily(query, *_args):
        barrier.wait(timeout=1)
        time.sleep(0.02 if query == "first" else 0)
        return {
            "source": "tavily", "model": "test", "answer": query,
            "articles": [], "usage": {"billable_requests": 1},
        }

    monkeypatch.setattr(search, "search_tavily", tavily)
    monkeypatch.setattr(search, "record_search", lambda _payload: None)
    queries = tmp_path / "queries.json"
    queries.write_text(json.dumps({"queries": ["first", "second", "third", "second"]}))
    output = tmp_path / "batch.json"
    monkeypatch.setattr(sys, "argv", [
        "search", "--queries-file", str(queries), "--output", str(output),
    ])

    assert search.main() == 0
    value = json.loads(output.read_text())
    assert value["type"] == "external-info-search-batch"
    assert value["queries"] == ["first", "second", "third"]
    assert value["query_count"] == 3
    assert value["success_count"] == 3
    assert [item["requested_query"] for item in value["results"]] == ["first", "second", "third"]


def test_prompt_uses_one_dashboard_skill_template_and_one_validation(tmp_path):
    client = LocalAgentFrameworks(project_root=ROOT, generated_dir=tmp_path / "generated")
    prompt = client._prompt("deepseek", "可视化中美大模型的竞争情况", [], [])

    assert "它是唯一的通用看板展示 Skill" in prompt
    assert "默认复用已经过响应式验证" in prompt
    assert "--queries-file" in prompt
    assert "一次有界验证" in prompt
