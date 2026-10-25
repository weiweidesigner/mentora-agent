import json
from types import SimpleNamespace
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.day_tasks import DayTasks,TaskInput,create_router as task_router
from app.workflow_graph import WorkflowGraph
from app.workflows import WorkflowService,create_router,TrialInput,BuildInput

def graph(nodes=None,edges=None):
    return dict(version=1,nodes=nodes or [dict(id='input',kind='start',title='输入',arguments={'score':3}),dict(id='out',kind='output',title='输出')],edges=edges if edges is not None else [dict(source='input',target='out',when='always')])

class Immediate:
    def submit(self,fn,*args):fn(*args)

@pytest.fixture
def env(tmp_path,monkeypatch):
    import app.workflows as module
    tools=[dict(id='search',label='搜索',description='真实搜索',script='search.py',schema=None)]
    monkeypatch.setattr(module,'tool_catalog',lambda agent:tools)
    calls=[]
    def runner(config,rid):
        calls.append((config,rid))
        config.get('_emit_event',lambda *_:None)('tool_step',{'script':'search.py','status':'success'})
        return dict(interpretation='已执行真实测试节点',reportArtifacts=[])
    tasks=DayTasks(tmp_path,runner)
    profile=SimpleNamespace(workflow=SimpleNamespace(favorites=lambda owner:[{'symbol':owner[:8]}],preferences=lambda owner:{'profile':'owner:'+owner[:8]}))
    service=WorkflowService(tasks,profile,runner,builder=lambda c:dict(title='AI 流程',graph=graph()))
    service.pool.shutdown();service.pool=Immediate()
    app=FastAPI();app.include_router(task_router(tasks));app.include_router(create_router(service))
    return SimpleNamespace(tasks=tasks,service=service,client=TestClient(app),app=app,calls=calls)

@pytest.mark.parametrize('bad',[
    graph([dict(id='a',kind='output',title='A'),dict(id='a',kind='start',title='B')],[]),
    graph(edges=[dict(source='input',target='missing')]),
    graph(edges=[dict(source='input',target='out'),dict(source='out',target='input')]),
    graph(edges=[dict(source='input',target='out',when='true')]),
])
def test_graph_rejects_ambiguous_or_cyclic_wiring(bad):
    with pytest.raises(ValueError):WorkflowGraph.model_validate(bad)

def test_trial_is_owner_scoped_and_does_not_create_a_scheduled_task(env):
    client=env.client;headers={'X-Veya-Day':'1'}
    assert client.post('/api/workflows/runs',json={'graph':graph()}).status_code==403
    run=client.post('/api/workflows/runs',json={'graph':graph()},headers=headers)
    assert run.status_code==200,run.text
    rid=run.json()['id'];result=client.get('/api/workflows/runs/'+rid).json()
    assert result['status']=='success' and result['nodes']['input']['output']['score']==3
    assert result['nodes']['out']['status']=='success'
    assert TestClient(env.app).get('/api/workflows/runs/'+rid).status_code==404
    with env.tasks.db() as db:
        assert db.execute('SELECT count(*) FROM tasks').fetchone()[0]==0
        assert db.execute('SELECT count(*) FROM deliveries').fetchone()[0]==0

def test_live_profile_and_watchlist_use_authenticated_owner(env):
    g=graph([dict(id='watch',kind='watchlist',title='自选'),dict(id='profile',kind='profile',title='档案'),dict(id='model',kind='model',title='分析',instruction='结合输入分析')],[dict(source='watch',target='model'),dict(source='profile',target='model')])
    c=env.client;r=c.post('/api/workflows/runs',json={'graph':g},headers={'X-Veya-Day':'1'}).json()
    result=c.get('/api/workflows/runs/'+r['id']).json()
    assert result['status']=='success'
    config,_=env.calls[0]
    assert config['_owner'][:8] in config['question']
    assert config['reasoningEffort']=='low'
    assert result['nodes']['watch']['output']==[{'symbol':config['_owner'][:8]}]

def test_conditional_edges_skip_inactive_branch(env):
    g=graph([dict(id='input',kind='start',title='输入',arguments={'score':3}),dict(id='gate',kind='condition',title='判断',path='input.score',operator='greater',expected='5'),dict(id='model',kind='model',title='分析'),dict(id='out',kind='output',title='输出')],[dict(source='input',target='gate'),dict(source='gate',target='model',when='true'),dict(source='gate',target='out',when='false')])
    states={};result=env.service.execute({'workflow':g,'agent':'mentora','question':'test','_owner':'a'},'run',lambda i,s:states.update({i:s}))
    assert result['workflowNodes']['model']=='skipped'
    assert result['workflowNodes']['out']=='success'
    assert not env.calls

def test_tool_node_requires_actual_execution_receipt(env):
    g=graph([dict(id='tool',kind='tool',title='搜索',tool='search',instruction='搜索市场消息')],[])
    assert env.service.execute({'workflow':g,'agent':'mentora','question':'test','_owner':'a'},'run',lambda *_:None)['workflowNodes']['tool']=='success'
    env.service.runner=lambda *_:{'interpretation':'没有工具回执'}
    with pytest.raises(RuntimeError,match='真实工具调用回执'):
        env.service.execute({'workflow':g,'agent':'mentora','question':'test','_owner':'a'},'run',lambda *_:None)
    g['nodes'][0]['tool']='unavailable'
    with pytest.raises(ValueError):env.service.validate(g,'mentora')

def test_failure_stops_downstream_and_exposes_node_error(env):
    g=graph([dict(id='bad',kind='model',title='失败'),dict(id='next',kind='model',title='后续')],[dict(source='bad',target='next')])
    def fail(*_):raise RuntimeError('provider unavailable')
    env.service.runner=fail
    r=env.client.post('/api/workflows/runs',json={'graph':g},headers={'X-Veya-Day':'1'}).json()
    result=env.client.get('/api/workflows/runs/'+r['id']).json()
    assert result['status']=='failed' and result['nodes']['bad']['error']=='provider unavailable'
    assert 'next' not in result['nodes']

def test_saved_graph_reloads_and_scheduled_run_executes_its_snapshot(env):
    c=env.client;headers={'X-Veya-Day':'1'}
    payload=dict(title='我的流程',question='按图执行',taskMode='workflow',workflow=graph(),cadence='daily',time='14:30',timezone='Asia/Shanghai',enabled=False,newChat=False)
    response=c.post('/api/day/tasks',json=payload,headers=headers);assert response.status_code==200,response.text
    task=response.json()
    reloaded=c.get('/api/day/tasks').json()['tasks'][0]
    assert reloaded['workflow']==WorkflowGraph.model_validate(graph()).model_dump()
    assert reloaded['taskMode']=='workflow' and reloaded['time']=='14:30' and reloaded['newChat'] is False
    with env.tasks.db() as db:
        row=env.tasks.owned(db,__import__('hashlib').sha256(c.cookies.get('veya_day_owner').encode()).hexdigest(),task['id'])
        rid=env.tasks.enqueue(db,row)
    payload['workflow']['nodes'][0]['arguments']['score']=99
    assert c.put('/api/day/tasks/'+task['id'],json=payload,headers=headers).status_code==200
    run=env.tasks.claim();env.tasks.execute(run)
    with env.tasks.db() as db:row=db.execute('SELECT answer,status FROM runs WHERE id=?',(rid,)).fetchone()
    assert row['status']=='success' and '3' in json.loads(row['answer'])['interpretation']
    assert '99' not in json.loads(row['answer'])['interpretation']
    latest=c.get('/api/workflows/tasks/'+task['id']+'/latest')
    assert latest.status_code==200
    assert latest.json()['nodes']['input']['output']['score']==3
    assert TestClient(env.app).get('/api/workflows/tasks/'+task['id']+'/latest').status_code==404

def test_builder_validates_model_graph_without_executing_it(env):
    result=env.client.post('/api/workflows/build',json={'message':'构建输入和输出'},headers={'X-Veya-Day':'1'})
    assert result.status_code==200 and result.json()['graph']['nodes']
    assert not env.calls
    env.service.builder=lambda c:dict(graph=graph(edges=[dict(source='bad',target='out')]))
    assert env.client.post('/api/workflows/build',json={'message':'构建错误图'},headers={'X-Veya-Day':'1'}).status_code==422

def test_reference_resolution_is_data_only(env):
    assert env.service.resolve({'value':'{{input.items}}','message':'结果 {{input.score}}'},{'input':{'items':[1,2],'score':3}})=={'value':[1,2],'message':'结果 3'}
    with pytest.raises(ValueError):TaskInput(title='空流程',question='执行',taskMode='workflow')
    assert env.service.scheduled({},dict(taskMode='agent')) is None


def test_catalog_exposes_skill_categories_instead_of_individual_components():
    from app.workflows import tool_catalog,execution_tools
    tools=tool_catalog('mentora')
    ids={t['id'] for t in tools}
    assert {'generic-chart','business-chart-recall','market-data','external-search','portfolio-backtest','portfolio-jev'}<=ids
    assert not ids & {'bar_chart','line_chart','pie','income_statement'}
    assert all(t.get('icon') and t.get('group') for t in tools)
    assert ids=={t['id'] for t in tool_catalog('mentora-deal')}
    assert 'bar_chart' in {t['id'] for t in execution_tools('mentora')}

def test_grouped_skill_node_executes_with_arguments_and_real_receipt(env,monkeypatch):
    import app.workflows as module
    monkeypatch.setattr(module,'tool_catalog',lambda agent:[dict(id='generic-chart',label='通用图表',description='根据数据选择通用图表',script='app/skills/generic-chart/',schema=None)])
    def runner(config,rid):
        assert '"title": "测试图表"' in config['question']
        config['_emit_event']('tool_step',{'command':'python app/skills/generic-chart/scripts/bar_chart.py --payload input.json','status':'success'})
        return {'interpretation':'图表已生成','reportArtifacts':[]}
    env.service.runner=runner
    g=graph([dict(id='chart',kind='tool',title='通用图表',tool='generic-chart',arguments={'title':'测试图表'})],[])
    result=env.service.execute({'workflow':g,'agent':'mentora','_owner':'test','question':'构建图表'},'grouped',lambda *_:None)
    assert result['workflowNodes']['chart']=='success'
