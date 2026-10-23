import json
from types import SimpleNamespace as NS
import pytest
from app.public_json import PublicJsonStrings,PublicJsonAttempt,PublicAnswerLedger,public_json_fields,collect_chat_stream
from app.public_stream import reduce_stream_block
from app.skill_calls import skill_events


@pytest.mark.parametrize('size',[1,2,3,7,1000])
def test_only_selected_paths_decode_incrementally_across_escape_boundaries(size):
    expected='真实\n文本 "quoted" 😀 \\ /'
    text=json.dumps({'reasoning':'PRIVATE','arguments':{'reason':'PRIVATE'},'items':[{'reason':'PRIVATE'}],'reason':expected,'public_text':'next'},ensure_ascii=True)
    events=[];parser=PublicJsonStrings(('reason','public_text'),lambda path,delta:events.append((path,delta)))
    for start in range(0,len(text),size):parser.feed(text[start:start+size])
    assert ''.join(delta for path,delta in events if path==('reason',))==expected
    assert ''.join(delta for path,delta in events if path==('public_text',))=='next'
    assert 'PRIVATE' not in str(events)


def test_constrained_result_envelope_does_not_expose_other_fields():
    events=[];parser=PublicJsonStrings(('reason',),lambda path,delta:events.append(delta),('result',))
    parser.feed('{"reason":"PRIVATE","result":{"arguments":{"reason":"PRIVATE"},"reason":"public"}}')
    assert ''.join(events)=='public'


def test_invalid_public_attempt_disappears_from_replay():
    events=[]
    with skill_events(lambda kind,data:events.append((kind,data))),public_json_fields('reason'):
        attempt=PublicJsonAttempt();attempt.feed('{"reason":"provisional"');attempt.discard()
    blocks=[]
    for kind,data in events:reduce_stream_block(blocks,kind,data)
    assert blocks==[]


def test_late_report_validation_retracts_all_provisional_blocks():
    events=[]
    with pytest.raises(ValueError):
        with skill_events(lambda kind,data:events.append((kind,data))),public_json_fields('overview'):
            attempt=PublicJsonAttempt();attempt.feed('{"overview":"draft"}')
            raise ValueError('semantic validation failed')
    assert events[-1][1]['discard'] is True


def test_missing_finish_marker_never_commits_partial_output():
    events=[]
    stream=iter([NS(choices=[NS(delta=NS(content='{"reason":"partial',reasoning_content='PRIVATE'),finish_reason=None)])])
    with skill_events(lambda kind,data:events.append((kind,data))),public_json_fields('reason'):
        with pytest.raises(RuntimeError,match='连接中断'):collect_chat_stream(stream,PublicJsonAttempt())
    assert events[-1][1]['discard'] is True
    assert 'PRIVATE' not in str(events)


def test_validated_final_suffix_is_not_retyped_or_duplicated():
    ledger=PublicAnswerLedger()
    ledger.accept('answer_text',{'blockId':'a','delta':'前文'})
    ledger.accept('answer_text',{'blockId':'b','delta':'结论'})
    assert ledger.remaining('结论\n\n实际执行：未成交')=='实际执行：未成交'
    assert ledger.transcript('结论\n\n实际执行：未成交')=='前文\n\n结论\n\n实际执行：未成交'


def test_native_widget_arguments_stream_incrementally_without_other_arguments():
    events=[]
    with skill_events(lambda kind,data:events.append((kind,data))),public_json_fields('public_text',widgets=True):
        attempt=PublicJsonAttempt()
        text=json.dumps({'public_text':'before','tool':'visualize_show_widget','arguments':{'title':'Fixture','widget_code':'<p>测试 "1" 😀</p>'}},ensure_ascii=True)
        for char in text:attempt.feed(char)
        attempt.finish_widget()
    visual=[data for kind,data in events if kind=='visualization']
    assert len(visual)>3
    arguments=json.loads(''.join(data['argumentDelta'] for data in visual))
    assert arguments=={'title':'Fixture','widget_code':'<p>测试 "1" 😀</p>'}
    assert all(data['id']==attempt.id for data in visual)


def test_nonvisual_tool_arguments_never_stream_as_widgets():
    events=[]
    with skill_events(lambda kind,data:events.append((kind,data))),public_json_fields('public_text',widgets=True):
        attempt=PublicJsonAttempt();attempt.feed('{"tool":"private","arguments":{"title":"PRIVATE","widget_code":"PRIVATE"}}')
    assert events==[]


def test_cancelled_hidden_model_call_cannot_start_another_skill():
    from app.skill_calls import invoke_skill
    called=[]
    with skill_events(None,lambda:True):
        with pytest.raises(InterruptedError):invoke_skill('order','execute',{},lambda:called.append('executed'),script='fixture')
    assert called==[]
