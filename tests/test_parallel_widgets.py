from pathlib import Path
import threading,time
import pytest
from app.parallel_widgets import ParallelWidgets


def drain_until(pool,done):
    events=[];deadline=time.monotonic()+3
    while time.monotonic()<deadline:
        events+=list(pool.drain())
        if done():return events
        time.sleep(.005)
    pytest.fail('Renderer did not settle')


def test_prose_is_prepared_while_html_is_generating_then_released_after_commit(tmp_path):
    started=threading.Event();release=threading.Event()
    def render(args,output):
        yield 'visualization',{'reset':True,'argumentDelta':'{"widget_code":"<p>First'}
        started.set();assert release.wait(3)
        saved=tmp_path/'saved.html';saved.write_text('<p>First second</p>')
        yield 'visualization',{'argumentDelta':' second</p>"}', 'final':True,'htmlUrl':'/generated/saved.html'}
    pool=ParallelWidgets(tmp_path,renderer=render);output=tmp_path/'streamviz-job-test.html'
    try:
        pool.start('v',{'brief':'facts'},{'status':'rendering','output':str(output)})
        assert started.wait(1)
        first=list(pool.drain());assert first[0][1]['argumentDelta'].endswith('<p>First') and not first[0][1].get('final')
        assert list(pool.hold([('answer_text',{'blockId':'after','delta':'Prepared during HTML'})]))==[]
        assert not output.exists() and pool.buffer
        release.set();rest=drain_until(pool,lambda:not pool.active)
        assert [e for e,_ in rest]==['visualization','answer_text']
        assert rest[0][1]['final'] and rest[1][1]['bufferedByVisualization']
        assert rest[1][1]['preparedAt']<rest[0][1]['emittedAt']
        assert output.read_text()=='<p>First second</p>'
    finally:release.set();pool.close()


def test_failed_renderer_does_not_release_success_claims(tmp_path):
    release=threading.Event()
    def render(args,output):
        assert release.wait(3)
        raise RuntimeError('upstream failed')
        yield
    pool=ParallelWidgets(tmp_path,renderer=render)
    try:
        pool.start('v',{'brief':'facts'},{'status':'rendering','output':str(tmp_path/'streamviz-job-test.html')})
        assert not list(pool.hold([('answer_text',{'delta':'Ready to download'})]))
        release.set()
        with pytest.raises(RuntimeError,match='可视化生成失败'):drain_until(pool,lambda:not pool.active)
        assert not pool.buffer and not pool.artifacts
    finally:release.set();pool.close()


def test_cancel_stops_delivery_and_releases_clients(tmp_path):
    pool=ParallelWidgets(tmp_path);closed=[]
    pool.clients['v']=type('Client',(),{'close':lambda _:closed.append(True)})()
    pool.buffer=[('answer_text',{'delta':'pending'})]
    pool.close()
    assert pool.stopped.is_set() and not pool.buffer and closed==[True]


def test_two_parallel_visuals_preserve_text_between_them(tmp_path):
    releases={k:threading.Event() for k in ('one','two')}
    def render(args,output):
        key=args['brief'];yield 'visualization',{'reset':True,'argumentDelta':'{"widget_code":"<p>'+key}
        assert releases[key].wait(3)
        saved=tmp_path/(key+'.html');saved.write_text('<p>'+key+'</p>')
        yield 'visualization',{'argumentDelta':'</p>"}','final':True,'htmlUrl':'/generated/'+saved.name}
    pool=ParallelWidgets(tmp_path,renderer=render)
    try:
        for key in ('one','two'):
            pool.start(key,{'brief':key},{'status':'rendering','output':str(tmp_path/('streamviz-job-'+key+'.html'))})
            assert not list(pool.hold([('answer_text',{'delta':'after '+key})]))
        releases['two'].set();time.sleep(.02)
        first=list(pool.drain());assert all(d['id']=='one' for e,d in first)
        releases['one'].set();rest=drain_until(pool,lambda:not pool.active)
        assert [(e,d.get('id') or d.get('delta')) for e,d in rest]==[('visualization','one'),('answer_text','after one'),('visualization','two'),('visualization','two'),('answer_text','after two')]
    finally:
        for r in releases.values():r.set()
        pool.close()


def test_harness_continues_prose_before_visual_commits_but_delivery_waits(tmp_path,monkeypatch):
    import json,sys
    from types import SimpleNamespace
    from app.reasoning_frameworks import LocalAgentFrameworks
    generated=tmp_path/'outputs/generated';generated.mkdir(parents=True)
    output=generated/'streamviz-job-live.html'
    prepared=threading.Event();release=threading.Event()
    def render(args,out):
        yield 'visualization',{'reset':True,'argumentDelta':'{"widget_code":"<p>First'}
        assert release.wait(4)
        source=generated/'saved.html';source.write_text('<p>First second</p>')
        yield 'visualization',{'argumentDelta':' second</p>"}','final':True,'htmlUrl':'/generated/saved.html'}
    monkeypatch.setenv('DSH_HOME',str(tmp_path/'dsh'))
    monkeypatch.setattr('app.reasoning_frameworks.ParallelWidgets',lambda folder:ParallelWidgets(folder,renderer=render))
    class Harness:
        def __init__(self,**kwargs):pass
        def close(self):release.set()
        def run(self,prompt,*,session_id,on_notification):
            def emit(kind,data):on_notification(SimpleNamespace(method='session.event',payload={'sessionId':session_id,'event':{'type':kind,'data':data}}))
            emit('assistant/message',{'message':{'channel':'final','content':[{'type':'text','text':'Before visual'}]}})
            emit('tool/call',{'callId':'v','name':'visualize_show_widget','arguments':{'title':'Visual','brief':'verified facts'}})
            receipt={'status':'rendering','output':str(output)}
            emit('tool/result',{'message':{'toolCallId':'v','content':[{'type':'text','text':json.dumps(receipt)}]}})
            emit('assistant/chunk',{'chunk':{'type':'text-delta','index':0,'text':'Prepared after text'}})
            emit('assistant/message',{'message':{'channel':'final','content':[{'type':'text','text':'Prepared after text'}]}})
            prepared.set()
            return SimpleNamespace(session_id=session_id,final_response='Prepared after text',events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=generated)
    seen=[]
    try:
        for event,data in client.stream('deepseek','Create a visual',[],session_key='parallel-test'):
            seen.append((event,data))
            if event=='visualization' and not data.get('final'):
                assert prepared.wait(1) and not output.exists()
                assert not any('Prepared after' in d.get('delta','') for e,d in seen if e=='answer_text')
                release.set()
        visual=next(i for i,(e,d) in enumerate(seen) if e=='visualization' and d.get('final'))
        after=next(i for i,(e,d) in enumerate(seen) if e=='answer_text' and d.get('delta')=='Prepared after text')
        assert after>visual and seen[after][1]['bufferedByVisualization']
        final=seen[-1][1];assert final['reportArtifacts'][0]['path']==str(output)
        assert final['fileArtifacts'] and output.exists()
    finally:release.set();client._drop_deepseek_harness('parallel-test')
