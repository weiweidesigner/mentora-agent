import json
import sys
import threading
import pytest
from types import SimpleNamespace

from app.public_stream import PublicStream, reduce_stream_block
from app.reasoning_frameworks import LocalAgentFrameworks
from app.chat_sessions import ChatSessions


def test_public_deltas_private_reasoning_and_settlement_dedup():
    stream = PublicStream()
    assert stream.chunk({'type':'reasoning-delta','text':'private'}) == []
    first = stream.chunk({'type':'text-delta','index':1,'text':'first'})
    assert first[0][1]['delta'] == 'first'
    assert stream.message({'content':[{'type':'reasoning','text':'private'},{'type':'text','text':'first'}]}) == []
    assert stream.finish('first')[0][1]['final'] is True
    second = stream.chunk({'type':'text-delta','index':0,'text':'second'})
    assert second[0][1]['blockId'] != first[0][1]['blockId']


def test_native_widget_arguments_are_forwarded_as_received():
    stream = PublicStream()
    events = stream.chunk({'type':'tool-call-delta','index':0,'id':'c','name':'visualize_show_widget','argumentsDelta':'{"title":"Chart",'})
    events += stream.chunk({'type':'tool-call-delta','index':0,'id':'c','argumentsDelta':'"widget_code":"<p>1</p>"}'})
    assert events[0][1]['reset'] is True
    assert events[1][1]['reset'] is False
    assert json.loads(''.join(data['argumentDelta'] for _,data in events))['widget_code'] == '<p>1</p>'


@pytest.mark.parametrize('bridge',[False,True])
def test_model_delta_arrives_before_harness_finishes(tmp_path,monkeypatch,bridge):
    release=threading.Event();finished=threading.Event()
    monkeypatch.setenv('DSH_HOME',str(tmp_path/'dsh'))
    class Harness:
        def __init__(self,**kwargs):pass
        def close(self):release.set()
        def run(self,prompt,*,session_id,on_notification):
            def emit(kind,data):on_notification(SimpleNamespace(method='session.event',payload={'sessionId':session_id,'event':{'type':kind,'data':data}}))
            def chunk(value):
                if bridge:on_notification(SimpleNamespace(method='mentora.public-stream',payload={'sessionId':session_id,'frame':{'type':'chunk','chunk':value}}))
                else:emit('assistant/chunk',{'chunk':value})
            chunk({'type':'reasoning-delta','index':0,'text':'private'})
            chunk({'type':'text-delta','index':1,'text':'first'})
            assert release.wait(5)
            emit('assistant/message',{'message':{'content':[{'type':'reasoning','text':'private'},{'type':'text','text':'first'}]}})
            emit('tool/call',{'callId':'read','name':'read','arguments':{'file_path':'fixture'}})
            chunk({'type':'text-delta','index':0,'text':'second'})
            emit('assistant/message',{'message':{'content':[{'type':'text','text':'second'}]}})
            finished.set()
            return SimpleNamespace(session_id=session_id,final_response='second',events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs/generated')
    events=client.stream('deepseek','测试',[],session_key='real-delta')
    try:
        first=next(data for event,data in events if event=='answer_text')
        assert first['delta']=='first' and not finished.is_set()
        release.set()
        rest=list(events)
        assert [event for event,data in rest if event in {'answer_text','tool_step'} and not data.get('discard') and not data.get('final')]==['tool_step','answer_text']
        assert 'private' not in str(first)+str(rest)
    finally:release.set();client._drop_deepseek_harness('real-delta')


def test_durable_replay_retains_interleaving_on_success_and_failure(tmp_path):
    for failed in (False,True):
        store=ChatSessions(tmp_path/str(failed))
        payload={'question':'test','sessionId':'s','history':[]}
        def execute(payload,owner):
            yield 'answer_text',{'blockId':'a','delta':'first'}
            yield 'tool_step',{'callId':'c','tool':'read','phase':'running'}
            yield 'visualization',{'id':'v','toolRawInput':'private-large-arguments','native':True}
            yield 'answer_text',{'blockId':'b','delta':'second'}
            yield 'tool_step',{'callId':'c','tool':'read','phase':'completed'}
            yield 'visualization',{'id':'v','htmlUrl':'/generated/v.html','final':True}
            yield ('error' if failed else 'final'),{'interpretation':'second','detail':'stopped'}
        store.start('owner',payload,execute,'request');store.pool.shutdown(wait=True)
        saved=store.sessions('owner')[0]['messages'][-1]['streamBlocks']
        assert [block['kind'] for block in saved]==['text','tool_step','visualization','text']
        assert saved[1]['data']['phase']=='completed'
        assert saved[2]['data']['htmlUrl']=='/generated/v.html'
        assert 'private-large-arguments' not in str(saved)


def test_reducer_keeps_text_blocks_separate():
    blocks=[]
    for event,data in [('answer_text',{'blockId':'a','delta':'A'}),('module',{'url':'/generated/a.html'}),('answer_text',{'blockId':'b','delta':'B'}),('answer_text',{'blockId':'a','delta':'! '})]:
        reduce_stream_block(blocks,event,data)
    assert [block['kind'] for block in blocks]==['text','visualization','text']
    assert blocks[0]['text']=='A! '


def test_final_only_legacy_artifacts_still_replay(tmp_path):
    store=ChatSessions(tmp_path)
    def execute(payload,owner):
        yield 'answer_text',{'text':'legacy'}
        yield 'final',{'interpretation':'legacy','reportArtifacts':[{'url':'/generated/legacy.html'}]}
    store.start('owner',{'question':'test'},execute,'final-only')
    store.pool.shutdown(wait=True)
    blocks=store.sessions('owner')[0]['messages'][-1]['streamBlocks']
    assert [block['kind'] for block in blocks]==['text','visualization']
