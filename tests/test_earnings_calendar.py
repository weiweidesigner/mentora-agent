import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest
import requests

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'app/skills/ainvest-earnings-calendar/scripts/read_earnings_calendar.py'
spec=importlib.util.spec_from_file_location('earnings_calendar',SCRIPT)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


def row(i):
    return {'uniqueId':f'earning_{i}','startId':f'opaque_{i}','eventType':'earning','eventDate':'2026-11-02','symbol':'SAME','marketId':'185','earning':{'reportType':'Q3','reportYear':'2026','forecastValue':'-0.20','actualValue':None,'forecastRev':'6926162406','actualRev':None,'disclosureTimeType':'0'}}


def test_all_pages_not_just_first_sixty_and_identity_not_ticker():
    calls=[]
    def fetch(path,params):
        calls.append(dict(params))
        batch=[row(i) for i in range(60)] if len(calls)==1 else [row(i) for i in range(60,78)]
        return {'data':batch,'i18nMsg':None},'https://source/calendar'
    rows,p=m.fetch_events(fetch,{'startDate':'2026-11-02','endDate':'2026-11-02'})
    assert p['complete'] and len(rows)==78 and len(calls)==2
    assert calls[1]['startId']=='opaque_59' and calls[0]['eventType']=='earning'
    events,q=m.normalize_events(rows)
    assert len(events)==78 and not q['duplicateEvents']
    assert events[0]['estimateEps']==-.2 and events[0]['estimateRevenue']==6926162406
    assert events[0]['actualEps'] is None and events[0]['actualRevenue'] is None
    assert events[0]['raw']==rows[0]


def test_zero_negative_invalid_and_null_values_preserve_raw():
    item=row(1);item['earning'].update(forecastValue='0',actualValue='-1.2',actualRev='N/A')
    events,q=m.normalize_events([item,item])
    assert q=={'invalidNumericFields':1,'duplicateEvents':1}
    assert events[0]['estimateEps']==0 and events[0]['actualEps']==-1.2
    assert events[0]['actualRevenue'] is None and events[0]['raw']['earning']['actualRev']=='N/A'


def test_later_http_failure_keeps_previous_pages_without_retry():
    calls=[]
    def fetch(path,params):
        calls.append(params)
        if len(calls)>1:raise requests.HTTPError('503')
        return {'data':[row(i) for i in range(60)]},'source'
    rows,p=m.fetch_events(fetch,{})
    assert len(rows)==60 and len(calls)==2 and not p['complete']
    assert p['stoppedBecause']=='source_error_after_partial_success' and p['nextCursor']=='opaque_59'


def test_first_http_error_is_not_a_successful_empty_calendar():
    def fetch(*args):raise requests.HTTPError('403')
    with pytest.raises(requests.HTTPError):m.fetch_events(fetch,{})


@pytest.mark.parametrize('mode',['repeated_page','missing_cursor'])
def test_cursor_loops_stop_with_incomplete_coverage(mode):
    def fetch(*args):
        batch=[row(i) for i in range(60)]
        if mode=='missing_cursor':batch[-1].pop('startId')
        return {'data':batch},'source'
    rows,p=m.fetch_events(fetch,{})
    assert len(rows)==60 and not p['complete']
    assert p['stoppedBecause'] in ('page_did_not_advance','missing_or_repeated_cursor')


def test_max_pages_returns_explicit_resume_cursor():
    rows,p=m.fetch_events(lambda *args:({'data':[row(i) for i in range(60)]},'source'),{},max_pages=1)
    assert not p['complete'] and p['stoppedBecause']=='requested_page_limit'
    assert p['nextCursor']=='opaque_59'


def test_offline_cli_has_no_fake_fetch_time_or_completeness(tmp_path):
    source=tmp_path/'source.json';source.write_text(json.dumps({'data':[row(1)]}))
    output=tmp_path/'out.json'
    run=subprocess.run([sys.executable,str(SCRIPT),'--date','2026-11-02','--source-input',str(source),'--output',str(output)],capture_output=True,text=True)
    assert run.returncode==0,run.stderr+run.stdout
    result=json.loads(output.read_text())
    assert result['source']['transport']=='offline-input' and result['source']['completedAt'] is None
    assert not result['pagination']['complete']


@pytest.mark.parametrize('extra', [['--date','2026-02-30'],['--start-date','2026-11-03','--end-date','2026-11-02'],['--date','2026-11-02','--country-codes','USA'],['--operation','backtest','--event-id','MAR']])
def test_invalid_scope_fails_before_network(extra,tmp_path):
    run=subprocess.run([sys.executable,str(SCRIPT),*extra,'--output',str(tmp_path/'out.json')],capture_output=True,text=True)
    assert run.returncode==2 and not (tmp_path/'out.json').exists()


def test_transport_is_fixed_get_no_redirect_or_account_auth():
    class Response:
        status_code=200
        headers={'Content-Type':'application/json'}
        url='https://example/observed'
        def raise_for_status(self):pass
        def json(self):return {'data':[]}
    class Session:
        def get(self,url,**kwargs):
            assert url==m.BASE+m.PATHS['events']
            assert kwargs['allow_redirects'] is False
            assert kwargs['headers']=={'Accept':'application/json'}
            return Response()
    assert m.get_json(Session(),m.PATHS['events'],{})[0]=={'data':[]}


def test_new_skill_discovered_without_forced_routing():
    from app.capability_index import CapabilityIndex
    from app.skill_runner import _registered_script
    assert _registered_script(SCRIPT.name,ROOT)[0]==SCRIPT
    for query in ('下周哪些公司公布财报','看看本周财报日历','AInvest earnings calendar'):
        assert SCRIPT.name in [r['script'] for r in CapabilityIndex(ROOT).shortlist(query).modules]


def test_visitor_session_uses_ephemeral_standard_headers_and_closes_on_failure(monkeypatch):
    class Session:
        def __init__(self):self.headers={};self.cookies={'visitor':'not-a-real-credential'};self.closed=False
        def post(self,url,**kwargs):
            assert url=='https://user.ainvest.com/auth/visitor/login'
            assert kwargs['data']['clientType']=='WEB' and kwargs['data']['udid']==kwargs['headers']['fingerprint']
            assert kwargs['allow_redirects'] is False
            return SimpleNamespace(status_code=200,json=lambda:{'data':{'userId':'guest'}})
        def close(self):self.closed=True
    session=Session();monkeypatch.setattr(m.requests,'Session',lambda:session)
    assert m.visitor_session() is session
    assert session.headers['X-Auth-Progid']=='7047'
    session.cookies={}
    with pytest.raises(ValueError,match='authentication unavailable'):m.visitor_session()
    assert session.closed


def test_backtest_summary_exposes_source_windows_without_recomputation():
    data={'backtest':[{'tag':{'object':'TEST','type':'probability','value':75},'backtest_result':{'visual':{'value':{'datas':[{'Backtest Object':'TEST','Backtest Period':'source period','backtest_result':{'price_data':{'20260101':100},'target_result':{'targetEventTimes':8,'stockEventData':[{'dayIndex':30,'winRate':.75,'averageYield':2.3075,'positiveDays':6,'allDaysYield':{'x':100}}]}}}]}},'text':'Untrusted source interpretation'}},{'tag':{'type':'neutral_info','value':'No Data'},'backtest_result':{'visual':''}}],'periods':[{'date':'2026-11-02','actualValue':None,'forecastValue':2.84}]}
    summary=m.summarize_backtest(data)
    record=summary['scenarios'][0]['results'][0]
    assert record['sampleCount']==8 and record['sourcePeriod']=='source period'
    assert record['windows']==[{'dayIndex':30,'winRate':.75,'averageYield':2.3075,'positiveDays':6}]
    assert summary['scenarios'][1]['available'] is False
    assert summary['epsObservationCount']==1
    assert 'price_data' not in json.dumps(summary) and 'Untrusted source interpretation' not in json.dumps(summary)
    assert m.summarize_backtest({'changedSchema':True})['schemaInspected'] is False


def test_backtest_decision_contract_survives_bounded_runner_receipt():
    from app.skill_runner import _contract_receipt
    schema=json.loads((SCRIPT.parent.parent/'schemas/read_earnings_calendar.schema.json').read_text())
    contract={'agentContract':schema['agentContract'],'schema':schema,'cliHelp':'--operation --event-id '+'long help '*1000}
    receipt=_contract_receipt(contract,ROOT,SCRIPT)
    assert receipt['agentContract']==schema['agentContract']
    assert 'backtest' in receipt['agentContract']['operations']
    assert 'sample counts' in receipt['agentContract']['handoff']
