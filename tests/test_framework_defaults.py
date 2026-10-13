import json

import pytest
from pydantic import ValidationError

from app import presentation
from app.reasoning_frameworks import FRAMEWORKS


def test_framework_defaults_to_deepseek(monkeypatch):
    monkeypatch.delenv('AICHART_REASONING_FRAMEWORK', raising=False)
    assert presentation.ChatRequest(question='hello').reasoningFramework == 'deepseek'
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


def test_legacy_asgi_entry_uses_harness_gateway(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main

    assert main.app is presentation.app
    captured = {}

    def fake_stream(framework, question, images, **kwargs):
        captured['framework'] = framework
        captured['question'] = question
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
    assert captured == {'framework': 'deepseek', 'question': 'hello'}
