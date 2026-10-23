import json
import os
from pathlib import Path
import threading
import pytest
from app.codex_stream_bridge import launch_options,normalized_item,run
from app.reasoning_frameworks import LocalAgentFrameworks


def fake_server(tmp_path):
    path=tmp_path/'codex'
    path.write_text('''#!/usr/bin/env python3
import json,os,sys,time
from pathlib import Path
assert sys.argv[1]=='app-server'
def send(value):print(json.dumps(value),flush=True)
for line in sys.stdin:
 request=json.loads(line);method=request['method'];params=request.get('params',{})
 if method=='initialize':send({'id':request['id'],'result':{}})
 elif method in ('thread/start','thread/resume'):
  assert params['sandbox']=='workspace-write' and params['approvalPolicy']=='never'
  send({'id':request['id'],'result':{'thread':{'id':'thread-fixture'}}})
 elif method=='turn/start':
  assert params['sandboxPolicy']['type']=='workspaceWrite'
  send({'id':request['id'],'result':{'turn':{'id':'turn-fixture'}}})
  send({'method':'turn/started','params':{'threadId':'thread-fixture','turn':{'id':'turn-fixture'}}})
  send({'method':'item/reasoning/textDelta','params':{'threadId':'thread-fixture','itemId':'private','delta':'PRIVATE'}})
  send({'method':'item/agentMessage/delta','params':{'threadId':'other','itemId':'private','delta':'PRIVATE'}})
  send({'method':'item/agentMessage/delta','params':{'threadId':'thread-fixture','itemId':'a','delta':'First'}})
  release=os.getenv('TEST_CODEX_RELEASE')
  deadline=time.monotonic()+5
  while release and not Path(release).exists() and time.monotonic()<deadline:time.sleep(.01)
  send({'method':'item/completed','params':{'threadId':'thread-fixture','item':{'type':'agentMessage','id':'a','text':'First','phase':'commentary'}}})
  send({'method':'item/started','params':{'threadId':'thread-fixture','item':{'type':'commandExecution','id':'tool','command':'true','status':'inProgress'}}})
  send({'method':'item/completed','params':{'threadId':'thread-fixture','item':{'type':'commandExecution','id':'tool','command':'true','status':'completed','aggregatedOutput':'done','exitCode':0}}})
  send({'method':'item/agentMessage/delta','params':{'threadId':'thread-fixture','itemId':'b','delta':'Second'}})
  send({'method':'item/completed','params':{'threadId':'thread-fixture','item':{'type':'agentMessage','id':'b','text':'Second','phase':'final_answer'}}})
  send({'method':'turn/completed','params':{'threadId':'thread-fixture','turn':{'id':'turn-fixture','status':os.getenv('TEST_CODEX_STATUS','completed')}}})
''')
    path.chmod(0o700)
    return path


def test_app_server_forwards_real_public_delta_before_turn_finishes(tmp_path,monkeypatch):
    binary=fake_server(tmp_path);release=tmp_path/'release'
    monkeypatch.setenv('TEST_CODEX_RELEASE',str(release))
    events=[];first=threading.Event();done=threading.Event();errors=[]
    def emit(event):
        events.append(event)
        if event['type']=='agent_message.delta':first.set()
    def worker():
        try:run([str(binary),'exec','--json','--sandbox','workspace-write','-C',str(tmp_path),'-'],'fixture',emit)
        except BaseException as error:errors.append(error)
        finally:done.set()
    thread=threading.Thread(target=worker);thread.start()
    try:assert first.wait(3) and not done.is_set()
    finally:release.write_text('continue');thread.join(5)
    assert not errors
    assert 'PRIVATE' not in str(events)
    assert [event['item']['delta'] for event in events if event['type']=='agent_message.delta']==['First','Second']


def test_codex_adapter_uses_app_server_deltas_and_keeps_interleaving(tmp_path,monkeypatch):
    binary=fake_server(tmp_path)
    monkeypatch.setenv('AICHART_CODEX_BIN',str(binary));monkeypatch.setenv('AICHART_CODEX_PROVIDER','deepseek');monkeypatch.setenv('DEEPSEEK_API_KEY','fixture')
    monkeypatch.delenv('AICHART_CODEX_TRANSPORT',raising=False)
    events=list(LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs/generated').stream('codex','fixture',[],session_key='test-codex'))
    visible=[(kind,data) for kind,data in events if kind in {'answer_text','tool_step'} and not data.get('provisional')]
    assert [kind for kind,data in visible]==['tool_step','tool_step','answer_text']
    assert visible[-1][1]['text']=='Second'
    assert any(kind=='progress' and data.get('text')=='First' for kind,data in events)
    assert [data['phase'] for kind,data in visible if kind=='tool_step']==['started','completed']
    final=next(data for kind,data in events if kind=='final')
    assert final['interpretation']=='Second'


@pytest.mark.parametrize('status',['failed','interrupted'])
def test_incomplete_turn_cannot_be_reported_as_success(tmp_path,monkeypatch,status):
    monkeypatch.setenv('TEST_CODEX_STATUS',status)
    with pytest.raises(RuntimeError,match='未完成'):run([str(fake_server(tmp_path)),'exec','-'],'fixture',lambda event:None)


def test_resume_images_model_config_and_sandbox_are_preserved():
    command,settings=launch_options(['codex','exec','resume','--json','--config','model_provider="fixture"','thread-id','--model','exact-model','--image','/tmp/image.png','-'])
    assert settings['resume']=='thread-id' and settings['model']=='exact-model'
    assert settings['images']==['/tmp/image.png']
    assert command[:2]==['codex','app-server'] and 'model_provider="fixture"' in command
    assert normalized_item({'type':'reasoning','content':['PRIVATE']}) is None
