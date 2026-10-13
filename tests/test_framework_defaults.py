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
