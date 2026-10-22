import json

import pytest
from pydantic import ValidationError

from app import presentation
from app.reasoning_frameworks import FRAMEWORKS


def test_framework_defaults_to_deepseek(monkeypatch):
    monkeypatch.delenv('AICHART_REASONING_FRAMEWORK', raising=False)
    request = presentation.ChatRequest(question='hello')
    assert request.reasoningFramework == 'deepseek'
    assert request.reasoningEffort == 'low'
    config = presentation.client_config()
    assert json.loads(config.body.decode().split(' = ', 1)[1].rstrip(';')) == {'reasoningFramework': 'deepseek'}
    assert config.headers['cache-control'] == 'no-store'


def test_codex_configuration_controls_api_and_client(monkeypatch):
    monkeypatch.setenv('AICHART_REASONING_FRAMEWORK', 'codex')
    assert presentation.ChatRequest(question='hello').reasoningFramework == 'codex'
    assert '"reasoningFramework": "codex"' in presentation.client_config().body.decode()
    assert presentation.ChatRequest(question='hello', reasoningFramework='deepseek').reasoningFramework == 'deepseek'


def test_autogen_is_no_longer_a_supported_framework():
    assert set(FRAMEWORKS) == {'deepseek', 'codex'}
    with pytest.raises(ValidationError):
        presentation.ChatRequest(question='hello', reasoningFramework='autogen')


def test_reasoning_effort_only_accepts_supported_deepseek_levels():
    supported = ('low', 'medium', 'high', 'xhigh', 'ultra')
    assert [presentation.ChatRequest(question='hello', reasoningEffort=value).reasoningEffort for value in supported] == list(supported)
    with pytest.raises(ValidationError):
        presentation.ChatRequest(question='hello', reasoningEffort='max')


def test_health_exposes_installed_harness_versions(monkeypatch):
    versions = {
        'deepseek-harness-sdk': '0.2.1rc2',
        'deepseek-harness-runtime-bin': '0.2.1rc2',
    }
    monkeypatch.setattr(presentation.importlib.metadata, 'version', versions.__getitem__)

    payload = presentation.health()

    assert payload['versions'] == {
        'deepseekHarnessSdk': '0.2.1rc2',
        'deepseekHarnessRuntime': '0.2.1rc2',
    }


def test_health_tolerates_missing_harness_distribution(monkeypatch):
    def missing(_distribution):
        raise presentation.importlib.metadata.PackageNotFoundError

    monkeypatch.setattr(presentation.importlib.metadata, 'version', missing)

    assert presentation.health()['versions'] == {
        'deepseekHarnessSdk': None,
        'deepseekHarnessRuntime': None,
    }


def test_scheduled_research_passes_selected_effort_to_chat_engine(monkeypatch):
    captured = []

    def fake_events(payload, owner):
        captured.append((payload, owner))
        yield 'final', {'interpretation':'done', 'question':'分析市场', 'selectedSkill':{}}

    monkeypatch.setattr(presentation, 'durable_chat_events', fake_events)
    presentation.run_daily_research({'market':'CN', 'question':'分析市场', 'symbols':'', '_owner':'alice', 'reasoningEffort':'ultra'}, 'test-effort')
    assert captured[0][0].reasoningEffort == 'ultra'
    assert captured[0][1] == 'alice'


def test_deal_route_receives_the_requested_reasoning_effort(monkeypatch):
    from types import SimpleNamespace
    captured = []

    def fake_deal(owner, question, history, *, reasoning_effort):
        captured.append(reasoning_effort)
        yield 'final', {'question':question, 'interpretation':'done', 'selectedSkill':{}}

    workflow = SimpleNamespace(research_only_request=lambda _:False, stream_idea=fake_deal)
    monkeypatch.setattr(presentation, 'PORTFOLIO', SimpleNamespace(workflow=workflow), raising=False)
    list(presentation.durable_chat_events(presentation.ChatRequest(question='研究机会',agent='mentora-deal',reasoningEffort='ultra'), 'alice'))
    assert captured == ['ultra']


def test_legacy_asgi_entry_uses_harness_gateway(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main

    assert main.app is presentation.app
    captured = []

    def fake_stream(framework, question, images, **kwargs):
        captured.append({'framework': framework, 'question': question})
        yield 'status', {'message': 'Harness selected'}

    monkeypatch.delenv('AICHART_REASONING_FRAMEWORK', raising=False)
    monkeypatch.setattr(presentation.LOCAL_FRAMEWORKS, 'stream', fake_stream)
    with TestClient(main.app) as client:
        config = client.get('/api/client-config.js')
        assert config.status_code == 200
        assert '"reasoningFramework": "deepseek"' in config.text
        response = client.post('/api/chat/stream', json={'question': 'hello'})
    assert response.status_code == 200
    assert 'Harness selected' in response.text
    assert {'framework': 'deepseek', 'question': 'hello'} in captured
