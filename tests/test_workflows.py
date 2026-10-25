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
    assert result['status']=='failed' and 'provider unavailable' in result['nodes']['bad']['error']
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


def native_tools(monkeypatch):
    import app.workflows as module
    from app.portfolio_skills import module as entry
    tools=[dict(id=name,label=name,description='真实结构化工具',script=name,schema=entry(name).agent_schema() if hasattr(entry(name),'agent_schema') else entry(name).Input.model_json_schema(),instructions='按 schema 执行') for name in ('portfolio-data','portfolio-backtest')]
    monkeypatch.setattr(module,'tool_catalog',lambda agent:tools)
    return tools

def test_builder_receives_real_schema_and_output_contracts(env,monkeypatch):
    tools=native_tools(monkeypatch);seen={}
    def build(context):
        seen.update(context);return dict(title='研究流程',graph=graph())
    env.service.builder=build
    env.service.build(BuildInput(message='读取自选股'))
    assert seen['tools'][0]['schema']==tools[0]['schema']
    assert seen['tools'][0]['instructions']
    assert '数组' in seen['nodeOutputs']['watchlist']

def test_builder_repairs_watchlist_reference_with_validation_feedback(env,monkeypatch):
    native_tools(monkeypatch)
    bad=graph([dict(id='watch',kind='watchlist',title='读取自选股票'),dict(id='data',kind='tool',title='获取真实行情数据',tool='portfolio-data',arguments={'operation':'history','symbol':'{{watch.symbols}}'})],[dict(source='watch',target='data')])
    original=json.loads(json.dumps(bad));contexts=[]
    def build(context):
        contexts.append(context)
        if len(contexts)==1:return dict(title='修复流程',graph=bad)
        assert '自选股票输出是列表' in context['validationFeedback']
        assert context['previousCandidate']['graph']==bad
        repaired=json.loads(json.dumps(bad))
        repaired['nodes'][1].update(foreach='{{watch}}',arguments={'operation':'history','symbol':'{{item.symbol}}'})
        return dict(title='修复流程',graph=repaired)
    env.service.builder=build
    result=env.service.build(BuildInput(message='修复当前流程，不执行',graph=bad))
    assert len(contexts)==2
    assert result['graph']['nodes'][1]['foreach']=='{{watch}}'
    assert result['graph']['nodes'][1]['arguments']['symbol']=='{{item.symbol}}'
    assert bad==original and not env.calls

def test_builder_stops_after_three_invalid_candidates_without_execution(env):
    contexts=[]
    def build(context):
        contexts.append(context)
        return dict(graph=graph(edges=[dict(source='missing',target='out')]))
    env.service.builder=build
    response=env.client.post('/api/workflows/build',json={'message':'修复流程'},headers={'X-Veya-Day':'1'})
    assert response.status_code==422
    assert len(contexts)==3 and 'validationFeedback' in contexts[1]
    assert not env.calls
    with env.tasks.db() as db:
        assert db.execute('SELECT count(*) FROM workflow_trials').fetchone()[0]==0
        assert db.execute('SELECT count(*) FROM tasks').fetchone()[0]==0

def test_valid_builder_candidate_is_not_regenerated(env):
    contexts=[]
    def build(context):
        contexts.append(context);return dict(graph=graph())
    env.service.builder=build
    env.service.build(BuildInput(message='创建流程'))
    assert len(contexts)==1 and not env.calls

def test_builder_invalid_json_is_fed_back_before_retry(env):
    contexts=[]
    def build(context):
        contexts.append(context)
        if len(contexts)==1:return json.loads('not-json')
        return dict(graph=graph())
    env.service.builder=build
    env.service.build(BuildInput(message='创建流程'))
    assert len(contexts)==2 and contexts[1]['validationFeedback']

def test_builder_feedback_includes_all_invalid_nodes(env,monkeypatch):
    native_tools(monkeypatch);contexts=[]
    bad=graph([dict(id='watch',kind='watchlist',title='自选'),dict(id='data',kind='tool',title='行情',tool='portfolio-data',arguments={'operation':'history','symbol':'{{watch.symbols}}'}),dict(id='backtest',kind='tool',title='回测',tool='portfolio-backtest',arguments={'symbols':'{{watch.symbols}}','strategy':'sma_cross'})],[dict(source='watch',target='data'),dict(source='watch',target='backtest')])
    def build(context):
        contexts.append(context)
        if len(contexts)==1:return dict(graph=bad)
        assert '节点「行情」' in context['validationFeedback']
        assert '节点「回测」' in context['validationFeedback']
        return dict(graph=graph())
    env.service.builder=build
    env.service.build(BuildInput(message='修复流程',graph=bad))
    assert len(contexts)==2 and not env.calls

def test_bad_action_symbols_and_missing_operation_are_rejected_before_calls(env,monkeypatch):
    native_tools(monkeypatch)
    bad=graph([dict(id='data',kind='tool',title='拉取历史行情',tool='portfolio-data',arguments={'action':'ohlcv','symbols':None})],[])
    r=env.client.post('/api/workflows/runs',json={'graph':bad},headers={'X-Veya-Day':'1'})
    assert r.status_code==422 and 'operation' in r.json()['detail'] and 'action' in r.json()['detail']
    assert 'pydantic.dev' not in r.text and not env.calls

def test_watchlist_missing_property_and_unconnected_reference_are_rejected(env,monkeypatch):
    native_tools(monkeypatch)
    g=graph([dict(id='watch',kind='watchlist',title='自选'),dict(id='data',kind='tool',title='行情',tool='portfolio-data',arguments={'operation':'history','symbol':'{{watch.symbols}}'})],[dict(source='watch',target='data')])
    with pytest.raises(ValueError,match='输出是列表'):env.service.validate(g,'mentora')
    g['nodes'][1]['arguments']['symbol']='{{watch.0.symbol}}';g['edges']=[]
    with pytest.raises(ValueError,match='上游连线'):env.service.validate(g,'mentora')

def test_missing_reference_raises_instead_of_becoming_none(env):
    with pytest.raises(ValueError,match='没有有效输出'):
        env.service.resolve('{{watch.symbols}}',{'watch':[{'symbol':'600519.SH'}]})
    with pytest.raises(ValueError,match='没有有效输出'):
        env.service.resolve('代码 {{input.symbol}}',{'input':{}})

def test_foreach_calls_history_then_backtest_for_each_real_upstream_symbol(env,monkeypatch):
    native_tools(monkeypatch)
    from app.portfolio_skills import module as entry
    calls=[]
    def call(service,owner,name,arguments):
        entry(name).Input.model_validate(arguments)
        calls.append((owner,name,arguments))
        return {'symbol':arguments['symbol'],'rows':[[1,2,3,4,5]],'source':'test'} if name=='portfolio-data' else {'symbol':arguments['symbol'],'totalReturn':.12,'trades':2}
    monkeypatch.setattr('app.portfolio_skills.call',call)
    env.service.portfolio.workflow.favorites=lambda owner:[{'symbol':'600519.SH'},{'symbol':'AAPL'}]
    g=graph([dict(id='watch',kind='watchlist',title='自选'),dict(id='data',kind='tool',title='历史行情',tool='portfolio-data',foreach='{{watch}}',arguments={'operation':'history','symbol':'{{item.symbol}}'}),dict(id='backtest',kind='tool',title='回测',tool='portfolio-backtest',foreach='{{data.items}}',arguments={'symbol':'{{item.symbol}}','strategy':'ma_cross'})],[dict(source='watch',target='data'),dict(source='data',target='backtest')])
    states={}
    result=env.service.execute({'workflow':g,'agent':'mentora-deal','question':'回测','_owner':'owner'},'batch',lambda i,s:states.update({i:s}))
    assert result['workflowNodes']['backtest']=='success'
    assert [(name,a['symbol']) for _,name,a in calls]==[('portfolio-data','600519.SH'),('portfolio-data','AAPL'),('portfolio-backtest','600519.SH'),('portfolio-backtest','AAPL')]
    assert all(owner=='owner' for owner,_,_ in calls)
    assert states['backtest']['output']['count']==2
    assert states['backtest']['output']['items'][0]['totalReturn']==.12

def test_failed_batch_retains_successful_results_and_stops_downstream(env,monkeypatch):
    native_tools(monkeypatch);calls=[]
    def call(service,owner,name,args):
        calls.append(args['symbol'])
        if args['symbol']=='FAIL':raise ValueError('数据不可用')
        return {'symbol':args['symbol'],'rows':[1]}
    monkeypatch.setattr('app.portfolio_skills.call',call)
    env.service.portfolio.workflow.favorites=lambda owner:[{'symbol':'AAPL'},{'symbol':'FAIL'},{'symbol':'MSFT'}]
    g=graph([dict(id='watch',kind='watchlist',title='自选'),dict(id='data',kind='tool',title='行情',tool='portfolio-data',foreach='{{watch}}',arguments={'operation':'history','symbol':'{{item.symbol}}'}),dict(id='next',kind='model',title='总结')],[dict(source='watch',target='data'),dict(source='data',target='next')])
    states={}
    with pytest.raises(RuntimeError,match='数据不可用'):
        env.service.execute({'workflow':g,'agent':'mentora-deal','question':'研究','_owner':'owner'},'batch',lambda i,s:states.update({i:s}))
    assert calls==['AAPL','FAIL'] and states['data']['status']=='failed'
    assert states['data']['output']['items']==[{'symbol':'AAPL','rows':[1]}]
    assert 'next' not in states and not env.calls

def test_empty_foreach_makes_no_tool_call(env,monkeypatch):
    native_tools(monkeypatch)
    monkeypatch.setattr('app.portfolio_skills.call',lambda *_:pytest.fail('empty list must not call tool'))
    env.service.portfolio.workflow.favorites=lambda owner:[]
    g=graph([dict(id='watch',kind='watchlist',title='自选'),dict(id='data',kind='tool',title='行情',tool='portfolio-data',foreach='{{watch}}',arguments={'operation':'history','symbol':'{{item.symbol}}'})],[dict(source='watch',target='data')])
    states={}
    env.service.execute({'workflow':g,'agent':'mentora-deal','question':'研究','_owner':'owner'},'batch',lambda i,s:states.update({i:s}))
    assert states['data']['output']=={'items':[],'count':0}

def test_legacy_trading_graph_migrates_without_mutating_input():
    source=graph([dict(id='trade',kind='tool',title='执行模拟交易',tool='portfolio-order'),
                  dict(id='out',kind='output',title='输出回测决策与交易报告')],[dict(source='trade',target='out')])
    result=WorkflowGraph.model_validate(source)
    assert result.nodes[0].title=='执行交易'
    assert result.nodes[1].kind=='watchlist_update' and result.nodes[1].title=='更新观察列表'
    assert source['nodes'][1]['kind']=='output'

def observation_graph():
    return graph([dict(id='test',kind='tool',title='回测',tool='portfolio-backtest',arguments={'symbol':'AAPL','strategy':'trend'}),
                  dict(id='update',kind='watchlist_update',title='更新观察列表')],[dict(source='test',target='update')])

def test_observation_node_persists_actual_results_per_owner_and_survives_reload(env,monkeypatch,tmp_path):
    native_tools(monkeypatch)
    from app.portfolio import Portfolio
    from test_portfolio import Feed
    portfolio=Portfolio(tmp_path/'portfolio',market=Feed())
    env.service.portfolio=portfolio
    result=dict(symbol='AAPL',status='computed',strategy='trend',totalReturn=12.3,maxDrawdown=-4,trades=3,winRate=66.7)
    monkeypatch.setattr('app.portfolio_skills.call',lambda *_:result)
    config=dict(workflow=observation_graph(),agent='mentora-deal',question='回测',title='我的研究',_owner='owner-a')
    states={}
    env.service.execute(config,'real-run',lambda i,s:states.update({i:s}))
    assert states['update']['output']['updatedCount']==1
    reloaded=Portfolio(tmp_path/'portfolio',market=Feed())
    with reloaded.db() as db:
        row=db.execute('SELECT payload FROM portfolio_candidates WHERE owner=? AND symbol=?',('owner-a','AAPL')).fetchone()
        assert db.execute('SELECT count(*) FROM portfolio_candidates WHERE owner=?',('owner-b',)).fetchone()[0]==0
    saved=json.loads(row['payload'])
    assert saved['backtests']==[result] and saved['workflowExecution']['runId']=='real-run'
    assert saved['workflowExecution']['title']=='我的研究'
    rows=reloaded.workflow.watchlist([saved],[])
    assert rows[0]['backtests'][0]['totalReturn']==12.3

def test_observation_trial_previews_without_writing(env,monkeypatch):
    native_tools(monkeypatch)
    writes=[]
    env.service.portfolio.workflow.merge=lambda *args:writes.append(args)
    monkeypatch.setattr('app.portfolio_skills.call',lambda *_:dict(symbol='AAPL',status='computed',strategy='trend',totalReturn=2))
    states={}
    env.service.execute(dict(workflow=observation_graph(),agent='mentora-deal',question='回测',_owner='owner-a'),'preview',lambda i,s:states.update({i:s}),trial=True)
    assert not writes and states['update']['output']['preview']
    assert states['update']['output']['updatedCount']==0
    assert states['update']['output']['symbols']==['AAPL']

def test_observation_uses_only_connected_tool_receipts_not_model_claims(env,monkeypatch):
    native_tools(monkeypatch)
    writes=[]
    env.service.portfolio.workflow.merge=lambda *args:writes.append(args)
    def runner(config,rid):
        config['_emit_event']('tool_step',dict(phase='completed',skillId='portfolio-jev',input={'operation':'decide'},output=[dict(symbol='AAPL',action='watch',confidence=.6)]))
        return dict(interpretation='声称 MSFT 已买入',workflowToolResults=[dict(tool='portfolio-order',output={'symbol':'MSFT'})])
    env.service.runner=runner
    g=graph([dict(id='analysis',kind='model',title='分析'),dict(id='update',kind='watchlist_update',title='更新观察列表')],[dict(source='analysis',target='update')])
    env.service.execute(dict(workflow=g,question='研究',_owner='actual-owner'),'receipts',lambda *_:None)
    assert len(writes)==1 and writes[0][0:2]==('actual-owner','AAPL')
    saved=writes[0][2]['workflowExecution']
    assert saved['decision']['action']=='watch' and 'trade' not in saved

def test_observation_rejects_unconnected_results_and_does_not_save_narrative(env):
    from app.workflow_observations import update_observations
    g=WorkflowGraph.model_validate(graph([dict(id='other',kind='model',title='无关'),dict(id='update',kind='watchlist_update',title='更新观察列表')],[]))
    with pytest.raises(ValueError,match='没有可更新'):
        update_observations(env.service.portfolio,'owner',g,'update',{'other':[dict(tool='portfolio-jev',input={},output=[dict(symbol='AAPL',action='buy')])]},'run','标题')

def test_observation_jev_replaces_stale_failure_in_watchlist_without_creating_executable_decision(env,tmp_path):
    from app.portfolio import Portfolio
    from test_portfolio import Feed
    from app.workflow_observations import update_observations
    portfolio=Portfolio(tmp_path/'projection',market=Feed())
    g=WorkflowGraph.model_validate(graph([dict(id='decision',kind='model',title='决策'),dict(id='update',kind='watchlist_update',title='更新观察列表')],[dict(source='decision',target='update')]))
    decision=dict(symbol='AAPL',action='watch',modelAction='watch',status='decided',confidence=.62,actionConfidences={'watch':.62},factorLabel='需要价格确认')
    update_observations(portfolio,'owner',g,'update',{'decision':[dict(tool='portfolio-jev',input={'operation':'decide'},output=[decision])]},'jev-run','最新研究')
    with portfolio.db() as db:
        saved=json.loads(db.execute('SELECT payload FROM portfolio_candidates WHERE owner=?',('owner',)).fetchone()['payload'])
        # Observation evidence must not mint a decision ID that authorizes an order.
        assert db.execute('SELECT count(*) FROM portfolio_decisions WHERE owner=?',('owner',)).fetchone()[0]==0
    old=dict(symbol='AAPL',kind='entry',status='unavailable',reason='历史行情不足',created='2020-01-01')
    rows=portfolio.workflow.watchlist([saved],[old])
    assert len(rows)==1
    assert rows[0]['observationAction']=='watch' and rows[0]['confidence']==.62
    assert rows[0]['directionAssessment']['researchOnly']
    assert '最新研究' in rows[0]['reason']
    assert rows[0]['executionStatus']!='filled'

def test_observation_preserves_plan_vs_executed_trade_and_newer_risk_decision(env,tmp_path):
    from app.portfolio import Portfolio
    from test_portfolio import Feed
    from app.workflow_observations import update_observations
    portfolio=Portfolio(tmp_path/'trade-evidence',market=Feed())
    g=WorkflowGraph.model_validate(graph([dict(id='trade',kind='model',title='执行交易'),dict(id='update',kind='watchlist_update',title='更新观察列表')],[dict(source='trade',target='update')]))
    plan=dict(symbol='AAPL',id='plan',status='planned')
    result=update_observations(portfolio,'owner',g,'update',{'trade':[dict(tool='portfolio-order',input={'operation':'plan'},output=plan)]},'run','计划')
    assert result['observations']['AAPL']['plan']==plan
    assert 'trade' not in result['observations']['AAPL']
    trade=dict(symbol='AAPL',id='fill',side='buy',quantity=2,price=200)
    result=update_observations(portfolio,'owner',g,'update',{'trade':[dict(tool='portfolio-order',input={'operation':'execute'},output=trade)]},'run-2','执行交易')
    assert result['observations']['AAPL']['trade']==trade
    pool=[dict(symbol='AAPL',workflowExecution=dict(updated='2020-01-01',title='旧流程',decision=dict(action='buy',confidence=.9)))]
    risk=dict(symbol='AAPL',kind='risk',action='sell',created='2030-01-01',confidence=.8,confidenceKind='direction-option-probability',actionConfidences={'sell':.8})
    row=portfolio.workflow.watchlist(pool,[risk],positions=[dict(symbol='AAPL',quantity=2)])[0]
    assert row['observationAction']=='sell' and row['directionAssessment']['confidence']==.8
