"""Check complete input coverage, retries and the PCM tail before SILK encoding."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import sys

import numpy as np
import pytest


@pytest.fixture
def service(monkeypatch):
    monkeypatch.delenv('BREEZE_TOKEN_FILE', raising=False)
    spec = importlib.util.spec_from_file_location('breeze_service_test', 'scripts/breeze_tts_service.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    yield module
    module.model_pool.shutdown(wait=True)


def test_sentences_preserve_every_character(service):
    text = '今天辛苦啦，'+('我们慢慢聊聊今天发生的事情，'*6)+'最后一句也要念完。明天见！'
    parts = service.speech_segments(text)
    assert ''.join(parts) == text
    assert max(map(len, parts)) <= 45
    assert parts[-1] == '明天见！'


def test_suspicious_early_stop_retries_smaller_complete_pieces(service):
    calls = []
    text = '今天我们一起出去散步然后吃晚饭吧。'
    def generate(**kwargs):
        value = kwargs['text']; calls.append(value)
        duration = .12 if value == text else len(value)*.2
        yield SimpleNamespace(audio=np.ones(round(24000*duration)), sample_rate=24000, token_count=100)
    service.model = SimpleNamespace(generate=generate)
    audio, rate = service.generate_segment(text, None)
    assert calls[0] == text and ''.join(calls[1:]) == text
    assert len(audio) > rate*2


def test_unresolved_early_stop_never_returns_a_truncated_success(service):
    service.model = SimpleNamespace(generate=lambda **kw: iter([
        SimpleNamespace(audio=np.zeros(2400), sample_rate=24000, token_count=100)]))
    with pytest.raises(service.SpeechTooLong):
        service.generate_segment('这句话还没有读完的时候不能直接返回成功。', None)


def test_all_sentences_encoded_with_tail_silence_and_complete_frames(service, monkeypatch):
    calls = []; encoded = []
    def generate(**kwargs):
        calls.append(kwargs['text'])
        yield SimpleNamespace(audio=np.full(12001, .5), sample_rate=24000, token_count=100)
    service.model = SimpleNamespace(generate=generate)
    def encode(source, target, **kwargs):
        encoded.append(np.frombuffer(Path(source).read_bytes(), dtype='<i2'))
        Path(target).write_bytes(b'\x02#!SILK_V3test')
    monkeypatch.setitem(sys.modules, 'pilk', SimpleNamespace(encode=encode))
    result = service.synthesize('你好。晚安！')
    assert calls == ['你好。', '晚安！']
    assert len(encoded[0]) % 480 == 0
    assert np.all(encoded[0][-6000:] == 0)
    assert np.count_nonzero(encoded[0]) == 24002
    assert result.status_code == 200
