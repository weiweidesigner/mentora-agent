import datetime as dt
import threading
from types import SimpleNamespace

import pytest

from app.portfolio_technical import analyze_technical,chart_component


def history():
    return dict(rows=[dict(date=str(dt.date(2026,1,1)+dt.timedelta(days=i)),open=100+i,high=102+i,
                          low=99+i,close=101+i,adjusted=101+i,volume=1000+i) for i in range(100)],
                source='fixture verified OHLCV',currency='CNY',adjusted=True)


def test_visual_tool_receives_real_candles_and_invalidates_cache_on_history_change(tmp_path,monkeypatch):
    data=history();rendered=[];seen=[]
    def render(component):
        rendered.append(component)
        return '<html>fixture chart</html>'
    monkeypatch.setattr('app.portfolio_data.load_skill',lambda *_:SimpleNamespace(render_document=render))
    def vision(path,context,directory,symbol):
        assert path.read_text()=='<html>fixture chart</html>'
        assert symbol=='603882.SH' and context['currency']=='CNY'
        seen.append(context)
        return dict(summary='价格处于均线之上，放量突破仍需后续量价确认；跌回支撑则形态失效。',
                    hasUsableData=True,dataStatus='ok',latestVisiblePeriod=context['dataAsOf'])
    monkeypatch.setattr('app.portfolio_technical._run_vision',vision)
    market=SimpleNamespace(history=lambda _:data,cache={},guard=threading.Lock())
    service=SimpleNamespace(market=market,directory=tmp_path,generated_dir=tmp_path/'generated')
    first=analyze_technical(service,'603882.SH')
    second=analyze_technical(service,'603882.SH')
    assert first==second and len(seen)==1
    assert first['tool']=='vision-chart-analyst' and first['status']=='computed'
    assert first['chartArtifact']['url'].startswith('/generated/')
    from pathlib import Path
    assert Path(first['chartArtifact']['path']).is_file()
    assert rendered[0]['dataByPeriod']['1d'][-1]['high']==data['rows'][-1]['high']
    data['rows'][-1]['close']-=.5
    assert analyze_technical(service,'603882.SH')['chartId']!=first['chartId']
    assert len(seen)==2


@pytest.mark.parametrize('change',['missing-high','invalid-range'])
def test_no_candlesticks_are_fabricated_when_source_is_incomplete(change):
    data=history()
    if change=='missing-high':data['rows'][0].pop('high')
    else:data['rows'][0]['low']=10000
    with pytest.raises(ValueError):chart_component('603882.SH',data)


def test_empty_visual_result_is_not_published_as_valid_evidence(tmp_path,monkeypatch):
    monkeypatch.setattr('app.portfolio_data.load_skill',lambda *_:SimpleNamespace(render_document=lambda _:'<html>empty</html>'))
    monkeypatch.setattr('app.portfolio_technical._run_vision',lambda *_:dict(summary='无数据',hasUsableData=False,dataStatus='empty'))
    service=SimpleNamespace(market=SimpleNamespace(history=lambda _:history(),guard=threading.Lock(),cache={}),directory=tmp_path,generated_dir=tmp_path/'generated')
    with pytest.raises(ValueError,match='有效行情'):analyze_technical(service,'603882.SH')
    assert not service.market.cache


def test_jev_and_laya_both_receive_visual_technical_evidence(monkeypatch):
    from app.portfolio_jev import PortfolioJev
    from app.portfolio_laya import compact_state
    technical=dict(status='computed',symbol='AAPL',summary='放量突破，跌破均线则形态失效。',dataAsOf='2026-10-19',source='fixture',chartId='test-chart')
    captured={}
    class Client:
        def __init__(self,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*_):pass
        def system_one(self,state,questions):
            captured.update(state=state,questions=questions)
            return SimpleNamespace(model='test-jev',answers={
                'item_0_action':SimpleNamespace(choice='watch',confidence=.8),
                'item_0_factor':SimpleNamespace(choice='price-risk'),
                'item_0_size':SimpleNamespace(choice='quarter'),
                'item_0_catalyst':SimpleNamespace(choice='unavailable')})
    monkeypatch.setenv('PORTFOLIO_DECISION_PROVIDER','jev')
    monkeypatch.setattr('app.portfolio_jev.COSTS.record_response',lambda *_args,**_kwargs:None)
    item=dict(symbol='AAPL',technicalAnalysis=technical)
    PortfolioJev(lambda _:SimpleNamespace(configured=True,api_key='fixture',model='test',client_factory=Client)).decide('entry',[item],{})
    assert captured['state']['evidence'][0]['technicalAnalysis']==technical
    assert 'technicalAnalysis' in captured['questions']['item_0_action'].instructions
    assert compact_state('entry',item,{})['technicalAnalysis']['summary']==technical['summary']
    assert 'symbol' in compact_state('risk',item,{})['technicalAnalysis']


def test_decision_fingerprint_changes_when_visual_evidence_changes():
    from app.portfolio_workflow import PortfolioWorkflow
    item=dict(symbol='AAPL',quote=dict(price=100,priceAt='2026-10-19T20:00:00+00:00'),technicalAnalysis={'status':'computed','chartId':'first'})
    account=dict(cash=1000,positions=[],settings={})
    flow=object.__new__(PortfolioWorkflow)
    before=flow.fingerprint('entry',item,account)
    item['technicalAnalysis']['chartId']='second'
    assert flow.fingerprint('entry',item,account)!=before


def test_failed_visual_tool_is_optional_evidence_not_a_trading_veto():
    from app.portfolio_workflow import PortfolioWorkflow
    flow=object.__new__(PortfolioWorkflow)
    def fail(*_args,**_kwargs):raise RuntimeError('fixture timeout')
    flow.tool=fail
    result=flow.technical_evidence('owner','AAPL')
    assert result['status']=='unavailable' and result['symbol']=='AAPL'
    assert 'summary' not in result


def test_skill_timeout_returns_optional_gap_so_planner_can_continue(monkeypatch):
    import subprocess
    from app.portfolio_skills import call
    def timeout(*_):raise subprocess.TimeoutExpired('fixture vision command',150)
    monkeypatch.setattr('app.portfolio_technical.analyze_technical',timeout)
    result=call(SimpleNamespace(),'owner','portfolio-technical',{'symbol':'AAPL'})
    assert result['status']=='unavailable' and 'summary' not in result


def test_a_rendered_chart_is_retained_even_when_visual_interpretation_times_out(tmp_path,monkeypatch):
    import subprocess
    from pathlib import Path
    monkeypatch.setattr('app.portfolio_data.load_skill',lambda *_:SimpleNamespace(render_document=lambda _:'<html>real chart</html>'))
    def timeout(*_):raise subprocess.TimeoutExpired('vision',150)
    monkeypatch.setattr('app.portfolio_technical._run_vision',timeout)
    service=SimpleNamespace(market=SimpleNamespace(history=lambda _:history(),guard=threading.Lock(),cache={}),directory=tmp_path,generated_dir=tmp_path/'generated')
    result=analyze_technical(service,'603882.SH')
    assert result['status']=='unavailable' and 'summary' not in result
    assert Path(result['chartArtifact']['path']).read_text()=='<html>real chart</html>'


def test_final_entry_evidence_contains_the_real_tool_result(tmp_path):
    from app.portfolio import Portfolio,now
    from app.day_tasks import calendar
    from test_portfolio import Feed
    service=Portfolio(tmp_path,market=Feed())
    with service.db() as db:db.execute("INSERT INTO universe VALUES('AAPL','Apple','stocks')")
    flow=service.workflow
    visual=dict(status='computed',symbol='AAPL',summary='趋势向上，观察量价确认。',chartId='actual-tool-result')
    original_tool=flow.tool
    def tool(owner,name,**args):
        if name=='portfolio-technical':return visual
        if name=='portfolio-data' and args.get('operation')=='fundamentals':return {'status':'unavailable'}
        return original_tool(owner,name,**args)
    data=history();cal=calendar('US');current=now()
    sessions=[s for s in cal.sessions_in_range(current.date()-dt.timedelta(days=200),current.date()) if cal.session_close(s).to_pydatetime()<=current][-100:]
    for row,session in zip(data['rows'],sessions):row['date']=str(session.date())
    flow.tool=tool;flow.history=lambda _:data
    item={'symbol':'AAPL','sourceTypes':['quant']}
    result=flow.entry_evidence('owner',item)
    assert result['technicalAnalysis']==visual
    assert result['backtests'][0]['status']=='computed'


def test_research_planner_can_choose_multimodal_tool_and_read_its_output(tmp_path,monkeypatch):
    from app.portfolio import Portfolio
    from test_portfolio import Feed
    from app import stock_screening
    monkeypatch.setattr(stock_screening,'availability',lambda :{})
    flow=Portfolio(tmp_path,market=Feed()).workflow
    observed=[]
    visual=dict(status='computed',symbol='AAPL',summary='量价尚待确认。')
    flow.tool=lambda owner,name,**args:visual if name=='portfolio-technical' else pytest.fail('unexpected tool')
    def model(instruction,context):
        assert 'portfolio-technical' in instruction
        assert any(item['name']=='portfolio-technical' for item in context['tools'])
        if not context['observations']:return {'tool':'portfolio-technical','arguments':{'symbol':'AAPL'}}
        observed.append(context['observations'][-1]['result'])
        return {'orders':[],'reason':'视觉证据已纳入，继续观察'}
    flow.research.model=model
    result=flow.plan_user_research('owner','分析AAPL技术走势',{},[])
    assert observed==[visual] and result['orders']==[]
