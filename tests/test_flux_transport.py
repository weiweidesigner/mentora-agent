import importlib.util
import json
from pathlib import Path
import subprocess
import threading
import os
import sys
from types import SimpleNamespace
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import pytest
from app.reasoning_frameworks import LocalAgentFrameworks,FluxImageExecutionError

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('flux_worker',ROOT/'scripts/flux_mac_worker.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)


def test_worker_health_auth_and_busy_without_starting_inference(tmp_path):
    runner=tmp_path/'runner';runner.write_text('# fixture');runner.chmod(0o700)
    with worker.Worker(('127.0.0.1',0),runner,'test-token') as server:
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base='http://127.0.0.1:'+str(server.server_port)
        try:
            with urlopen(base+'/health',timeout=2) as response:assert json.load(response)['ready'] is True
            with pytest.raises(HTTPError) as error:urlopen(Request(base+'/generate',data=b'{}'),timeout=2)
            assert error.value.code==401
            server.generation_lock.acquire()
            request=Request(base+'/generate',data=json.dumps({'prompt':'test','size':'256x256','steps':1}).encode(),headers={'Authorization':'Bearer test-token'})
            with pytest.raises(HTTPError) as error:urlopen(request,timeout=2)
            assert error.value.code==409
            server.generation_lock.release()
        finally:server.shutdown();thread.join(timeout=2)


def test_remote_preflight_fails_in_five_seconds_without_starting_subprocess(tmp_path,monkeypatch):
    script=tmp_path/'app/skills/flux-image/scripts/generate_image.py';script.parent.mkdir(parents=True);script.write_text('# fixture')
    monkeypatch.setenv('AICHART_FLUX_RUNNER','/runtime/flux_remote_runner.py')
    calls=[]
    def offline(url,timeout):calls.append(timeout);raise TimeoutError('private endpoint detail')
    monkeypatch.setattr('app.reasoning_frameworks.urllib_request.urlopen',offline)
    framework=LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs/generated')
    events=framework.stream_flux_image('deepseek','test')
    assert next(events)[0]=='status';assert next(events)[0]=='agent_event'
    with pytest.raises(FluxImageExecutionError) as error:list(events)
    assert calls==[5] and error.value.error_code=='image_service_unavailable'
    assert 'private' not in error.value.public_detail


def test_process_wait_emits_safe_elapsed_progress_and_cleans_up_on_close(monkeypatch):
    class Process:
        returncode=None;pid=123456
        def communicate(self,timeout):raise subprocess.TimeoutExpired(['private-prompt'],timeout)
        def poll(self):return self.returncode
        def wait(self,timeout=None):self.returncode=-15
    process=Process();stopped=[]
    monkeypatch.setattr('app.reasoning_frameworks.subprocess.Popen',lambda *a,**kw:process)
    monkeypatch.setattr(LocalAgentFrameworks,'_terminate_codex_process',staticmethod(lambda p:stopped.append(p)))
    iterator=LocalAgentFrameworks._flux_process(['private-prompt'],cwd=ROOT,env={})
    status=next(iterator);assert status['phase']=='flux-wait' and 'private' not in json.dumps(status)
    iterator.close();assert stopped==[process]


def test_step_progress_ignores_weight_bars_and_uses_actual_inference_counts():
    assert worker.step_progress('Loading weights: 100%|xxx| 4/4 [00:01]',4) is None
    assert worker.step_progress('\r 50%|xxxxx| 2/4 [00:02<00:02]',4)['progressPct']==50
    assert worker.step_progress('\r 50%|xxxxx| 2/9 [00:02<00:02]',4) is None
    assert worker.step_progress('\r100%|xxxxx| 4/4 [00:04<00:00]',4)['phase']=='flux-decode'


def test_worker_remote_runner_host_progress_bridge_without_inference(tmp_path):
    runner=tmp_path/'runner'
    runner.write_text('#!'+sys.executable+'\n'+'''import sys,time,pathlib
sys.stderr.write('\\r 25%|xx| 1/4 [00:01<00:03]');sys.stderr.flush()
time.sleep(2)
pathlib.Path(sys.argv[sys.argv.index('--output')+1]).write_bytes(b'\\x89PNG\\r\\n\\x1a\\nfixture')
''')
    runner.chmod(0o700)
    token=tmp_path/'token';token.write_text('fixture-only-token')
    image=tmp_path/'image.png'
    with worker.Worker(('127.0.0.1',0),runner,'fixture-only-token') as server:
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        endpoint='http://127.0.0.1:'+str(server.server_port)
        try:
            with pytest.raises(HTTPError) as error:urlopen(endpoint+'/progress/'+'a'*32,timeout=2)
            assert error.value.code==401
            env=dict(os.environ,MENTORA_FLUX_TOKEN_FILE=str(token),MENTORA_FLUX_URL=endpoint)
            events=list(LocalAgentFrameworks._flux_process([sys.executable,str(ROOT/'scripts/flux_remote_runner.py'),'private fixture prompt','--output',str(image)],cwd=ROOT,env=env))
            updates=[event for event in events if isinstance(event,dict)]
            assert any(event.get('progressPct')==25 for event in updates),updates
            assert all('private' not in json.dumps(event) for event in updates)
            assert events[-1].returncode==0 and image.read_bytes().startswith(worker.PNG)
            request=Request(endpoint+'/progress/'+'a'*32,headers={'Authorization':'Bearer fixture-only-token'})
            with pytest.raises(HTTPError) as error:urlopen(request,timeout=2)
            assert error.value.code==404
        finally:server.shutdown();thread.join(timeout=2)
