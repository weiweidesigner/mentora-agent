from pathlib import Path
from types import SimpleNamespace
import json
import sys

import pytest

from app.public_stream import PublicStream, PROGRESS_TOOL, reduce_stream_block
from app.reasoning_frameworks import LocalAgentFrameworks


def test_explicit_tool_never_becomes_answer_or_tool_step():
    stream = PublicStream('deepseek')
    events = stream.progress_event('tool/call', {'callId':'p1','name':PROGRESS_TOOL,'arguments':json.dumps({'summary':'正在核对数据。'})})
    assert events == [('progress', {'blockId':'deepseek:progress:p1','text':'正在核对数据。','kind':'commentary'})]
    assert stream.progress_event('tool/call', {'callId':'p1','name':PROGRESS_TOOL,'arguments':{'summary':'重复'}}) == []
    assert stream.progress_event('tool/result', {'message':{'toolCallId':'p1','content':[{'type':'text','text':'{"ok":true}'}]}}) == []
    assert stream.progress_event('tool/call', {'callId':'bash','name':'bash','arguments':{}}) is None
    blocks=[]
    for event,data in events: reduce_stream_block(blocks,event,data)
    assert [block['kind'] for block in blocks] == ['progress']
    assert stream.transcript('结论。') == '结论。'


@pytest.mark.parametrize('args', [{}, {'summary':''}, {'summary':None}, {'summary':'x'*241}, 'not-json'])
def test_invalid_progress_is_not_displayed(args):
    stream=PublicStream()
    assert stream.progress_event('tool/call', {'callId':'p','name':PROGRESS_TOOL,'arguments':args}) == []


def test_harness_progress_answer_and_tool_lifecycle_are_distinct(tmp_path,monkeypatch):
    generated=tmp_path/'outputs/generated';generated.mkdir(parents=True)
    monkeypatch.setenv('AICHART_DSH_HOME',str(tmp_path/'dsh'))
    class Harness:
        def __init__(self,**kwargs): pass
        def close(self): pass
        def run(self,prompt,*,session_id,on_notification):
            assert 'report_progress' in prompt
            assert '没有 commentary/final 文本通道' in prompt
            def emit(kind,data,owner=None):
                on_notification(SimpleNamespace(method='session.event',payload={'sessionId':owner or session_id,'event':{'type':kind,'data':data}}))
            def progress(call,text,owner=None):
                emit('tool/call',{'callId':call,'name':PROGRESS_TOOL,'arguments':{'summary':text}},owner)
                emit('tool/result',{'message':{'toolCallId':call,'content':[{'type':'text','text':'{"ok":true}'}]}},owner)
            progress('p1','核对数据口径。')
            progress('private-child','CHILD PRIVATE',owner='child')
            emit('assistant/message',{'message':{'content':[{'type':'reasoning','text':'PRIVATE'},{'type':'text','text':'[[MENTORA_ANSWER]]**正文结论**'}]}})
            emit('tool/call',{'callId':'b','name':'bash','arguments':{'command':'true','description':'验证组件'}})
            emit('tool/result',{'message':{'toolCallId':'b','content':[{'type':'text','text':'ok'}]}})
            progress('p2','组件已验证。')
            emit('assistant/message',{'message':{'content':[{'type':'text','text':'[[MENTORA_ANSWER]]交付完成。'}]}})
            return SimpleNamespace(session_id=session_id,final_response='交付完成。',events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    events=list(LocalAgentFrameworks(project_root=tmp_path,generated_dir=generated).stream('deepseek','验证已有结果',[],session_key='explicit-progress'))
    assert [d['text'] for k,d in events if k=='progress'] == ['核对数据口径。','组件已验证。']
    assert [d['delta'] for k,d in events if k=='answer_text'] == ['**正文结论**','交付完成。']
    assert all(d['tool'] != PROGRESS_TOOL for k,d in events if k=='tool_step')
    assert 'PRIVATE' not in str(events)
    final=next(d for k,d in events if k=='final')
    assert '正文结论' in final['interpretation']
    assert '核对数据口径' not in final['interpretation']


def test_plugin_is_registered_in_runtime_patch():
    root=Path(__file__).parents[1]
    assert 'dsh_public_progress.cjs' in (root/'app/dsh_tool_environment.cordis.yml').read_text()
