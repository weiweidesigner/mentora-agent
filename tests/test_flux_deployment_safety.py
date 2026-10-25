"""Release-root isolation, path confinement and safe durable image errors."""
import json
import os
from pathlib import Path
import runpy
import time
from types import SimpleNamespace

import pytest

from app.chat_sessions import ChatSessions
from app.reasoning_frameworks import FluxImageExecutionError, LocalAgentFrameworks

SCRIPT=Path(__file__).parents[1]/'app/skills/flux-image/scripts/generate_image.py'


@pytest.fixture(autouse=True)
def artifact_boundary_transport(monkeypatch):
    # This module tests artifact/error boundaries; the process stream has its own tests.
    import subprocess
    def run(command,**kwargs):
        yield subprocess.run(command,**kwargs,capture_output=True,text=True,timeout=1800,check=False)
    monkeypatch.setattr(LocalAgentFrameworks,'_flux_process',staticmethod(run))


def test_current_release_root_overrides_stale_env_without_changing_runner(tmp_path,monkeypatch):
    root=tmp_path/'release';root.mkdir()
    shared=tmp_path/'shared';shared.mkdir()
    (root/'outputs').symlink_to(shared,target_is_directory=True)
    script=root/'app/skills/flux-image/scripts/generate_image.py'
    script.parent.mkdir(parents=True);script.write_text('# fixture')
    monkeypatch.setenv('AICHART_PROJECT_ROOT',str(tmp_path/'old-release'))
    monkeypatch.setenv('AICHART_FLUX_RUNNER','/configured/flux/run.sh')
    monkeypatch.setenv('AICHART_FLUX2_RUNNER','/configured/flux/run.sh')
    framework=LocalAgentFrameworks(project_root=root,generated_dir=root/'outputs/generated')
    calls=[]
    def fake_run(command,**kwargs):
        calls.append(command)
        assert kwargs['cwd']==root.resolve()
        assert kwargs['env']['AICHART_PROJECT_ROOT']==str(root.resolve())
        assert kwargs['env']['AICHART_FLUX_RUNNER']=='/configured/flux/run.sh'
        assert kwargs['env']['AICHART_FLUX2_RUNNER']=='/configured/flux/run.sh'
        assert kwargs['env']['AICHART_FLUX_SELECTED_MODEL']=='selected-model'
        output=Path(command[command.index('--output')+1])
        # Exercise the real parser using precisely the child process's root.
        with monkeypatch.context() as child:
            child.setenv('AICHART_PROJECT_ROOT',kwargs['env']['AICHART_PROJECT_ROOT'])
            module=runpy.run_path(str(SCRIPT),run_name='flux_parser_probe')
            parsed=module['build_parser']().parse_args(['--prompt','test','--output',str(output)])
            assert parsed.output==output
        output.write_text('<html><img src="fixture.png"></html>')
        output.with_suffix('.png').write_bytes(b'\x89PNG\r\n\x1a\nfixture')
        now=time.time_ns()
        for path in (output,output.with_suffix('.png')):
            os.utime(path,ns=(now,now))
        return SimpleNamespace(returncode=0,stdout='',stderr='')
    monkeypatch.setattr('app.reasoning_frameworks.subprocess.run',fake_run)
    events=list(framework.stream_flux_image('deepseek','A red apple',inference_model='selected-model'))
    assert len(calls)==1 and any(kind=='final' for kind,data in events)
    assert os.environ['AICHART_PROJECT_ROOT']==str(tmp_path/'old-release')


def test_real_parser_keeps_traversal_and_symlink_escape_blocked(tmp_path,monkeypatch):
    monkeypatch.setenv('AICHART_PROJECT_ROOT',str(tmp_path))
    generated=tmp_path/'outputs/generated';generated.mkdir(parents=True)
    escape=tmp_path/'outside';escape.mkdir()
    (generated/'escape').symlink_to(escape,target_is_directory=True)
    module=runpy.run_path(str(SCRIPT),run_name='flux_parser_probe')
    assert module['output_path']('outputs/generated/valid.html')==generated/'valid.html'
    for path in ('outputs/generated/../../bad.html','outputs/generated/escape/bad.html','outputs/generated/image.png'):
        with pytest.raises(Exception,match='output must be an HTML file'):
            module['output_path'](path)


@pytest.mark.parametrize('private,code',[
    ('output must be an HTML file in outputs/generated /private/location','image_output_configuration'),
    ('Local FLUX runner not found: /private/location','image_service_unavailable'),
    ('Local FLUX runner is not executable: /private/location','image_service_unavailable'),
    ('中文提示词翻译失败 token=secret','image_prompt_translation_failed'),
    ('Local FLUX generation timed out after 30 minutes','image_generation_timeout'),
    ('unrecognized failure token=secret /private/location','image_generation_failed'),
])
def test_safe_image_error_is_saved_and_replayed_without_private_diagnostics(tmp_path,private,code):
    store=ChatSessions(tmp_path/'sessions')
    def execute(payload,owner):
        yield 'status',{'message':'正在生成图片'}
        raise FluxImageExecutionError.from_runner(private)
    run=store.start('owner',{'question':'image','sessionId':'safe-error'},execute)
    store.pool.shutdown(wait=True)
    replay=''.join(store.events('owner',run['runId']))
    saved=store.sessions('owner')[0]
    assert saved['status']=='failed' and saved['error']
    assert code in replay and '正在生成图片' in replay
    assert '本轮执行异常' not in saved['error']
    assert all(secret not in replay for secret in ('token=secret','/private/location'))


def test_runner_failure_propagates_safe_error_without_claiming_success(tmp_path,monkeypatch):
    script=tmp_path/'app/skills/flux-image/scripts/generate_image.py'
    script.parent.mkdir(parents=True);script.write_text('# fixture')
    framework=LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs/generated')
    monkeypatch.setattr('app.reasoning_frameworks.subprocess.run',lambda *a,**kw:SimpleNamespace(returncode=2,stdout='',stderr='output must be an HTML file in outputs/generated'))
    events=framework.stream_flux_image('deepseek','A red apple')
    assert next(events)[0]=='status'
    assert next(events)[0]=='agent_event'
    with pytest.raises(FluxImageExecutionError) as error:
        list(events)
    assert error.value.error_code=='image_output_configuration'
    assert '尚未生成' in error.value.public_detail


@pytest.mark.parametrize('stale',[True,False])
def test_stale_or_invalid_png_is_never_reported_as_success(tmp_path,monkeypatch,stale):
    script=tmp_path/'app/skills/flux-image/scripts/generate_image.py'
    script.parent.mkdir(parents=True);script.write_text('# fixture')
    framework=LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs/generated')
    def fake_run(command,**kwargs):
        output=Path(command[command.index('--output')+1]);output.write_text('<html>fixture</html>')
        output.with_suffix('.png').write_bytes(b'\x89PNG\r\n\x1a\nold' if stale else b'not a PNG')
        stamp=1 if stale else time.time_ns()
        for path in (output,output.with_suffix('.png')):os.utime(path,ns=(stamp,stamp))
        return SimpleNamespace(returncode=0,stdout='',stderr='')
    monkeypatch.setattr('app.reasoning_frameworks.subprocess.run',fake_run)
    with pytest.raises(FluxImageExecutionError) as error:list(framework.stream_flux_image('deepseek','A red apple'))
    assert error.value.error_code=='image_result_incomplete'


def test_synchronous_chat_uses_the_same_safe_public_error(monkeypatch):
    from app import presentation
    from fastapi import HTTPException
    error=FluxImageExecutionError.from_runner('output must be an HTML file in outputs/generated /private/location token=secret')
    def events(payload):
        raise error
        yield
    monkeypatch.setattr(presentation,'framework_events',events)
    with pytest.raises(HTTPException) as response:
        presentation.chat(presentation.ChatRequest(question='Generate a red apple image'))
    assert response.value.detail==error.public_detail
    assert 'secret' not in response.value.detail and '/private' not in response.value.detail
