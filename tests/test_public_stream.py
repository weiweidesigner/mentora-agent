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
    assert stream.finish('first') == []
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
            chunk({'type':'text-delta','index':1,'text':'[[MENTORA_ANSWER]]first'})
            assert release.wait(5)
            emit('assistant/message',{'message':{'content':[{'type':'reasoning','text':'private'},{'type':'text','text':'[[MENTORA_ANSWER]]first'}]}})
            emit('tool/call',{'callId':'read','name':'read','arguments':{'file_path':'fixture'}})
            chunk({'type':'text-delta','index':0,'text':'[[MENTORA_ANSWER]]second'})
            emit('assistant/message',{'message':{'content':[{'type':'text','text':'[[MENTORA_ANSWER]]second'}]}})
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


def test_unlabelled_stage_never_flashes_before_its_progress_classification():
    stream=PublicStream('deepseek',gate_unlabelled=True)
    text='盘前主线已经清楚：风险偏好温和回升，但内部明显分化。我现在把这份横截面快照和驱动因素整理成 HTML 报告。'
    for char in text:
        assert stream.chunk({'type':'text-delta','index':0,'text':char})==[]
    assert stream.message({'content':[{'type':'text','text':text}]})==[]
    key,source=stream.channel_candidates.pop()
    events=stream.classify_progress(key,source,{'channel':'progress','progressSummary':'正在整理盘前市场报告。'})
    assert [e for e,d in events]==['progress']
    assert stream.finish(text)==[]  # terminal settlement must not resurrect the status
    assert stream.transcript(text)==''


def test_answer_channel_header_is_consumed_for_every_possible_split_without_buffering_body():
    from app.public_stream import ANSWER_PREFIX
    text='核心结论：已成交样本中半导体领涨。\n下面是完整报告。'
    raw=ANSWER_PREFIX+text
    for split in range(1,len(raw)):
        stream=PublicStream(gate_unlabelled=True)
        first=stream.chunk({'type':'text-delta','index':1,'text':raw[:split]})
        if split<=len(ANSWER_PREFIX):assert first==[]
        else:assert first[0][1]['delta']==text[:split-len(ANSWER_PREFIX)]
        second=stream.chunk({'type':'text-delta','index':1,'text':raw[split:]})
        assert ''.join(d.get('delta','') for e,d in first+second)==text
        assert stream.message({'content':[{'type':'reasoning','text':'private'},{'type':'text','text':raw}]})==[]
        assert stream.channel_candidates==[]
        assert stream.finish(raw)==[]
        assert stream.transcript(raw)==text


def test_unlabelled_answer_waits_for_classification_without_blocking_widget_or_tools():
    stream=PublicStream(gate_unlabelled=True)
    text='下面是基于已核验数据的完整报告。'
    assert stream.chunk({'type':'text-delta','text':text})==[]
    assert stream.message({'content':[{'type':'text','text':text}]})==[]
    key,_=stream.channel_candidates[0]
    assert stream.progress_event('tool/call',{'callId':'p','name':'report_progress','arguments':{'summary':'核对图表数据。'}})[0][0]=='progress'
    assert stream.chunk({'type':'tool-call-delta','id':'v','name':'visualize_show_widget','argumentsDelta':'{'})[0][0]=='visualization'
    event,data=stream.classify_progress(key,text,{'channel':'answer'})[0]
    assert event=='answer_text' and data['text']==text
    assert stream.classify_progress(key,text,{'channel':'answer'})==[]


def test_failed_classifier_does_not_publish_intermediate_status_as_body():
    stream=PublicStream(gate_unlabelled=True)
    status='数据已取到，接下来继续核验。'
    assert stream.chunk({'type':'text-delta','text':status})==[]
    stream.message({'content':[{'type':'text','text':status}]})
    assert stream.classify_progress(*stream.channel_candidates[0],{})==[]
    stream.chunk({'type':'text-delta','text':'[[MENTORA_ANSWER]]实际结论。'})
    stream.message({'content':[{'type':'text','text':'[[MENTORA_ANSWER]]实际结论。'}]})
    assert stream.finish('[[MENTORA_ANSWER]]实际结论。')==[]
    assert stream.transcript('实际结论。')=='实际结论。'



def test_requested_literal_header_in_body_is_not_removed_twice():
    from app.public_stream import ANSWER_PREFIX
    stream=PublicStream(gate_unlabelled=True)
    raw=ANSWER_PREFIX+ANSWER_PREFIX+' 是正文中的字面量。'
    stream.chunk({'type':'text-delta','text':raw})
    stream.message({'content':[{'type':'text','text':raw}]})
    assert stream.finish(raw)==[]
    assert stream.transcript(raw)==ANSWER_PREFIX+' 是正文中的字面量。'
