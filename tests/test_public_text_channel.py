from types import SimpleNamespace
import time
import json
import pytest
from app.public_text_channel import PublicTextChannelSession
from app.public_stream import PublicStream,reduce_stream_block

def router(choice='progress',failed=False,summary=None):
    calls=[]
    class Client:
        def __init__(self,**kwargs):self.chat=SimpleNamespace(completions=SimpleNamespace(create=self.create))
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def create(self,**kwargs):
            calls.append(kwargs)
            if failed:raise TimeoutError('offline')
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({'channel':choice,**({'progressSummary':summary} if summary is not None else {})})))],model='configured-model')
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

@pytest.mark.parametrize("summary",[None,"正在核对数据来源和统计口径。"])
def test_live_harness_reclassifies_only_progress_and_keeps_terminal_answer(tmp_path,monkeypatch,summary):
    import sys,threading
    from app.reasoning_frameworks import LocalAgentFrameworks
    release=threading.Event()
    monkeypatch.setenv('DSH_HOME',str(tmp_path/'dsh'))
    monkeypatch.setattr('app.reasoning_frameworks.PublicTextChannelSession',lambda **_:session_for(router(summary=summary)))
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
                assert data['text']==(summary or '我先确认数据口径。')
                release.set();break
        else:pytest.fail('public progress was not reclassified while the run was active')
        rest=list(events)
        assert not any(e=='answer_text' for e,d in seen)  # progress never flashes in the answer
        assert any(e=='final' and '实际分析结论。' in d.get('interpretation','') for e,d in rest)
        assert all('我先确认数据口径。' not in d.get('interpretation','') for e,d in rest if e=='final')
    finally:release.set();client._drop_deepseek_harness('classified')


def test_classifier_receives_user_requested_body_context_without_changing_text():
    r=router(choice='answer')
    question='先在正文写“先说明，再展示交互过程。”，然后在这里展示 HTML。'
    text='先说明，再展示交互过程。'
    session=PublicTextChannelSession(r.factory,usage_recorder=lambda _:None,question=question)
    decision=session.classify(text)
    assert json.loads(r.calls[0]['messages'][1]['content'])=={'publicText':text,'userQuestion':question}
    stream=PublicStream()
    events=stream.chunk({'type':'text-delta','index':1,'text':text})
    stream.message({'content':[{'type':'reasoning','text':'private'},{'type':'text','text':text}]})
    key=events[0][1]['blockId']
    assert stream.classify_progress(key,text,decision)==[]
    assert text in stream.transcript('展示后继续正文。')


@pytest.mark.parametrize('question,text,summary',[
    ('把今天美股盘前市场表现整理成一份HTML报告',
     "I'll start by defining the minimum sufficient evidence for the report: today's US pre-market performance across major indices, key mega-cap stocks, and drivers (news). Then I'll check the data contracts.",
     '正在确认美股盘前报告所需的信息和数据口径。'),
    ('请用英文介绍今天的美股盘前市场', '我先检查行情数据契约。',
     'Checking the pre-market data sources and available fields.'),
    ('把数据整理成报告', '我会先读取 schema 再核对参数。',
     '正在确认数据字段和统计口径。'),
])
def test_progress_normalizes_language_and_internal_terms_in_the_existing_classification_call(question,text,summary):
    r=router(summary=summary)
    session=PublicTextChannelSession(r.factory,usage_recorder=lambda _:None,question=question)
    decision=session.classify(text)
    assert len(r.calls)==1
    assert decision['progressSummary']==summary
    assert json.loads(r.calls[0]['messages'][1]['content'])['userQuestion']==question
    stream=PublicStream();stream.chunk({'type':'text-delta','text':text})
    stream.message({'content':[{'type':'text','text':text}]})
    key,_=stream.channel_candidates[0]
    events=stream.classify_progress(key,text,decision)
    assert events[0][1]['discard']
    assert events[1][1]['text']==summary
    assert stream.public_blocks[key]==text  # retain original public source for provenance
    assert stream.transcript('报告正文')=='报告正文'
    blocks=[]
    for event,data in events:reduce_stream_block(blocks,event,data)
    assert blocks[0]['data']['text']==summary


def test_answer_is_never_rewritten_even_if_classifier_returns_a_summary():
    r=router(choice='answer',summary='不应替换正文')
    decision=session_for(r).classify('NVDA rose 1.2%.')
    assert 'progressSummary' not in decision
    stream=PublicStream();stream.chunk({'type':'text-delta','text':'NVDA rose 1.2%.'})
    stream.message({'content':[{'type':'text','text':'NVDA rose 1.2%.'}]})
    key,text=stream.channel_candidates[0]
    assert stream.classify_progress(key,text,decision)==[]
    assert stream.transcript('')=='NVDA rose 1.2%.'


@pytest.mark.parametrize('summary',[None, '', 'x'*241, {'invalid':'type'}])
def test_invalid_progress_summary_keeps_original_public_text(summary):
    decision=session_for(router(summary=summary)).classify('正在核对数据。')
    assert 'progressSummary' not in decision
