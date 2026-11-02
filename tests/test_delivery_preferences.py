import ast
from pathlib import Path
import re
import threading
from types import SimpleNamespace
from typing import Any, Iterator

from app.delivery_preferences import plain_text_delivery, plain_text_requested


def framework_method(name):
    # Exercise the production methods without importing optional runtime SDKs.
    tree = ast.parse(Path('app/reasoning_frameworks.py').read_text())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'LocalAgentFrameworks')
    method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == name)
    method.decorator_list = []
    scope = {'re': re, 'Iterator': Iterator, 'Any': Any, 'ReasoningFrameworkError': RuntimeError}
    exec(compile(ast.Module(body=[method], type_ignores=[]), '<delivery-method>', 'exec'), scope)
    return scope[name]


def test_plain_text_delivery_skips_html_requirement_without_affecting_web():
    requires_html = framework_method('_requires_html_deliverable')
    with plain_text_delivery():
        assert plain_text_requested.get()
        assert not requires_html('QQ 不生成 HTML 页面，只回复简短文字')
    assert not plain_text_requested.get()
    assert requires_html('生成一个完整的 HTML 页面')


def test_plain_text_delivery_is_scoped_to_its_worker_thread():
    values = []
    with plain_text_delivery():
        worker = threading.Thread(target=lambda: values.append(plain_text_requested.get()))
        worker.start(); worker.join()
        assert plain_text_requested.get()
    assert values == [False]


def test_plain_text_stream_suppresses_visual_guidance_and_restores_web():
    stream = framework_method('stream')
    guidance = []
    def backend(*args, **kwargs):
        guidance.append(kwargs['visualization_guidance'])
        yield 'final', {'interpretation': '简短文本'}
    client = SimpleNamespace(_theme_visualization_guidance=lambda theme: '网页主题渲染要求', _stream_deepseek=backend)
    with plain_text_delivery():
        assert list(stream(client, 'deepseek', '问题', [], session_key='qq'))[-1][0] == 'final'
    list(stream(client, 'deepseek', '问题', [], session_key='web'))
    assert guidance == ['', '网页主题渲染要求']
