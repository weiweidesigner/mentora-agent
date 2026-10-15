import json
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.day_tasks import DayTasks, create_router
from app.day_presets import SCENE_OWNER


def scheduled(tmp_path, runner):
    service=DayTasks(tmp_path,runner)
    service.seed_scene_presets()
    task=service.scene_tasks()[0]
    with service.db() as db:
        run_id=service.enqueue(db,service.owned(db,SCENE_OWNER,task['id']))
    run=service.claim()
    app=FastAPI();app.include_router(create_router(service))
    return service,task,run,run_id,TestClient(app)


def test_run_events_are_persisted_once_and_replayed_without_research(tmp_path):
    calls=[]
    def runner(config,run_id):
        calls.append(run_id)
        config['_emit_event']('tool_step',{'title':'核验公开数据','detail':'正在比较成交量','secret':'private-value'})
        config['_emit_event']('answer_text',{'text':'正在生成的真实结果'})
        # The same preview used by the home cards is available before completion.
        assert service.scene_tasks()[0]['livePreview']=='正在生成的真实结果'
        result={'interpretation':'完整研究结果','reportArtifacts':[]}
        config['_emit_event']('final',result)
        return result
    service,task,run,run_id,client=scheduled(tmp_path,runner)
    service.execute(run)
    url=f"/api/day/tasks/{task['id']}/runs/{run_id}/events"
    response=client.get(url)
    assert response.status_code==200 and response.headers['content-type'].startswith('text/event-stream')
    chunks=[chunk for chunk in response.text.split('\n\n') if chunk]
    events=[json.loads(next(line[6:] for line in chunk.splitlines() if line.startswith('data: '))) for chunk in chunks]
    assert len(events)==5 and events[-1]['status']=='success'
    assert response.text.count('event: final\n')==1
    assert 'private-value' not in response.text and '[redacted]' in response.text
    assert client.get(url+'?after='+str(events[1]['_taskEventId'])).text.count('event: tool_step')==0
    assert calls==[run_id]
    # A readable preset never grants access to another task's run.
    other=service.scene_tasks()[1]
    assert client.get(f"/api/day/tasks/{other['id']}/runs/{run_id}/events").status_code==404


def test_failed_stream_is_terminal_and_has_no_fabricated_final(tmp_path):
    def fail(config,run_id):
        config['_emit_event']('tool_step',{'detail':'查询数据源'})
        raise RuntimeError('provider error')
    service,task,run,run_id,client=scheduled(tmp_path,fail)
    service.execute(run)
    text=client.get(f"/api/day/tasks/{task['id']}/runs/{run_id}/events").text
    assert 'event: error\n' in text and '"status": "failed"' in text and 'event: final\n' not in text
    assert 'provider error' not in text


def test_daily_research_uses_existing_framework_stream(monkeypatch):
    from app import presentation
    seen=[];calls=[]
    def framework(payload):
        calls.append(payload)
        yield 'tool_step',{'title':'查询技能'}
        yield 'answer_text',{'text':'正在输出'}
        yield 'final',{'question':'原始上下文','code':'','selectedSkill':{},'htmlUrl':'','reportUrl':'','interpretation':'已核验的结果','status':[]}
    monkeypatch.setattr(presentation,'framework_events',framework)
    cfg={'market':'CN','stage':'pre','assetType':'index','symbols':'','question':'分析{{market}}','_emit_event':lambda event,data:seen.append((event,data))}
    answer=presentation.run_daily_research(cfg,'unit-run')
    assert len(calls)==1 and [e for e,_ in seen]==['tool_step','answer_text','final']
    assert answer['question']=='分析A股' and answer['interpretation']=='已核验的结果'
    assert calls[0].sessionId=='day-unit-run'


def test_private_run_stream_requires_its_browser_owner(tmp_path):
    from app.day_tasks import TaskInput
    service=DayTasks(tmp_path,lambda *_:{'interpretation':'private result'})
    task=service.save('private-owner',TaskInput(title='私有任务',question='私有研究内容'))
    with service.db() as db:run_id=service.enqueue(db,service.owned(db,'private-owner',task['id']))
    service.execute(service.claim())
    app=FastAPI();app.include_router(create_router(service))
    visitor=TestClient(app)
    response=visitor.get(f"/api/day/tasks/{task['id']}/runs/{run_id}/events")
    assert response.status_code==404 and 'private result' not in response.text
