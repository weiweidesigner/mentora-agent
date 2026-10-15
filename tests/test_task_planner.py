import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.day_tasks import DayTasks, create_router
from app.task_planner import PlanningInput, plan_task


def test_model_receives_panel_schema_and_no_delivery_secrets(monkeypatch):
    seen={}
    def model(context):
        seen.update(context)
        return {'reply':'想在几点收到？','draft':{'title':'每日观察','question':'复盘市场'},'questions':[{'field':'time','question':'想在几点收到？'}],'ready':False}
    monkeypatch.setattr('app.task_planner.model_plan',model)
    result=plan_task(PlanningInput(message='帮我创建每日市场复盘',draft={'feishuUrl':'SECRET','serverchanKey':'SECRET','time':'09:00'}))
    assert result['questions'][0]['field']=='time'
    assert 'SECRET' not in str(seen)
    assert 'feishuUrl' not in seen['taskSchema']
    assert set(seen['clarifiableFields'])=={'title','question','cadence','time','timezone','date','endDate','weekdays','monthDay'}


def test_fully_specified_model_plan_has_no_forced_questions_and_validates_task(monkeypatch):
    monkeypatch.setattr('app.task_planner.model_plan',lambda context:{'reply':'参数已确认','draft':{'title':'周日复盘','question':'复盘美股指数','market':'US','cadence':'weekly','weekdays':[6],'time':'09:00','timezone':'Asia/Shanghai','feishu':True,'feishuUrl':'SECRET'},'questions':[],'ready':True})
    result=plan_task(PlanningInput(message='每周日北京时间9点复盘美股指数'))
    assert result['ready'] and not result['questions']
    assert result['draft']['weekdays']==[6]
    assert 'feishu' not in result['draft'] and 'feishuUrl' not in result['draft']


@pytest.mark.parametrize('question',[{'field':'model','question':'选择模型？'},{'field':'cadence','question':'多久运行？','options':[{'label':'每小时','value':'hourly'}]},{'field':'weekdays','question':'星期？','options':[{'label':'周八','value':7}]}])
def test_model_cannot_invent_unsupported_panel_parameters(monkeypatch,question):
    monkeypatch.setattr('app.task_planner.model_plan',lambda context:{'draft':{},'questions':[question],'ready':False})
    with pytest.raises(ValueError):plan_task(PlanningInput(message='创建任务'))


def test_ready_model_plan_cannot_bypass_task_validation(monkeypatch):
    monkeypatch.setattr('app.task_planner.model_plan',lambda context:{'draft':{'title':'任务','question':'复盘市场','time':'25:99'},'questions':[],'ready':True})
    with pytest.raises(ValueError):plan_task(PlanningInput(message='创建任务'))


def test_plan_endpoint_never_creates_or_runs_tasks(tmp_path,monkeypatch):
    service=DayTasks(tmp_path,lambda *_:pytest.fail('planning must not execute research'))
    app=FastAPI();app.include_router(create_router(service));client=TestClient(app)
    monkeypatch.setattr('app.task_planner.model_plan',lambda context:{'reply':'需要确认时间','draft':{'title':'任务','question':'市场复盘'},'questions':[{'field':'time','question':'几点收到？'}],'ready':False})
    assert client.post('/api/day/plan',json={'message':'创建任务'}).status_code==403
    r=client.post('/api/day/plan',json={'message':'创建任务'},headers={'X-Veya-Day':'1'})
    assert r.status_code==200 and not r.json()['ready']
    with service.db() as db:
        assert db.execute('SELECT count(*) FROM tasks').fetchone()[0]==0
        assert db.execute('SELECT count(*) FROM runs').fetchone()[0]==0


def test_confirmation_uses_saved_config_is_cached_and_is_owner_scoped(tmp_path,monkeypatch):
    service=DayTasks(tmp_path,lambda *_:{})
    app=FastAPI();app.include_router(create_router(service));client=TestClient(app)
    headers={'X-Veya-Day':'1'}
    task=client.post('/api/day/tasks',json={'title':'日常观察','question':'复盘市场','time':'09:00','enabled':False,'serverchanKey':'SCTsecret'},headers=headers).json()
    calls=[]
    def model(context):
        calls.append(context)
        return {'answer':'已安排每天九点的市场回顾。'}
    monkeypatch.setattr('app.task_planner.model_plan',model)
    path=f"/api/day/tasks/{task['id']}/confirmation"
    assert client.post(path,headers=headers).json()['answer']=='已安排每天九点的市场回顾。'
    assert client.post(path,headers=headers).status_code==200
    assert len(calls)==1 and 'SCTsecret' not in str(calls)
    assert calls[0]['task']['enabled'] is False
    stranger=TestClient(app)
    assert stranger.post(path,headers=headers).status_code==404
    client.put(f"/api/day/tasks/{task['id']}",json={**task,'title':'更新的回顾'},headers=headers)
    assert client.post(path,headers=headers).status_code==200 and len(calls)==2


def test_failed_confirmation_does_not_recreate_or_enable_a_saved_task(tmp_path,monkeypatch):
    service=DayTasks(tmp_path,lambda *_:{})
    app=FastAPI();app.include_router(create_router(service));client=TestClient(app);headers={'X-Veya-Day':'1'}
    task=client.post('/api/day/tasks',json={'title':'回顾','question':'复盘市场','enabled':False},headers=headers).json()
    def fail(_):raise RuntimeError('unavailable')
    monkeypatch.setattr('app.task_planner.model_plan',fail)
    assert client.post(f"/api/day/tasks/{task['id']}/confirmation",headers=headers).status_code==502
    tasks=client.get('/api/day/tasks').json()['tasks']
    assert len(tasks)==1 and tasks[0]['enabled'] is False
