import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.request import urlopen
import pytest
from app.personal_data import PersonalDataBridge,ENV_KEY,read_current_user

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture
def bridge(monkeypatch):
    calls=[]
    def call(service,owner,name,payload):
        calls.append((owner,name,payload))
        return dict(positions=[dict(symbol='AAPL' if owner=='one' else 'MSFT',quantity=3,owner=owner)],cash=100,mode='paper')
    monkeypatch.setitem(sys.modules,'app.portfolio_skills',SimpleNamespace(call=call))
    service=SimpleNamespace(workflow=SimpleNamespace(favorites=lambda owner:[dict(symbol='QQQ' if owner=='one' else 'DIA')]))
    b=PersonalDataBridge(service);b.calls=calls
    try:yield b
    finally:b.close()


def test_authenticated_reads_use_existing_account_skill_and_real_watchlist(bridge,monkeypatch):
    monkeypatch.setenv(ENV_KEY,bridge.environment('one')[ENV_KEY])
    account=read_current_user('holdings');favorites=read_current_user('watchlist')
    assert account['account']['positions'][0]['symbol']=='AAPL'
    assert account['account']['positions'][0]['owner']=='[redacted]'
    assert favorites['items']==[dict(symbol='QQQ')]
    assert bridge.calls==[('one','portfolio-account',{'operation':'read'})]
    assert account['mode']=='paper' and account['asOf']


def test_parallel_users_cannot_choose_another_identity_or_mutate_data(bridge):
    a=bridge.environment('one')[ENV_KEY];b=bridge.environment('two')[ENV_KEY]
    assert a!=b and a==bridge.environment('one')[ENV_KEY]
    with concurrent.futures.ThreadPoolExecutor() as pool:
        results=list(pool.map(lambda u:json.load(urlopen(u+'/holdings')), [a,b]*5))
    assert [r['account']['positions'][0]['symbol'] for r in results]==['AAPL','MSFT']*5
    for suffix in ['/watchlist?owner=two','/refresh','/orders','/holdings/../watchlist']:
        with pytest.raises(HTTPError):urlopen(a+suffix)
    with pytest.raises(HTTPError):urlopen(a.rsplit('/',1)[0]+'/wrong-token/holdings')


def test_empty_and_failed_reads_are_distinct(bridge,monkeypatch):
    monkeypatch.setenv(ENV_KEY,bridge.environment('one')[ENV_KEY])
    bridge.service.workflow.favorites=lambda owner:[]
    assert read_current_user('watchlist')['items']==[]
    bridge.service.workflow.favorites=lambda owner:(_ for _ in ()).throw(RuntimeError('private-owner-and-key'))
    with pytest.raises(RuntimeError,match='不能据此声称空仓') as caught:read_current_user('watchlist')
    assert 'private-owner' not in str(caught.value)
    monkeypatch.delenv(ENV_KEY)
    with pytest.raises(RuntimeError,match='未绑定用户身份'):read_current_user('holdings')


@pytest.mark.parametrize('script,resource',[('read_my_holdings.py','holdings'),('read_my_watchlist.py','watchlist')])
def test_cli_works_through_registered_skill_runner_and_rejects_owner(bridge,script,resource):
    env=dict(os.environ,**bridge.environment('one'))
    result=subprocess.run([sys.executable,'app/skill_runner.py','execute','--script',script],cwd=ROOT,env=env,capture_output=True,text=True)
    assert result.returncode==0,result.stderr+result.stdout
    receipt=json.loads(result.stdout)
    assert receipt['ok'] and resource in result.stdout
    skill='my-holdings' if resource=='holdings' else 'my-watchlist'
    rejected=subprocess.run([sys.executable,f'app/skills/{skill}/scripts/{script}','--owner','two'],cwd=ROOT,env=env,capture_output=True,text=True)
    assert rejected.returncode!=0
    assert env[ENV_KEY] not in result.stdout+result.stderr


def test_personal_capabilities_are_discovered_for_monitoring_without_manual_tickers(monkeypatch):
    import app.capability_index as mod
    monkeypatch.setattr(mod,'load_registry_data',lambda path:json.loads(path.read_text()))
    index=mod.CapabilityIndex(ROOT)
    shortlist=index.shortlist('把我的持仓和自选做成监控看板')
    assert {'my-holdings','my-watchlist'}<={s['name'] for s in shortlist.skills}
    assert {'read_my_holdings.py','read_my_watchlist.py'}<={m['script'] for m in shortlist.modules}


def test_cached_harnesses_keep_personal_transport_scoped_to_the_user(tmp_path,monkeypatch):
    from app.reasoning_frameworks import LocalAgentFrameworks
    launches=[]
    class Harness:
        def __init__(self,**options):self.options=options;launches.append(options)
        def close(self):pass
        def run(self,prompt,*,session_id,on_notification):
            on_notification(SimpleNamespace(method='session.event',payload={'sessionId':session_id,'event':{'type':'assistant/message','data':{'message':{'channel':'final','content':[{'type':'text','text':'已读取。'}]}}}}))
            return SimpleNamespace(session_id=session_id,final_response='已读取。',events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    monkeypatch.setenv('DSH_HOME',str(tmp_path/'dsh'))
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'outputs/generated')
    for owner in ['one','two','one']:
        list(client.stream('deepseek','读取我的持仓',[],session_key='same-chat',runtime_env={ENV_KEY:'http://127.0.0.1:1/'+owner}))
    assert len(launches)==2
    assert [o['env'][ENV_KEY] for o in launches]==['http://127.0.0.1:1/one','http://127.0.0.1:1/two']


def test_chat_gateway_binds_server_identity_for_personal_skills():
    import ast
    source=ast.parse((ROOT/'app/presentation.py').read_text())
    function=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='durable_chat_events')
    seen=[]
    scope={'framework_events':lambda payload,**kwargs:(seen.append(kwargs) or iter([]))}
    exec(compile(ast.Module(body=[function],type_ignores=[]),'<gateway>','exec'),scope)
    list(scope['durable_chat_events'](SimpleNamespace(question='我的持仓监控',agent='',history=[]),'server-owner'))
    assert seen==[{'user':'server-owner'}]
