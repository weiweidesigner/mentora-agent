"""Private saved cases: software fixtures only, no market inference or orders."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.chat_sessions import ChatSessions
from app.case_favorites import create_router, CATEGORIES


@pytest.fixture
def clients(tmp_path):
    store=ChatSessions(tmp_path)
    app=FastAPI();app.include_router(create_router(store))
    yield TestClient(app),TestClient(app),store
    store.pool.shutdown(wait=True)


def data(category='reports'):
    return dict(category=category,question='离线收藏测试',title='测试案例',answer=dict(
        interpretation='这是测试内容，不是投资事实。',reportArtifacts=[dict(url='/share-artifact/test.html',title='测试图表')],
        streamBlocks=[dict(kind='text',data=dict(text='原始文本'))],sources=[dict(title='测试来源')],
        messages=[dict(role='user',text='不应保存其他历史')],secret='不应保存'))


def test_six_categories_persist_and_replay_owner_only(clients):
    a,b,store=clients
    for category in CATEGORIES:
        result=a.post('/api/case-favorites',headers={'X-Veya-Day':'1'},json=data(category))
        assert result.status_code==200
        row=result.json();assert row['category']==category and row['personal'] is True
        replay=a.get(row['conversationUrl']);assert replay.status_code==200
        snapshot=replay.json();assert snapshot['answer']['reportArtifacts']==data()['answer']['reportArtifacts']
        assert 'secret' not in snapshot['answer'] and 'messages' not in snapshot['answer']
        assert b.get(row['conversationUrl']).status_code==404
        assert a.post('/api/case-favorites',headers={'X-Veya-Day':'1'},json=data(category)).json()['id']==row['id']
    assert len(a.get('/api/case-favorites').json()['cases'])==6
    assert b.get('/api/case-favorites').json()==dict(cases=[])
    with store.db() as db:
        assert db.execute('SELECT count(*) FROM case_favorites').fetchone()[0]==6
        assert db.execute('SELECT count(*) FROM chat_runs').fetchone()[0]==0
    assert a.get('/api/case-favorites').headers['cache-control']=='no-store'


def test_invalid_empty_oversized_and_cross_site_requests(clients):
    a,_,_=clients
    assert a.post('/api/case-favorites',json=data()).status_code==403
    headers={'X-Veya-Day':'1','Sec-Fetch-Site':'cross-site'}
    assert a.post('/api/case-favorites',headers=headers,json=data()).status_code==403
    headers={'X-Veya-Day':'1'}
    assert a.post('/api/case-favorites',headers=headers,json=data('bad')).status_code==422
    value=data();value['answer']={}
    assert a.post('/api/case-favorites',headers=headers,json=value).status_code==400
    value=data();value['answer']['interpretation']='x'*2_000_001
    assert a.post('/api/case-favorites',headers=headers,json=value).status_code==413


def test_survives_store_reopen(clients):
    a,_,store=clients
    a.post('/api/case-favorites',headers={'X-Veya-Day':'1'},json=data())
    reopened=ChatSessions(store.directory)
    app=FastAPI();app.include_router(create_router(reopened));client=TestClient(app);client.cookies.update(a.cookies)
    assert len(client.get('/api/case-favorites').json()['cases'])==1
    reopened.pool.shutdown(wait=True)


def test_status_lookup_is_read_only_exact_and_owner_scoped(clients):
    a,b,store=clients;headers={'X-Veya-Day':'1'}
    value=data();value['answer']['reportArtifacts'][0]['value']=1e-7
    snapshot={k:v for k,v in value.items() if k!='category'}
    assert a.post('/api/case-favorites/status',json=snapshot,headers=headers).json()['saved'] is False
    a.post('/api/case-favorites',json=value,headers=headers)
    assert a.post('/api/case-favorites/status',json=snapshot,headers=headers).json()==dict(saved=True,categories=['reports'])
    assert b.post('/api/case-favorites/status',json=snapshot,headers=headers).json()['saved'] is False
    snapshot['answer']['interpretation']='同一问题的新回答'
    assert a.post('/api/case-favorites/status',json=snapshot,headers=headers).json()['saved'] is False
    assert a.post('/api/case-favorites/status',json=snapshot).status_code==403
    with store.db() as db:assert db.execute('SELECT count(*) FROM case_favorites').fetchone()[0]==1
