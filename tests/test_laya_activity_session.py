import json
import sys
import threading
import time
from types import SimpleNamespace

from app.jev_tool_activity_router import ToolActivitySession, JevToolActivityRouter
from app.public_stream import reduce_stream_block
from app.reasoning_frameworks import LocalAgentFrameworks


class Router:
    configured=True
    calls=0
    def route(self,**kwargs):
        self.calls+=1
        return SimpleNamespace(stage='render-chart',confidence=.9,provider_model='local-laya-fixture')


def wait_for_result(session):
    deadline=time.monotonic()+2
    while time.monotonic()<deadline:
        values=list(session.drain())
        if values:return values
        time.sleep(.005)
    raise AssertionError('semantic decision missing')


def test_local_router_uses_no_hosted_api_key_and_ignores_agent_description():
    class Client:
        def __init__(self,**kwargs):
            assert 'api_key' not in kwargs
            assert kwargs['endpoint']=='http://127.0.0.1:8791/predict'
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def system_one(self,*,state,questions):
            assert 'FAKE AGENT TITLE' not in state['command']
            key=next(iter(questions));assert len(questions[key].criteria)<=3
            choice={'activity_family':'生成产物','activity_work':'deliver','activity_stage':'render-chart'}[key]
            return SimpleNamespace(model='local-laya-fixture',answers={key:SimpleNamespace(choice=choice,confidence=.91)})
    router=JevToolActivityRouter(api_key='must-not-be-forwarded',endpoint='http://127.0.0.1:8791/predict',client_factory=Client)
    assert router.route(script='bash',arguments={'command':'python grouped_bar.py --output chart.html','description':'FAKE AGENT TITLE'}).stage=='render-chart'


def test_session_caches_and_reuses_semantics_without_classifying_completions():
    router=Router();session=ToolActivitySession(router,{},threading.Lock())
    try:
        assert session.request('a','bash',{'command':'render.py','description':'old'})['status']=='pending'
        result=wait_for_result(session)[0][1]
        assert result['provider']=='local-laya' and result['stage']=='render-chart'
        cached=session.request('b','bash',{'command':'render.py','description':'new'})
        assert cached['status']=='classified' and router.calls==1
        blocks=[]
        reduce_stream_block(blocks,'tool_step',{'callId':'a','tool':'bash','phase':'completed','activitySemantics':result})
        assert blocks[0]['data']['activitySemantics']['providerModel']=='local-laya-fixture'
    finally:session.close()


def test_slow_or_failed_local_model_never_blocks_the_stream_or_claims_laya_success():
    gate=threading.Event()
    class Slow(Router):
        def route(self,**kwargs):gate.wait(2);raise RuntimeError('unavailable')
    session=ToolActivitySession(Slow(),{},threading.Lock())
    try:
        start=time.monotonic();result=session.request('a','bash',{})
        assert time.monotonic()-start<.1 and result['status']=='pending'
        gate.set();fallback=wait_for_result(session)[0][1]
        assert fallback['status']=='fallback' and fallback['provider']=='host'
        assert 'providerModel' not in fallback
    finally:gate.set();session.close()


def test_cli_secrets_and_private_content_are_not_used_for_semantic_selection():
    args=JevToolActivityRouter.semantic_arguments({'file_path':'/outputs/widget.html','content':'PRIVATE'*100,'thoughtSummary':'PRIVATE'})
    assert 'PRIVATE' not in str(args)
    safe=JevToolActivityRouter._safe_cli_text({'command':"run --api-key abc --token='xyz'",'api_key':'nested-secret'})
    assert all(secret not in safe for secret in ('abc','xyz','nested-secret'))


def test_registered_capability_is_host_metadata_not_an_agent_claim(tmp_path):
    (tmp_path/'app').mkdir()
    (tmp_path/'app/module_registry.json').write_text(json.dumps([
        {'script':'prices.py','label':'Prices','description':'Fetch stock prices.\nNot a chart renderer.'}
    ]))
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs')
    actual=client._tool_activity_arguments({'command':'python app/skill_runner.py execute --script prices.py',
                                          'description':'AGENT CLAIM','__capability':'FAKE CLAIM'})
    assert actual['__capability']=='Prices: Fetch stock prices.'
    assert 'CLAIM' not in str(actual)


def test_harness_semantics_override_agent_title_and_reuse_the_completed_tool_state(tmp_path,monkeypatch):
    monkeypatch.setenv('AICHART_DSH_HOME',str(tmp_path/'dsh'))
    router=Router()
    class Harness:
        def __init__(self,**kwargs):pass
        def close(self):pass
        def run(self,prompt,*,session_id,on_notification):
            def emit(kind,data):on_notification(SimpleNamespace(method='session.event',payload={'sessionId':session_id,'event':{'type':kind,'data':data}}))
            emit('tool/call',{'callId':'a','name':'bash','arguments':{'command':'render.py','description':'AGENT TITLE'}})
            emit('tool/result',{'message':{'toolCallId':'a','content':[{'type':'text','text':'ok'}]}})
            time.sleep(.05)
            emit('assistant/message',{'message':{'content':[{'type':'text','text':'正式答案。'}]}})
            return SimpleNamespace(session_id=session_id,final_response='正式答案。',events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs/generated',tool_activity_router=router)
    events=list(client._stream_deepseek('生成图表',[],'activity','',[]))
    steps=[data for kind,data in events if kind=='tool_step']
    classified=[step for step in steps if step['activitySemantics']['status']=='classified']
    assert classified and classified[-1]['thoughtSummary']=='正在把分析结果转换为图表'
    assert classified[-1]['phase']=='completed'
    assert router.calls==1
    assert [data['delta'] for kind,data in events if kind=='answer_text']==['正式答案。']


def test_slow_activity_never_delays_final_answer_or_invents_a_laya_result(tmp_path,monkeypatch):
    gate=threading.Event()
    class Slow(Router):
        def route(self,**kwargs):gate.wait(2);return super().route(**kwargs)
    class Harness:
        def __init__(self,**kwargs):pass
        def close(self):pass
        def run(self,prompt,*,session_id,on_notification):
            on_notification(SimpleNamespace(method='session.event',payload={'sessionId':session_id,'event':{'type':'tool/call','data':{'callId':'a','name':'bash','arguments':{'command':'fixture','description':'工具本身说明'}}}}))
            return SimpleNamespace(session_id=session_id,final_response='答案立即返回。',events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    monkeypatch.setenv('AICHART_DSH_HOME',str(tmp_path/'dsh'))
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs',tool_activity_router=Slow())
    try:
        start=time.monotonic();events=list(client._stream_deepseek('读取数据',[],'fast-answer','',[]))
        assert time.monotonic()-start<.5
        step=[data for kind,data in events if kind=='tool_step'][-1]
        assert step['activitySemantics']['status']=='fallback'
        assert step['activitySemantics']['reason']=='classification-not-ready'
        assert step['thoughtSummary'].startswith('工具说明：')
        assert any(kind=='final' for kind,data in events)
    finally:gate.set()
