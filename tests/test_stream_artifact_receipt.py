"""Real skill_runner receipt nesting must hand off charts before final prose."""
import json
import sys
from types import SimpleNamespace

from app.reasoning_frameworks import LocalAgentFrameworks


def fixture(tmp_path):
    generated=tmp_path/'outputs/generated';generated.mkdir(parents=True)
    artifact=generated/'chart.html';artifact.write_text('<html><body><svg></svg></body></html>')
    receipt={'ok':True,'capability':'bar_chart','script':'bar_chart.py','durationMs':46,'exitCode':0,
             'observation':{'ok':True,'output':str(artifact)},
             'artifacts':[{'path':str(artifact),'bytes':artifact.stat().st_size,'verified':True}]}
    return generated,artifact,receipt


def test_actual_runner_receipt_and_sdk_wrapper_expose_the_completed_chart(tmp_path):
    generated,artifact,receipt=fixture(tmp_path)
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=generated)
    assert client._html_modules_from_tool_output(receipt)==[{'htmlUrl':'/generated/chart.html','label':'chart','streamvizSource':'generated-html'}]
    sdk={'message':{'content':[{'type':'text','text':json.dumps(receipt)}]}}
    assert client._html_modules_from_tool_output(sdk)==client._html_modules_from_tool_output(receipt)
    internal=generated/'internal.html';internal.write_text('<main data-artifact-type="execution-receipt">internal</main>')
    assert client._html_modules_from_tool_output({'ok':True,'observation':{'ok':True,'output':str(internal)}})==[]


def test_harness_delivers_chart_before_answer_without_waiting_for_final(tmp_path,monkeypatch):
    generated,artifact,receipt=fixture(tmp_path)
    monkeypatch.setenv('AICHART_DSH_HOME',str(tmp_path/'dsh'))
    text='图表解读。\n[[AIME_CHART:'+str(artifact)+']]'
    class Harness:
        def __init__(self,**kwargs):pass
        def close(self):pass
        def run(self,prompt,*,session_id,on_notification):
            def emit(kind,data):
                on_notification(SimpleNamespace(method='session.event',payload={'sessionId':session_id,'event':{'type':kind,'data':data}}))
            emit('tool/call',{'callId':'chart','name':'bash','arguments':{'command':'fixture','description':'渲染图表'}})
            emit('tool/result',{'message':{'toolCallId':'chart','content':[{'type':'text','text':json.dumps(receipt)}]}})
            emit('assistant/message',{'message':{'content':[{'type':'text','text':text}]}})
            return SimpleNamespace(session_id=session_id,final_response=text,events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=generated)
    events=list(client._stream_deepseek('复盘已有数据',[],'receipt-stream','',[]))
    kinds=[kind for kind,data in events]
    assert kinds.index('module') < kinds.index('answer_text') < kinds.index('final')
    assert [data['htmlUrl'] for kind,data in events if kind=='module']==['/generated/chart.html']
