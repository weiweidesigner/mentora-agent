from types import SimpleNamespace
import time
import json
import pytest
from app.public_text_channel import PublicTextChannelSession
from app.public_stream import PublicStream,reduce_stream_block

def router(choice='progress',failed=False):
    calls=[]
    class Client:
        def __init__(self,**kwargs):self.chat=SimpleNamespace(completions=SimpleNamespace(create=self.create))
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def create(self,**kwargs):
            calls.append(kwargs)
            if failed:raise TimeoutError('offline')
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({'channel':choice})))],model='configured-model')
    return SimpleNamespace(factory=Client,calls=calls)

def session_for(r):
    return PublicTextChannelSession(r.factory,usage_recorder=lambda _:None)

def test_progress_classification_preserves_verbatim_public_text_and_provenance():
    r=router();session=session_for(r)
    text='我先核对数据口径，再计算。'
    decision=session.classify(text)
    assert decision['channel']=='progress' and decision['provider']=='assistant-channel-model'
    assert json.loads(r.calls[0]['messages'][1]['content'])=={'publicText':text}
    stream=PublicStream()
    stream.chunk({'type':'text-delta','text':text})
    stream.message({'content':[{'type':'text','text':text}]})
    key=stream.channel_candidates[0][0]
    events=stream.classify_progress(key,text,decision)
    assert events[0][1]['discard'] and events[1][1]['text']==text
    assert stream.transcript('实际结论')=='实际结论'

@pytest.mark.parametrize('channel',['analysis','reasoning','commentary','final','final_answer'])
def test_explicit_channels_are_never_sent_to_fallback_classifier(channel):
    stream=PublicStream()
    stream.chunk({'type':'text-delta','text':'provider text','channel':channel})
    stream.message({'channel':channel,'content':[{'type':'text','text':'provider text'}]})
    assert not stream.channel_candidates

def test_answer_and_uncertain_classifications_do_not_move_body_text():
    stream=PublicStream();stream.chunk({'type':'text-delta','text':'Actual findings'})
    stream.message({'content':[{'type':'text','text':'Actual findings'}]})
    key,text=stream.channel_candidates[0]
    assert stream.classify_progress(key,text,{'channel':'answer'})==[]
    assert session_for(router(choice='unknown')).classify(text) is None
    assert stream.transcript('Actual findings')=='Actual findings'
    stream.finish('Actual findings')
    assert stream.classify_progress(key,text,{'channel':'progress'})==[]

def test_progress_reclassification_keeps_chronological_position_in_saved_stream():
    blocks=[]
    reduce_stream_block(blocks,'answer_text',{'blockId':'a','delta':'Checking inputs'})
    reduce_stream_block(blocks,'tool_step',{'callId':'c','tool':'read','phase':'completed'})
    reduce_stream_block(blocks,'answer_text',{'blockId':'b','delta':'Actual findings'})
    reduce_stream_block(blocks,'answer_text',{'blockId':'a','discard':True,'channel':'commentary'})
    reduce_stream_block(blocks,'progress',{'blockId':'a','text':'Checking inputs','kind':'commentary','channelSemantics':{'provider':'assistant-channel-model'}})
    assert [b['kind'] for b in blocks]==['progress','tool_step','text']
    assert blocks[0]['data']['channelSemantics']['provider']=='assistant-channel-model'
    assert blocks[2]['text']=='Actual findings'

def test_async_classifier_never_blocks_model_stream_and_fails_open():
    r=router(failed=True);session=session_for(r)
    try:
        session.request('a','public status')
        deadline=time.monotonic()+1
        while not session.unavailable and time.monotonic()<deadline:time.sleep(.01)
        assert session.unavailable and list(session.drain())==[]
        session.request('b','another status')
        assert len(r.calls)==1
    finally:session.close()

def test_live_harness_reclassifies_only_progress_and_keeps_terminal_answer(tmp_path,monkeypatch):
    import sys,threading
    from app.reasoning_frameworks import LocalAgentFrameworks
    release=threading.Event()
    monkeypatch.setenv('DSH_HOME',str(tmp_path/'dsh'))
    monkeypatch.setattr('app.reasoning_frameworks.PublicTextChannelSession',lambda:session_for(router()))
    class Harness:
        def __init__(self,**kwargs):pass
        def close(self):release.set()
        def run(self,prompt,*,session_id,on_notification):
            def emit(kind,data):on_notification(SimpleNamespace(method='session.event',payload={'sessionId':session_id,'event':{'type':kind,'data':data}}))
            emit('assistant/chunk',{'chunk':{'type':'text-delta','index':0,'text':'我先确认数据口径。'}})
            emit('assistant/message',{'message':{'content':[{'type':'text','text':'我先确认数据口径。'}]}})
            emit('tool/call',{'callId':'read','name':'read','arguments':{'file_path':'fixture'}})
            assert release.wait(4)
            emit('assistant/message',{'message':{'channel':'final','content':[{'type':'text','text':'实际分析结论。'}]}})
            return SimpleNamespace(session_id=session_id,final_response='实际分析结论。',events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs/generated')
    events=client.stream('deepseek','测试',[],session_key='classified')
    seen=[]
    try:
        for event,data in events:
            seen.append((event,data))
            if event=='progress' and data.get('channelSemantics'):
                assert data['text']=='我先确认数据口径。'
                release.set();break
        else:pytest.fail('public progress was not reclassified while the run was active')
        rest=list(events)
        assert any(e=='answer_text' and d.get('discard') for e,d in seen)
        assert any(e=='final' and '实际分析结论。' in d.get('interpretation','') for e,d in rest)
        assert all('我先确认数据口径。' not in d.get('interpretation','') for e,d in rest if e=='final')
    finally:release.set();client._drop_deepseek_harness('classified')
