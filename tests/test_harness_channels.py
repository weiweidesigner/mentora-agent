"""Harness frame/message metadata, with opaque content and no keyword routing."""
import sys
import threading
from types import SimpleNamespace
from app.reasoning_frameworks import LocalAgentFrameworks


def test_harness_native_metadata_routes_before_run_finishes(tmp_path,monkeypatch):
    release=threading.Event();finished=threading.Event()
    monkeypatch.setenv('DSH_HOME',str(tmp_path/'dsh'))
    class Harness:
        def __init__(self,**kwargs):pass
        def close(self):release.set()
        def run(self,prompt,*,session_id,on_notification):
            def frame(value):
                on_notification(SimpleNamespace(method='mentora.public-stream',payload={'sessionId':session_id,'frame':value}))
            def message(value):
                on_notification(SimpleNamespace(method='session.event',payload={'sessionId':session_id,'event':{'type':'assistant/message','data':value}}))
            frame({'type':'start','attemptId':'one'})
            frame({'type':'chunk','phase':'commentary','chunk':{'type':'text-delta','index':0,'text':'opaque-A'}})
            message({'channel':'commentary','message':{'content':[{'type':'text','text':'opaque-A'}]}})
            frame({'type':'start','attemptId':'two'})
            frame({'type':'chunk','channel':'analysis','chunk':{'type':'text-delta','index':1,'text':'PRIVATE'}})
            frame({'type':'chunk','phase':'final_answer','chunk':{'type':'text-delta','index':0,'text':'opaque-B'}})
            assert release.wait(5)
            message({'message':{'phase':'final_answer','content':[{'type':'text','text':'opaque-B'}]}})
            finished.set()
            return SimpleNamespace(session_id=session_id,final_response='opaque-B',events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs/generated')
    events=[]
    iterator=client.stream('deepseek','native channel fixture',[],session_key='harness-metadata')
    try:
        for event,data in iterator:
            events.append((event,data))
            if event=='answer_text':
                assert data.get('delta')=='opaque-B'
                assert not finished.is_set()
                release.set()
                break
        events+=list(iterator)
        assert any(event=='progress' and data.get('text')=='opaque-A' for event,data in events)
        assert not any(event=='answer_text' and ('opaque-A' in str(data) or 'PRIVATE' in str(data)) for event,data in events)
        assert next(data for event,data in events if event=='final')['interpretation']=='opaque-B'
    finally:
        release.set();client._drop_deepseek_harness('harness-metadata')
