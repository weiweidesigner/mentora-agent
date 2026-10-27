import json
import sys
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


def test_text_opportunity_node_is_discoverable_and_has_a_real_schema():
    from app.workflows import tool_catalog
    for agent in ('mentora','mentora-deal'):
        row=next(t for t in tool_catalog(agent) if t['id']=='text-opportunities')
        assert row['label']=='文本机会提取'
        assert row['schema']['required']==['text']
        assert row['defaultArguments']=={'text':''}


def test_single_node_preview_reuses_owned_upstream_without_executing_ancestors_or_descendants(env):
    client=env.client;headers={'X-Veya-Day':'1'}
    first=client.post('/api/workflows/runs',json={'graph':graph()},headers=headers).json()
    run=client.post('/api/workflows/runs',json={'graph':graph(),'nodeId':'out','sourceRunId':first['id']},headers=headers)
    assert run.status_code==200,run.text
    result=client.get('/api/workflows/runs/'+run.json()['id']).json()
    assert result['status']=='success',result
    assert result['nodes']['input']['reused'] is True
    assert result['nodes']['out'].get('reused') is None
    assert result['nodes']['out']['input']['upstream']['input']['score']==3
    assert '3' in result['result']['interpretation'] and not env.calls
    other=TestClient(env.app)
    assert other.post('/api/workflows/runs',json={'graph':graph(),'nodeId':'out','sourceRunId':first['id']},headers=headers).status_code==422


def test_node_preview_rejects_missing_or_stale_results_and_execute_mode(env):
    client=env.client;headers={'X-Veya-Day':'1'}
    assert client.post('/api/workflows/runs',json={'graph':graph(),'nodeId':'out'},headers=headers).status_code==422
    first=client.post('/api/workflows/runs',json={'graph':graph()},headers=headers).json()
    changed=graph();changed['nodes'][0]['arguments']['score']=8
    rejected=client.post('/api/workflows/runs',json={'graph':changed,'nodeId':'out','sourceRunId':first['id']},headers=headers)
    assert rejected.status_code==422 and '上游配置已变更' in rejected.text
    assert client.post('/api/workflows/runs',json={'graph':graph(),'nodeId':'input','executionMode':'execute'},headers=headers).status_code==422
    assert client.post('/api/workflows/runs',json={'graph':graph(),'nodeId':'missing'},headers=headers).status_code==422
    # A start node can run independently; the output node must not be executed.
    single=client.post('/api/workflows/runs',json={'graph':graph(),'nodeId':'input'},headers=headers).json()
    result=client.get('/api/workflows/runs/'+single['id']).json()
    assert list(result['nodes'])==['input'] and result['status']=='success'
    assert result['nodes']['input']['input']=={'score':3}


def test_single_node_does_not_rerun_other_model_nodes(env):
    headers={'X-Veya-Day':'1'};client=env.client
    g=graph([dict(id='input',kind='start',title='输入'),dict(id='a',kind='model',title='分析 A'),dict(id='b',kind='model',title='分析 B')],[dict(source='input',target='a'),dict(source='a',target='b')])
    first=client.post('/api/workflows/runs',json={'graph':g},headers=headers).json()
    assert len(env.calls)==2
    run=client.post('/api/workflows/runs',json={'graph':g,'nodeId':'a','sourceRunId':first['id']},headers=headers).json()
    result=client.get('/api/workflows/runs/'+run['id']).json()
    assert result['status']=='success' and set(result['nodes'])=={'input','a'}
    assert len(env.calls)==3 and env.calls[-1][1].endswith('-a')
    assert '只查询和分析' in env.calls[-1][0]['question']


def test_single_node_can_reuse_scheduled_run_results(env):
    client=env.client;headers={'X-Veya-Day':'1'}
    task=client.post('/api/day/tasks',json=dict(title='节点测试',question='固定输入',taskMode='workflow',workflow=graph(),enabled=False),headers=headers).json()
    owner=__import__('hashlib').sha256(client.cookies.get('veya_day_owner').encode()).hexdigest()
    with env.tasks.db() as db:
        rid=env.tasks.enqueue(db,env.tasks.owned(db,owner,task['id']))
    env.tasks.execute(env.tasks.claim())
    run=client.post('/api/workflows/runs',json=dict(graph=graph(),taskId=task['id'],nodeId='out',sourceRunId=rid,question='固定输入'),headers=headers)
    assert run.status_code==200,run.text
    result=client.get('/api/workflows/runs/'+run.json()['id']).json()
    assert result['status']=='success' and result['nodes']['input']['reused'] is True

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


def test_text_node_executes_local_adapter_with_references_and_traced_results(env,monkeypatch):
    import app.workflows as workflows
    from app import text_opportunities
    from app import portfolio_laya
    monkeypatch.setattr(workflows,'tool_catalog',lambda agent:[text_opportunities.TOOL])
    monkeypatch.setattr(text_opportunities,'directory',lambda service:[dict(symbol='AAPL',name='Apple Inc.',market='US',aliases=['Apple Inc.'])])
    def predict(state,questions):
        assert state['symbol']=='AAPL' and 'AAPL' in json.dumps(state)
        return dict(model='local-test',answers={'opportunity':dict(choice='opportunity',probabilities={'opportunity':.9,'unsupported':.1})})
    monkeypatch.setattr(portfolio_laya,'http_predict',predict)
    g=graph([dict(id='input',kind='start',title='原文',arguments={'text':'AAPL 仅为离线流程测试材料'}),dict(id='extract',kind='tool',tool='text-opportunities',title='文本机会提取',arguments={'text':'{{input.text}}'}),dict(id='out',kind='output',title='结果')],[dict(source='input',target='extract'),dict(source='extract',target='out')])
    states={};events=[]
    result=env.service.execute({'workflow':g,'agent':'mentora','question':'测试','_owner':'owner','_emit_event':lambda event,data:events.append((event,data))},'test-text',lambda node,state:states.update({node:state}))
    assert states['extract']['output']['symbols']==['AAPL']
    assert result['workflowNodes']['extract']=='success'
    assert env.calls==[]  # No general model, hosted JEV, quotes or order runner.
    assert any(event=='tool_step' and data.get('skillId')=='text-opportunities' and data.get('phase')=='completed' for event,data in events)
    assert states['extract']['output']['executionAuthorized'] is False

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
    assert result['preview'] is True  # Cached clients must not silently start writing.
    assert result['status']=='success' and result['nodes']['input']['output']['score']==3
    assert result['nodes']['out']['status']=='success'
    assert result['createdAt'] and result['finishedAt'] and result['serverTime']
    assert result['nodes']['input']['started']
    assert result['nodes']['input']['durationMs']>=0
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


@pytest.mark.parametrize('candidates',[[],[{'symbol':'FIXTURE'}]])
def test_execution_join_requires_branch_even_when_side_inputs_succeed(env,monkeypatch,candidates):
    import app.workflows as module
    writes=[]
    monkeypatch.setattr(module,'update_observations',lambda *a,**kw:writes.append('fixture') or {'interpretation':'fixture receipt'})
    def runner(config,rid):
        env.calls.append(rid)
        return dict(items=candidates,interpretation='仅离线执行测试')
    env.service.runner=runner
    g=graph([
        dict(id='input',kind='start',title='测试输入',arguments={'items':candidates}),
        dict(id='account',kind='start',title='独立侧输入'),
        dict(id='gate',kind='condition',title='存在候选',path='input.items'),
        dict(id='backtest',kind='model',title='离线分支'),
        dict(id='decision',kind='model',title='离线合流',arguments={'items':'{{backtest.items}}'}),
        dict(id='update',kind='watchlist_update',title='离线写入替身'),
        dict(id='out',kind='output',title='汇总'),
    ],[
        dict(source='input',target='gate'),dict(source='gate',target='backtest',when='true'),
        dict(source='backtest',target='decision'),dict(source='account',target='decision'),
        dict(source='input',target='update'),dict(source='backtest',target='update'),dict(source='decision',target='update'),
        dict(source='update',target='out'),dict(source='gate',target='out',when='false'),
    ])
    states={}
    result=env.service.execute({'workflow':g,'question':'离线测试','_owner':'fixture'},'fixture',lambda n,s:states.update({n:s}))
    assert states['account']['status']=='success' and states['out']['status']=='success'
    for node in ('backtest','decision','update'):
        assert result['workflowNodes'][node]==('success' if candidates else 'skipped')
    assert len(env.calls)==(2 if candidates else 0)
    assert len(writes)==(1 if candidates else 0)
    if not candidates:
        assert 'backtest' in states['decision']['skipReason']
        assert states['out']['output']['inputs']['gate']['actual']==[]


def test_direct_condition_edge_cannot_be_overridden_by_side_input(env):
    g=graph([dict(id='input',kind='start',title='输入',arguments={'items':[]}),dict(id='gate',kind='condition',title='判断',path='input.items'),dict(id='side',kind='start',title='侧输入'),dict(id='join',kind='model',title='分支节点')],
            [dict(source='input',target='gate'),dict(source='gate',target='join',when='true'),dict(source='side',target='join')])
    result=env.service.execute({'workflow':g,'question':'离线测试','_owner':'fixture'},'fixture',lambda *_:None)
    assert result['workflowNodes']['join']=='skipped' and not env.calls


@pytest.mark.parametrize('incomplete',[False,True])
def test_empty_opportunity_result_is_false_only_after_complete_assessment(env,monkeypatch,incomplete):
    from app import text_opportunities
    monkeypatch.setattr('app.workflows.tool_catalog',lambda agent:[text_opportunities.TOOL])
    def extract(*args,**kwargs):
        return dict(items=[],count=0,evaluatedCount=1,mentionedCount=2 if incomplete else 1,
                    status='partial' if incomplete else 'completed',errors=[],
                    deferred=[dict(symbol='MSFT',reason='fixture not evaluated')] if incomplete else [],
                    interpretation='Fixture original evaluation summary')
    monkeypatch.setattr(text_opportunities,'execute',extract)
    g=graph([dict(id='input',kind='start',title='输入'),dict(id='opps',kind='tool',tool='text-opportunities',title='评估',arguments={'text':'fixture'}),dict(id='gate',kind='condition',title='是否有候选',path='opps.items'),dict(id='out',kind='output',title='无候选结果')],
            [dict(source='input',target='opps'),dict(source='opps',target='gate'),dict(source='gate',target='out',when='false')])
    states={};result=env.service.execute({'workflow':g,'question':'offline','_owner':'fixture'},'fixture',lambda n,s:states.update({n:s}))
    assert states['gate']['output']['value'] is (None if incomplete else False)
    assert states['out']['status']==('skipped' if incomplete else 'success')
    if incomplete:
        assert 'fixture not evaluated' in result['interpretation']
        assert '不能据此判定无机会' in result['interpretation']
    else:assert states['out']['output']['interpretation']=='Fixture original evaluation summary'


def test_missing_field_from_executed_branch_still_fails_instead_of_silently_skipping(env):
    g=graph([dict(id='input',kind='start',title='输入'),dict(id='join',kind='condition',title='字段错误',path='input.missing')],[dict(source='input',target='join')])
    # Structured tool/condition resolution remains strict; no fabricated empty result.
    with pytest.raises(RuntimeError,match='没有有效输出'):
        env.service.execute({'workflow':g,'question':'离线测试','_owner':'fixture'},'fixture',lambda *_:None)


def test_deal_news_node_directly_calls_skill_and_passes_raw_json_without_agent(env,monkeypatch,tmp_path):
    import app.workflows as workflows
    import app.workflow_news as news
    from app import text_opportunities
    monkeypatch.setattr(workflows,'ROOT',tmp_path)
    tools=[dict(id='internal-search',label='资讯搜索',description='软件测试',script='app/skills/internal-search/',receiptScripts=['ainvest_news_search.py'],schema=None),text_opportunities.TOOL]
    monkeypatch.setattr(workflows,'tool_catalog',lambda agent:tools)
    monkeypatch.setattr(workflows,'legacy_tool_catalog',lambda agent:[])
    articles=[dict(title='软件测试标题 AAPL',summary='仅离线测试原文，不是投资事实',url='https://example.invalid/fixture')]
    env.service.runner=lambda *_:pytest.fail('direct Skill node must never invoke Agent')
    def fetch(arguments,root,**kwargs):
        assert arguments=={} and root==tmp_path
        return dict(items=articles,count=1,text=json.dumps(articles,ensure_ascii=False),outputSource='verified-skill-json')
    monkeypatch.setattr(news,'execute',fetch)
    def extract(service,owner,payload,**kwargs):
        assert owner=='fixture'
        assert json.loads(payload['text'])==articles
        assert '模型摘要' not in payload['text']
        return dict(items=[],symbols=[],interpretation='已核对软件测试原文',status='completed')
    monkeypatch.setattr(text_opportunities,'execute',extract)
    g=graph([dict(id='news',kind='tool',title='资讯',tool='internal-search'),dict(id='opps',kind='tool',title='提取',tool='text-opportunities',arguments={'text':'{{news}}'})],[dict(source='news',target='opps')])
    states={};config={'workflow':g,'agent':'mentora-deal','question':'测试','_owner':'fixture'}
    result=env.service.execute(config,'offline',lambda node,state:states.update({node:state}))
    assert config['agent']=='mentora-deal' and result['workflowNodes']['opps']=='success'
    assert states['news']['output']['items']==articles

def test_failure_stops_downstream_and_exposes_node_error(env):
    g=graph([dict(id='bad',kind='model',title='失败'),dict(id='next',kind='model',title='后续')],[dict(source='bad',target='next')])
    def fail(*_):raise RuntimeError('provider unavailable')
    env.service.runner=fail
    r=env.client.post('/api/workflows/runs',json={'graph':g},headers={'X-Veya-Day':'1'}).json()
    result=env.client.get('/api/workflows/runs/'+r['id']).json()
    assert result['status']=='failed' and 'provider unavailable' in result['nodes']['bad']['error']
    assert 'next' not in result['nodes']
    assert result['nodes']['bad']['started'] and result['nodes']['bad']['durationMs']>=0


@pytest.mark.parametrize('status',['queued','running','stopping'])
def test_startup_recovers_recent_orphan_trials_without_inventing_elapsed_time(env,status):
    run=env.client.post('/api/workflows/runs',json={'graph':graph()},headers={'X-Veya-Day':'1'}).json()
    rid=run['id']
    with env.tasks.db() as db:
        db.execute('UPDATE workflow_trials SET status=?,nodes=? WHERE id=?',
                   (status,json.dumps({'input':{'status':'success','durationMs':12},'out':{'status':'running','started':run['createdAt']}}),rid))
    assert env.service.recover_interrupted_trials()==1
    result=env.client.get('/api/workflows/runs/'+rid).json()
    assert result['status']=='failed' and '服务重启' in result['error']
    assert result['nodes']['input']['status']=='success'
    assert result['nodes']['out']['status']=='failed'
    assert result['nodes']['out']['timingIncomplete'] is True
    assert 'durationMs' not in result['nodes']['out']
    assert env.service.recover_interrupted_trials()==0


def test_constructing_service_does_not_interrupt_another_live_worker(env):
    run=env.client.post('/api/workflows/runs',json={'graph':graph()},headers={'X-Veya-Day':'1'}).json()
    with env.tasks.db() as db:db.execute("UPDATE workflow_trials SET status='running' WHERE id=?",(run['id'],))
    service=WorkflowService(env.tasks,env.service.portfolio,env.service.runner)
    try:assert env.client.get('/api/workflows/runs/'+run['id']).json()['status']=='running'
    finally:service.pool.shutdown()


def test_router_startup_recovers_orphan_and_leaves_completed_trials_unchanged(env):
    first=env.client.post('/api/workflows/runs',json={'graph':graph()},headers={'X-Veya-Day':'1'}).json()
    second=env.client.post('/api/workflows/runs',json={'graph':graph()},headers={'X-Veya-Day':'1'}).json()
    with env.tasks.db() as db:db.execute("UPDATE workflow_trials SET status='running' WHERE id=?",(first['id'],))
    with TestClient(env.app):
        assert env.client.get('/api/workflows/runs/'+first['id']).json()['status']=='failed'
        assert env.client.get('/api/workflows/runs/'+second['id']).json()['status']=='success'


def test_order_analysis_without_saved_decision_stops_before_model_research(env,monkeypatch):
    monkeypatch.setattr('app.workflows.execution_tools',lambda agent:[])
    g=graph([
        dict(id='jev',kind='start',title='JEV 评估',arguments={'items':[{'symbol':'AAPL','action':'buy','confidence':.8}]}),
        dict(id='trade',kind='model',title='筛选并下单',instruction='只有存在有效 decisionId 时才调用 portfolio-order，否则明确说明。'),
    ],[dict(source='jev',target='trade')])
    states={}
    result=env.service.execute({'workflow':g,'agent':'mentora-deal','question':'执行','_owner':'owner'},'guarded',lambda i,s:states.update({i:s}))
    assert result['workflowNodes']['trade']=='success'
    assert states['trade']['output']['orderReceipts']==[]
    assert 'decisionId' in states['trade']['output']['interpretation']
    assert not env.calls


def test_portfolio_decision_bridge_enriches_persists_and_filters(env,monkeypatch):
    captured={}
    class DealWorkflow:
        def entry_evidence(self,owner,item):
            return {'symbol':item['symbol'],'quote':{'price':100,'priceAt':'2026-10-26T00:00:00Z'},
                    'signal':{},'backtests':item['backtests']}
        def store(self,owner,kind,evidence,decision,account):
            captured.update(owner=owner,kind=kind,evidence=evidence,account=account)
            return dict(decision,id='saved-decision',kind=kind,evidence=evidence)
    env.service.portfolio=SimpleNamespace(workflow=DealWorkflow())
    def call(portfolio,owner,tool,args):
        if tool=='portfolio-account':return {'cash':2000,'positions':[],'settings':{},'valuationComplete':True}
        assert tool=='portfolio-jev' and args['operation']=='decide'
        return [{'symbol':'AAPL','action':'buy','status':'decided','confidence':.8,
                 'confidenceGate':{'passed':True,'threshold':.3}}]
    monkeypatch.setitem(sys.modules,'app.portfolio_skills',SimpleNamespace(call=call))
    progress=[]
    value=env.service.portfolio_decisions('owner',{
        'kind':'entry','items':[{'symbol':'AAPL','returnPct':12}],
        'account':{'cash':1000,'positions':[],'settings':{}},
        'profile':{'enabled':True,'profile':'growth','investment':{'confidenceThresholdPct':30}},
    },progress=lambda **details:progress.append(details))
    assert value['count']==1
    assert value['items'][0]['decisionId']=='saved-decision'
    assert value['items'][0]['side']=='buy'
    assert captured['account']['recommendationProfile']['investment']['confidenceThresholdPct']==30
    assert captured['account']['cash']==2000  # Do not reuse the upstream snapshot.
    assert 'AAPL' in progress[0]['progress'] and progress[0]['completed']==0
    assert 'JEV' in progress[-1]['progress'] and progress[-1]['completed']==1


def test_decision_cancellation_prevents_starting_evidence_and_model_calls(env):
    with pytest.raises(InterruptedError):
        env.service.portfolio_decisions('owner',{'items':[{'symbol':'AAPL'}],'account':{},'profile':{}},cancelled=lambda:True)


@pytest.mark.parametrize('valid_after_refresh',[True,False])
def test_account_read_refreshes_stale_positions_once_without_relaxing_checks(env,monkeypatch,valid_after_refresh):
    calls=[]
    def call(portfolio,owner,tool,args):
        assert owner=='owner' and tool=='portfolio-account'
        calls.append(args['operation'])
        valid=valid_after_refresh and args['operation']=='refresh'
        return dict(valuationComplete=valid,positions=[dict(symbol='0700.HK',stale=not valid,
            quote=dict(priceAt='2026-10-27T09:09:03+08:00'))])
    monkeypatch.setitem(sys.modules,'app.portfolio_skills',SimpleNamespace(call=call))
    account=env.service.decision_account('owner')
    assert calls==['read','refresh']
    assert account['valuationComplete'] is valid_after_refresh
    assert bool(account['valuationIssues']) is not valid_after_refresh
    if not valid_after_refresh:
        assert account['valuationIssues'][0]['symbol']=='0700.HK'
        assert '09:09:03' in account['valuationIssues'][0]['priceAt']


def test_fresh_account_does_not_refetch_and_explicit_refresh_is_not_retried(env,monkeypatch):
    calls=[]
    def call(portfolio,owner,tool,args):
        calls.append(args['operation'])
        return dict(valuationComplete=args['operation']=='read',positions=[])
    monkeypatch.setitem(sys.modules,'app.portfolio_skills',SimpleNamespace(call=call))
    assert env.service.decision_account('owner')['valuationComplete']
    assert not env.service.decision_account('owner',{'operation':'refresh'})['valuationComplete']
    assert calls==['read','refresh']


def test_account_node_refreshes_existing_read_graph_without_model_or_orders(env,monkeypatch):
    monkeypatch.setattr('app.workflows.execution_tools',lambda _:[dict(id='portfolio-account',schema=None)])
    calls=[]
    def call(portfolio,owner,tool,args):
        assert tool=='portfolio-account'
        calls.append(args.get('operation','read'))
        return dict(valuationComplete=args.get('operation')=='refresh',positions=[])
    monkeypatch.setitem(sys.modules,'app.portfolio_skills',SimpleNamespace(call=call))
    states={}
    g=graph([dict(id='account',kind='tool',tool='portfolio-account',title='账户',arguments={'operation':'read'})],[])
    env.service.execute(dict(workflow=g,agent='mentora-deal',question='账户',_owner='owner'),'account-check',lambda i,s:states.update({i:s}))
    assert states['account']['output']['valuationComplete'] is True
    assert calls==['read','refresh'] and not env.calls


def test_blocked_summary_explains_precheck_and_exact_constraint():
    from app.workflow_observations import observation_summary
    text=observation_summary(dict(observations={'SCHD':{'decision':dict(action='watch',status='blocked',
        confidence=None,factorLabel='行情或账户数据不完整',constraint='账户估值不完整：0700.HK 报价过期')}}))
    assert '前置校验未通过，未进行买卖方向评估' in text
    assert '账户估值不完整：0700.HK 报价过期' in text
    assert '行情或账户数据不完整' not in text and '未记录买卖方向置信度' not in text


def test_stale_account_reports_symbol_and_time_without_calling_model():
    from app.portfolio_laya import LayaPortfolio
    item=dict(symbol='SCHD',quote=dict(price=35.3,currency='USD',tradable=True,priceAt='2026-10-26T16:00:00-04:00'))
    account=dict(settings={},valuationComplete=False,valuationIssues=[dict(symbol='0700.HK',priceAt='2026-10-27T09:09:03+08:00')])
    def predict(*_):pytest.fail('Stale account must not reach the model')
    result=LayaPortfolio(predict).decide('entry',[item],account)[0]
    assert result['status']=='blocked' and result['confidence'] is None
    assert '0700.HK' in result['constraint'] and '09:09:03' in result['constraint']


def test_portfolio_decision_bridge_does_not_persist_in_trial(env,monkeypatch):
    class DealWorkflow:
        def entry_evidence(self,owner,item):return {'symbol':item['symbol']}
        def store(self,*args):raise AssertionError('trial must not persist decisions')
    env.service.portfolio=SimpleNamespace(workflow=DealWorkflow())
    monkeypatch.setattr(env.service,'decision_account',lambda owner:{'valuationComplete':True})
    monkeypatch.setitem(sys.modules,'app.portfolio_skills',SimpleNamespace(call=lambda *_:[{
        'symbol':'AAPL','action':'buy','status':'decided','confidence':.8,
        'confidenceGate':{'passed':True,'threshold':.3}}]))
    value=env.service.portfolio_decisions('owner',{'items':[{'symbol':'AAPL'}],'account':{},'profile':{'enabled':True}},preview=True)
    assert value['items'][0]['decisionId']=='preview-decision-0'
    assert env.service.preview_order({'operation':'plan','decisionId':'preview-decision-0','symbol':'AAPL','side':'buy'})['id']=='preview-plan-0'

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

def test_structured_jev_output_is_a_list_not_a_decisions_wrapper(env,monkeypatch):
    import app.workflows as module
    tools=[dict(id='portfolio-jev',schema=None),dict(id='portfolio-order',schema=None)]
    monkeypatch.setattr(module,'execution_tools',lambda agent:tools)
    g=graph([dict(id='jev',kind='tool',title='JEV',tool='portfolio-jev',arguments={'evidence':[{'symbol':'AAPL'}]}),dict(id='gate',kind='condition',title='检查',path='jev.decisions')],[dict(source='jev',target='gate')])
    with pytest.raises(ValueError,match='输出是列表'):env.service.validate(g,'mentora-deal')
    g['nodes'][1]['path']='jev.0.action'
    env.service.validate(g,'mentora-deal')

def test_builder_exposes_jev_identity_and_execution_limits(env):
    seen={}
    def build(context):seen.update(context);return dict(graph=graph())
    env.service.builder=build
    env.service.build(BuildInput(message='构建流程'))
    assert '不含' in seen['nodeOutputs']['portfolio-jev']
    assert 'decisionId' in seen['nodeOutputs']['portfolio-order']

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

def mixed_market_graph():
    return graph([dict(id='watch',kind='watchlist',title='自选'),dict(id='data',kind='tool',title='历史行情',tool='portfolio-data',foreach='{{watch}}',onItemError='continue',arguments={'operation':'history','symbol':'{{item.symbol}}'}),dict(id='backtest',kind='tool',title='回测',tool='portfolio-backtest',foreach='{{data.items}}',arguments={'symbol':'{{item.symbol}}','strategy':'ma_cross'})],[dict(source='watch',target='data'),dict(source='data',target='backtest')])

def test_mixed_hk_us_batch_retains_provider_errors_and_runs_remaining_symbols(env,monkeypatch):
    native_tools(monkeypatch)
    from app.portfolio_skills import module as entry
    from app.portfolio import symbol_value
    symbols=['0700.HK','9988.HK','TLT','CRCL'];calls=[];histories=[]
    env.service.portfolio.workflow.favorites=lambda owner:[{'symbol':s} for s in symbols]
    def history(symbol):
        histories.append(symbol)
        if symbol.endswith('.HK'):raise ValueError('港股行情源暂时不可用（fixture）')
        return dict(rows=[{'close':1}],source='unit-test')
    env.service.portfolio.market=SimpleNamespace(history=history)
    def call(service,owner,name,args):
        calls.append((name,args['symbol']))
        if name=='portfolio-data':return entry(name).execute(service,owner,args)
        return {'symbol':args['symbol'],'status':'computed','totalReturn':.1}
    monkeypatch.setattr('app.portfolio_skills.call',call)
    states={}
    result=env.service.execute({'workflow':mixed_market_graph(),'agent':'mentora-deal','question':'验证','_owner':'owner'},'mixed',lambda i,s:states.update({i:s}))
    assert result['workflowNodes']=={'watch':'success','data':'partial','backtest':'success'}
    assert histories==symbols
    assert [s for name,s in calls if name=='portfolio-backtest']==['TLT','CRCL']
    value=states['data']['output']
    assert value['count']==2 and value['failedCount']==2
    assert [e['symbol'] for e in value['errors']]==symbols[:2]
    assert all('港股行情源暂时不可用' in e['error'] for e in value['errors'])
    assert '0700.HK' in result['interpretation'] and result['workflowWarnings']
    assert symbol_value('600519.SH')=='600519.SH' and symbol_value('TLT')=='TLT'

def test_continue_policy_fails_if_every_item_failed(env,monkeypatch):
    native_tools(monkeypatch)
    env.service.portfolio.workflow.favorites=lambda owner:[{'symbol':'0700.HK'},{'symbol':'9988.HK'}]
    def call(*args):raise ValueError('未支持港股')
    monkeypatch.setattr('app.portfolio_skills.call',call)
    states={}
    with pytest.raises(RuntimeError,match='全部 2 个标的执行失败'):
        env.service.execute({'workflow':mixed_market_graph(),'agent':'mentora-deal','question':'验证','_owner':'owner'},'failed',lambda i,s:states.update({i:s}))
    assert states['data']['output']['failedCount']==2 and states['data']['output']['items']==[]
    assert 'backtest' not in states

def test_continue_policy_never_swallows_cancellation(env,monkeypatch):
    native_tools(monkeypatch)
    def call(*args):raise InterruptedError('cancelled')
    monkeypatch.setattr('app.portfolio_skills.call',call)
    states={}
    with pytest.raises(InterruptedError):
        env.service.execute({'workflow':mixed_market_graph(),'agent':'mentora-deal','question':'验证','_owner':'owner'},'cancel',lambda i,s:states.update({i:s}))
    assert states['data']['status']=='cancelled' and 'backtest' not in states

@pytest.mark.parametrize('tool,arguments,foreach',[
    ('portfolio-order',{'operation':'execute','planId':'real-id'},'{{watch}}'),
    ('portfolio-data',{'operation':'save_candidate','symbol':'{{item.symbol}}'},'{{watch}}'),
    ('portfolio-data',{'operation':'history','symbol':'AAPL'},''),
])
def test_continue_policy_is_only_available_for_foreach_reads(env,monkeypatch,tool,arguments,foreach):
    import app.workflows as module
    monkeypatch.setattr(module,'execution_tools',lambda agent:[dict(id=tool,schema=None)])
    g=graph([dict(id='watch',kind='watchlist',title='自选'),dict(id='node',kind='tool',title='工具',tool=tool,foreach=foreach,onItemError='continue',arguments=arguments)],[dict(source='watch',target='node')])
    with pytest.raises(ValueError,match='仅逐项只读行情或回测'):env.service.validate(g,'mentora-deal')

def test_legacy_trading_graph_migrates_without_mutating_input():
    source=graph([dict(id='trade',kind='tool',title='执行模拟交易',tool='portfolio-order',instruction='从模拟账户提交模拟订单'),
                  dict(id='out',kind='output',title='输出回测决策与交易报告')],[dict(source='trade',target='out')])
    result=WorkflowGraph.model_validate(source)
    assert result.nodes[0].title=='执行交易'
    assert result.nodes[0].instruction=='从交易账户提交订单'
    assert result.nodes[1].kind=='watchlist_update' and result.nodes[1].title=='更新观察列表'
    assert source['nodes'][1]['kind']=='output'

def observation_graph():
    return graph([dict(id='test',kind='tool',title='回测',tool='portfolio-backtest',arguments={'symbol':'AAPL','strategy':'trend'}),
                  dict(id='update',kind='watchlist_update',title='更新观察列表')],[dict(source='test',target='update')])


def test_legacy_preview_order_receipt_reaches_final_output_without_writes(env,monkeypatch):
    from app.portfolio_skills import module as entry
    import app.workflows as module
    order=entry('portfolio-order')
    monkeypatch.setattr(module,'execution_tools',lambda _:[dict(id='portfolio-order',schema=order.Input.model_json_schema())])
    g=graph([
        dict(id='plan',kind='tool',title='计划',tool='portfolio-order',arguments={'operation':'plan','symbol':'AAPL','side':'buy','decisionId':'preview-decision-0'}),
        dict(id='execute',kind='tool',title='执行',tool='portfolio-order',arguments={'operation':'execute','planId':'{{plan.id}}'}),
        dict(id='update',kind='watchlist_update',title='更新观察列表'),dict(id='out',kind='output',title='输出')],
        [dict(source='plan',target='execute'),dict(source='execute',target='update'),dict(source='update',target='out')])
    queued=[]
    env.service.pool=SimpleNamespace(submit=lambda fn,*args:queued.append((fn,args)))
    run=env.client.post('/api/workflows/runs',json={'graph':g},headers={'X-Veya-Day':'1'}).json()
    fn,args=queued[0];rid,owner,config=args
    config.pop('executionMode')
    with env.tasks.db() as db:db.execute('UPDATE workflow_trials SET config=? WHERE id=?',(json.dumps(config),rid))
    fn(rid,owner,config)
    result=env.client.get('/api/workflows/runs/'+run['id']).json()
    assert result['status']=='success'
    value=result['nodes']['out']['output'];observations=value['inputs']['update']['observations']
    assert observations['AAPL']['trade']['symbol']=='AAPL'
    assert observations['AAPL']['trade']['side']=='buy'
    assert '未提交订单' in value['interpretation'] and '未写入观察列表' in value['interpretation']
    assert value['inputs']['update']['updatedCount']==0 and result['preview'] is True
    # Saved pre-fix output can be reconstructed without rerunning the graph.
    with env.tasks.db() as db:
        row=db.execute('SELECT nodes FROM workflow_trials WHERE id=?',(run['id'],)).fetchone();nodes=json.loads(row[0])
        nodes['out']['output']={'interpretation':'试运行预览：将更新 AAPL'}
        nodes['update']['output']['observations']['AAPL'].pop('trade')
        db.execute('UPDATE workflow_trials SET nodes=? WHERE id=?',(json.dumps(nodes),run['id']))
    restored=env.client.get('/api/workflows/runs/'+run['id']).json()
    assert restored['nodes']['out']['output']['inputs']['update']['observations']['AAPL']['trade']['side']=='buy'
    assert '订单执行预览' in restored['result']['interpretation']


def test_new_manual_run_uses_execution_not_preview(env,monkeypatch):
    seen=[]
    def execute(config,rid,update,trial=False,cancelled=lambda:False):
        seen.append(trial);return {'interpretation':'执行回执'}
    monkeypatch.setattr(env.service,'execute',execute)
    run=env.client.post('/api/workflows/runs',json={'graph':graph(),'executionMode':'execute'},headers={'X-Veya-Day':'1'}).json()
    result=env.client.get('/api/workflows/runs/'+run['id']).json()
    assert seen==[False] and result['preview'] is False and result['status']=='success'


def test_manual_run_persists_hk_order_and_observation_in_isolated_account(env,tmp_path,monkeypatch):
    from app.portfolio import Portfolio
    from app.portfolio_skills import module as entry
    import app.workflows as module
    feed=SimpleNamespace(quote=lambda symbol,*args,**kwargs:dict(symbol=symbol,name='fixture',market='HK',price=50,nativePrice=390.625,nativeCurrency='HKD',currency='USD',fx={'rate':.128},priceAt=module.stamp(module.now_utc()),dateOnly=False,tradable=True,lotSize=1),freshness=lambda q:(True,''))
    portfolio=Portfolio(tmp_path/'isolated-account',market=feed);env.service.portfolio=portfolio
    order=entry('portfolio-order')
    monkeypatch.setattr(module,'execution_tools',lambda _:[dict(id='portfolio-order',schema=order.Input.model_json_schema())])
    g=graph([dict(id='plan',kind='tool',title='计划',tool='portfolio-order',arguments={'operation':'plan','symbol':'0700.HK','side':'buy','quantity':10,'decisionId':'offline-decision'}),dict(id='execute',kind='tool',title='执行',tool='portfolio-order',arguments={'operation':'execute','planId':'{{plan.id}}'}),dict(id='update',kind='watchlist_update',title='保存'),dict(id='out',kind='output',title='输出')],[dict(source='plan',target='execute'),dict(source='execute',target='update'),dict(source='update',target='out')])
    queued=[];env.service.pool=SimpleNamespace(submit=lambda fn,*args:queued.append((fn,args)))
    run=env.client.post('/api/workflows/runs',json={'graph':g,'executionMode':'execute'},headers={'X-Veya-Day':'1'}).json()
    fn,args=queued[0];rid,owner,config=args
    import datetime as dt
    created=module.stamp(module.now_utc());expires=module.stamp(module.now_utc()+dt.timedelta(minutes=10))
    decision=dict(id='offline-decision',symbol='0700.HK',kind='entry',action='buy',status='decided',confidence=.99,sizeFraction=1,created=created,expires=expires)
    with portfolio.db() as db:db.execute('INSERT INTO portfolio_decisions VALUES(?,?,?,?,?,?,?,?)',('offline-decision',owner,'entry','0700.HK',json.dumps(decision),'offline-fixture',created,expires))
    fn(*args)
    result=env.client.get('/api/workflows/runs/'+run['id']).json()
    assert result['status']=='success',result
    assert result['preview'] is False
    assert result['nodes']['update']['output']['updatedCount']==1
    with env.tasks.db() as db:owner=db.execute('SELECT owner FROM workflow_trials WHERE id=?',(run['id'],)).fetchone()[0]
    assert len(portfolio.summary(owner)['trades'])==1
    assert portfolio.summary(owner)['positions'][0]['symbol']=='0700.HK'
    assert '试运行预览' not in result['result']['interpretation']


def test_execution_summary_discloses_gates_blockers_and_no_trade():
    from app.workflow_observations import observation_summary
    text=observation_summary(dict(preview=True,observations={'TLT':{'decision':{'action':'buy','confidence':.3294,'confidenceGate':{'threshold':.3,'passed':True}},'plan':{'preview':True}},'CRCL':{'decision':{'action':'watch','modelAction':'buy','confidence':.2654,'confidenceGate':{'threshold':.3,'passed':False}}},'0700.HK':{'decision':{'action':'watch','reason':'仅用于研究'}}}))
    assert 'TLT：买入' in text and '32.94%' in text and '门槛 30%（通过）' in text
    assert '26.54%' in text and '未通过' in text and '未下单' in text
    assert '0700.HK：观察；未记录买卖方向置信度；仅用于研究' in text

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

def test_hk_workflow_receipts_remain_visible_research_without_trade_authority(env,monkeypatch):
    native_tools(monkeypatch)
    from app.portfolio import Portfolio
    from test_portfolio import Feed
    portfolio=Portfolio(env.tasks.db_path.parent/'hk-observations',market=Feed())
    env.service.portfolio=portfolio
    g=observation_graph();g['nodes'][0]['arguments']['symbol']='0700.HK'
    monkeypatch.setattr('app.portfolio_skills.call',lambda *_:dict(symbol='0700.HK',status='computed',strategy='trend',totalReturn=2,currency='HKD',researchOnly=True,executionAuthorized=False))
    states={}
    env.service.execute(dict(workflow=g,agent='mentora-deal',question='研究',_owner='owner'),'hk-research',lambda i,s:states.update({i:s}))
    assert states['update']['output']['symbols']==['0700.HK']
    view=portfolio.workflow.view('owner')
    assert view['watchlist'][0]['symbol']=='0700.HK'
    assert view['candidates'][0]['researchOnly'] is True and view['candidates'][0]['executionAuthorized'] is False

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


def test_build_disconnect_cancels_model_and_closes_connection(env,monkeypatch):
    import asyncio
    import openai
    from fastapi import Response
    env.service.builder=None
    events=[]
    class Client:
        def __init__(self,**kwargs):
            self.chat=SimpleNamespace(completions=SimpleNamespace(create=self.create))
        async def __aenter__(self):return self
        async def __aexit__(self,*args):events.append('closed')
        async def create(self,**kwargs):
            events.append('started')
            try:await asyncio.Event().wait()
            except asyncio.CancelledError:
                events.append('cancelled')
                raise
    monkeypatch.setattr(openai,'AsyncOpenAI',Client)
    class Request:
        headers={};cookies={}
        url=SimpleNamespace(scheme='https')
        async def is_disconnected(self):return 'started' in events
    request=Request();request.headers={'x-veya-day':'1'}
    endpoint=next(r.endpoint for r in env.app.routes if getattr(r,'path','')=='/api/workflows/build')
    async def scenario():
        response=await asyncio.wait_for(endpoint(BuildInput(message='修复流程'),request,Response()),2)
        assert response.status_code==499
    asyncio.run(scenario())
    assert events==['started','cancelled','closed']
    assert not env.calls


@pytest.mark.parametrize('stays_stale',[False,True])
def test_plan_rechecks_and_refreshes_account_after_long_decision(env,monkeypatch,stays_stale):
    import app.workflows as module
    from app import portfolio_skills
    monkeypatch.setattr(module,'execution_tools',lambda agent:[dict(id='portfolio-order',schema=None)])
    calls=[]
    def call(service,owner,name,args):
        calls.append((name,args.get('operation')))
        if name=='portfolio-account':
            return dict(valuationComplete=args.get('operation')=='refresh' and not stays_stale,positions=[])
        assert calls[-3:]==[('portfolio-account','read'),('portfolio-account','refresh'),('portfolio-order','plan')]
        if stays_stale:raise ValueError('部分持仓行情尚未更新，先刷新估值后再生成交易计划')
        return dict(id='plan-1',symbol='QQQ')
    monkeypatch.setattr(portfolio_skills,'call',call)
    g=graph([dict(id='plan',kind='tool',title='生成订单计划',tool='portfolio-order',arguments=dict(operation='plan',symbol='QQQ',side='buy',decisionId='decision-1'))],[])
    config=dict(workflow=g,agent='mentora-deal',_owner='owner');states={}
    if stays_stale:
        with pytest.raises(RuntimeError,match='持仓行情'):env.service.execute(config,'refresh-check',lambda i,s:states.update({i:s}))
        assert states['plan']['status']=='failed'
    else:
        env.service.execute(config,'refresh-check',lambda i,s:states.update({i:s}))
        assert states['plan']['output']['id']=='plan-1'
    assert all(op!='execute' for _,op in calls)
