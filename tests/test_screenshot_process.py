from pathlib import Path
from types import SimpleNamespace
import subprocess

import pytest
from fastapi import HTTPException
from app import screenshot_process as runtime


def test_browser_uses_native_shared_memory_without_disabling_sandbox():
    options=runtime.chromium_launch_options()
    assert '--disable-dev-shm-usage' in options['ignore_default_args']
    assert '--no-sandbox' not in options.get('args',[])


def test_failure_logs_internal_error_but_returns_safe_message(monkeypatch,tmp_path,caplog):
    trace='TargetClosedError: Page crashed /private/server/path'
    monkeypatch.setattr(runtime.subprocess,'run',lambda *a,**k:SimpleNamespace(returncode=1,stderr=trace,stdout=''))
    with pytest.raises(HTTPException) as caught:
        runtime.run_screenshot('script',root=tmp_path,output=tmp_path/'image.png')
    assert caught.value.status_code==503
    assert 'TargetClosedError' not in caught.value.detail and '/private' not in caught.value.detail
    assert trace in caplog.text


def test_timeout_does_not_escape_as_raw_exception(monkeypatch,tmp_path):
    def timeout(*args,**kwargs):raise subprocess.TimeoutExpired('screenshot',90)
    monkeypatch.setattr(runtime.subprocess,'run',timeout)
    with pytest.raises(HTTPException,match='图片生成失败'):
        runtime.run_screenshot('script',root=tmp_path,output=tmp_path/'image.png')


def test_success_requires_nonempty_output(monkeypatch,tmp_path):
    output=tmp_path/'image.png'
    monkeypatch.setattr(runtime.subprocess,'run',lambda *a,**k:SimpleNamespace(returncode=0,stderr='',stdout=''))
    with pytest.raises(HTTPException):runtime.run_screenshot('script',root=tmp_path,output=output)
    output.write_bytes(b'png-result')
    runtime.run_screenshot('script',root=tmp_path,output=output)
