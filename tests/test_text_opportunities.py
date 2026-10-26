"""Explicit, offline classification fixtures; no real prices, trades or model calls."""
from contextlib import contextmanager
import json
import sqlite3
from types import SimpleNamespace
import pytest
from app import text_opportunities as tool


@pytest.fixture
def service(tmp_path):
    path=tmp_path/'directory.sqlite3'
    @contextmanager
    def db():
        connection=sqlite3.connect(path);connection.row_factory=sqlite3.Row
        try:
            with connection: yield connection
        finally:connection.close()
    with db() as connection:
        connection.execute('CREATE TABLE universe(symbol TEXT PRIMARY KEY,name TEXT)')
        connection.executemany('INSERT INTO universe VALUES(?,?)',[('AAPL','Apple Inc.'),('MSFT','Microsoft Corporation'),('0700.HK','腾讯控股'),('600519.SH','贵州茅台'),('IT','Gartner Inc.')])
    return SimpleNamespace(db=db)


def answer(symbol, score=.85):
    values={'opportunity':score,'unsupported':1-score}
    return dict(model='local-test-jev',usage={},answers={'opportunity':dict(choice=max(values,key=values.get),probabilities=values)})


def test_extracts_actual_mentions_classifies_locally_and_preserves_exact_evidence(service):
    text='以下是测试材料，不是投资事实。AAPL 有新产品催化；Microsoft Corporation 面临需求风险；腾讯控股有值得研究的订单变化。'
    seen=[]
    def predict(state,questions):
        seen.append((state,questions));return answer(state['symbol'],.85 if state['symbol']!='MSFT' else .2)
    result=tool.execute(service,'owner',{'text':text},predict=predict)
    assert result['symbols']==['AAPL','0700.HK']
    assert len(result['assessments'])==3 and result['evaluatedCount']==3
    assert {state['symbol'] for state,_ in seen}=={'AAPL','MSFT','0700.HK'}
    for row in result['assessments']:
        assert row['provider']=='local-jev' and row['providerModel']=='local-test-jev'
        assert row['researchOnly'] is True and row['executionAuthorized'] is False
        assert 'decisionId' not in row and 'action' not in row
        for evidence in row['evidence']: assert text[evidence['start']:evidence['end']]==evidence['text']
    assert result['assessments'][0]['opportunityConfidence']==.85


def test_name_code_hk_normalization_market_filter_and_deduplication(service):
    result=tool.execute(service,'owner',{'text':'测试：AAPL、Apple、贵州茅台 600519、HKEX:00700、00700.HK。','markets':['CN','HK']},predict=lambda s,q:answer(s['symbol']))
    assert set(result['symbols'])=={'600519.SH','0700.HK'}
    assert result['mentionedCount']==2
    assert result['assessments'][1]['mentionCount']>=2


def test_no_known_security_is_not_a_jev_rejection_and_never_guesses_symbols(service):
    def predict(*args):pytest.fail('No model call without a recognized candidate')
    result=tool.execute(service,'owner',{'text':'WITH 是测试文字；某未知公司可能有机会。'},predict=predict)
    assert result['status']=='no-recognized-securities' and result['items']==[]
    assert result['evaluatedCount']==0


def test_raw_opportunity_probability_and_configurable_cap_are_not_order_gates(service):
    result=tool.execute(service,'owner',{'text':'测试 AAPL MSFT 腾讯控股','minimumConfidence':.9,'maxCandidates':1},predict=lambda s,q:answer(s['symbol'],.85))
    assert result['items']==[] and result['assessments'][0]['opportunityConfidence']==.85
    assert len(result['deferred'])==2 and result['status']=='partial'


def test_jev_failure_or_invalid_distribution_is_never_returned_as_no_opportunities(service):
    with pytest.raises(RuntimeError,match='未完成分类'):
        tool.execute(service,'owner',{'text':'测试 AAPL'},predict=lambda s,q:{'answers':{}})
    def predict(state,questions):
        if state['symbol']=='MSFT':raise OSError('offline')
        return answer(state['symbol'])
    result=tool.execute(service,'owner',{'text':'测试 AAPL MSFT'},predict=predict)
    assert result['symbols']==['AAPL'] and result['status']=='partial'
    assert result['errors'][0]['symbol']=='MSFT'


def test_cancellation_and_late_counterevidence_are_preserved(service):
    with pytest.raises(InterruptedError):tool.execute(service,'owner',{'text':'AAPL'},predict=lambda *a:pytest.fail('cancelled'),cancelled=lambda:True)
    text='AAPL 测试机会。'+('背景文字。'*200)+'AAPL 测试反证，催化已失效。'
    seen=[]
    result=tool.execute(service,'owner',{'text':text},predict=lambda s,q:seen.append(s) or answer(s['symbol'],.2))
    assert '催化已失效' in json.dumps(seen,ensure_ascii=False)
    assert result['items']==[]


def test_long_raw_news_keeps_bounded_jev_excerpts(service):
    text='AAPL 测试资讯。'+('背景文字。'*11000)+'AAPL 测试末尾风险。'
    assert len(text)>50000
    seen=[]
    result=tool.execute(service,'owner',{'text':text},predict=lambda s,q:seen.append(s) or answer(s['symbol']))
    assert result['symbols']==['AAPL']
    assert '测试末尾风险' in json.dumps(seen,ensure_ascii=False)
    assert len(json.dumps(seen,ensure_ascii=False))<5000


@pytest.mark.parametrize('payload',[{'text':''},{'text':'   '},{'text':'AAPL','maxCandidates':0},{'text':'AAPL','markets':['XX']},{'text':'AAPL','minimumConfidence':float('nan')},{'text':'AAPL','owner':'other'}])
def test_schema_rejects_bad_arguments(payload):
    with pytest.raises(ValueError):tool.Input.model_validate(payload)


@pytest.mark.parametrize('structured',[False,True])
def test_default_evaluates_all_more_than_thirty_candidates(service,monkeypatch,structured):
    records=[dict(symbol='TST'+str(i),market='US',name='Fixture Company '+str(i),aliases=[]) for i in range(40)]
    monkeypatch.setattr(tool,'directory',lambda s:records)
    text=' '.join(r['symbol'] for r in records)
    if structured:text=json.dumps([dict(title='fixture only',content_text=text,related_symbols=[r['symbol'] for r in records])])
    result=tool.execute(service,'fixture',{'text':text},predict=lambda s,q:answer(s['symbol']))
    assert result['evaluatedCount']==40 and result['remainingCount']==0 and result['deferred']==[]


def test_structured_news_uses_all_explicit_codes_and_article_prose_not_json_noise(service,monkeypatch):
    records=[dict(symbol=s,market='US',name=name,aliases=[]) for s,name in [('GOOG','Alphabet'),('GOOGL','Alphabet'),('META','Meta Platforms'),('NVDA','Nvidia'),('AI','C3.ai'),('U','Unity'),('S','SentinelOne')]]
    monkeypatch.setattr(tool,'directory',lambda s:records)
    article=dict(title='AI in the U.S. fixture',summary='Fixture summary',content_text='Alphabet tests a product. Nvidia faces fixture risk. Meta Platforms has fixture evidence.',aime_summary='Original source overview.',related_symbols=['GOOG','GOOGL','META'],mentioned_symbols=['NVDA'],url='https://example.invalid/news',image='https://example.invalid/AI/U/S.png',published_at='2026-10-26')
    seen=[]
    result=tool.execute(service,'fixture',{'text':json.dumps([article,article])},predict=lambda s,q:seen.append(s) or answer(s['symbol']))
    assert result['source']=='structured-news' and set(result['symbols'])=={'GOOG','GOOGL','META','NVDA'}
    assert result['evaluatedCount']==4 and all(len(s['untrustedArticles'])==2 for s in seen)
    assert all('related_symbols' not in json.dumps(s) and '.png' not in json.dumps(s) for s in seen)
    assert all(e['text'] in article[e['sourceField']] for a in result['assessments'] for e in a['evidence'])


def test_unknown_explicit_news_symbol_is_pending_not_no_opportunities(service):
    article=dict(title='fixture',content_text='fixture',related_symbols=['ZZZZUNKNOWN'],mentioned_symbols=[])
    result=tool.execute(service,'fixture',{'text':json.dumps([article])},predict=lambda *a:pytest.fail('Unknown identity'))
    assert result['status']=='partial' and result['remainingCount']==1 and result['items']==[]


def test_plain_text_short_words_require_explicit_ticker_notation(service,monkeypatch):
    monkeypatch.setattr(tool,'directory',lambda s:[dict(symbol=c,market='US',name='Fixture '+c+' Corporation',aliases=[]) for c in ['AI','U','S','A']])
    result=tool.execute(service,'fixture',{'text':'AI in the U.S. A company and S&P index. $AI NASDAQ:U'},predict=lambda s,q:answer(s['symbol']))
    assert result['symbols']==['AI','U']
