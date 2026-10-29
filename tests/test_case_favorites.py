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
    assert len(a.get('/api/case-favorites').json()['cases'])==len(CATEGORIES)
    assert b.get('/api/case-favorites').json()==dict(cases=[])
    with store.db() as db:
        assert db.execute('SELECT count(*) FROM case_favorites').fetchone()[0]==len(CATEGORIES)
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


def test_unfavorite_removes_exact_snapshot_from_all_modules_but_not_other_answers_or_owners(clients):
    a,b,store=clients;headers={'X-Veya-Day':'1'}
    ids=[]
    for category in CATEGORIES:
        ids.append(a.post('/api/case-favorites',json=data(category),headers=headers).json()['id'])
    other=b.post('/api/case-favorites',json=data(),headers=headers).json()
    different=data();different['answer']['interpretation']='相同问题的另一条回答'
    keep=a.post('/api/case-favorites',json=different,headers=headers).json()
    snapshot={k:v for k,v in data().items() if k!='category'}
    assert a.request('DELETE','/api/case-favorites',json=snapshot).status_code==403
    assert a.request('DELETE','/api/case-favorites',json=snapshot,headers={**headers,'Sec-Fetch-Site':'cross-site'}).status_code==403
    result=a.request('DELETE','/api/case-favorites',json=snapshot,headers=headers)
    assert result.status_code==200 and result.json()['removedCount']==len(CATEGORIES)
    assert set(result.json()['removedIds'])==set(ids)
    assert a.post('/api/case-favorites/status',json=snapshot,headers=headers).json()['saved'] is False
    assert [row['id'] for row in a.get('/api/case-favorites').json()['cases']]==[keep['id']]
    assert b.get(other['conversationUrl']).status_code==200
    assert a.get('/api/case-favorites/'+ids[0]).status_code==404
    assert a.request('DELETE','/api/case-favorites',json=snapshot,headers=headers).json()['removedCount']==0
    assert a.post('/api/case-favorites',json=data(),headers=headers).status_code==200
    with store.db() as db:assert db.execute('SELECT count(*) FROM chat_runs').fetchone()[0]==0


def test_new_favorite_defaults_to_mine_without_changing_legacy_categories(clients):
    a,_,_=clients;headers={'X-Veya-Day':'1'}
    value=data();value.pop('category')
    row=a.post('/api/case-favorites',json=value,headers=headers).json()
    assert row['category']=='mine'
    assert a.post('/api/case-favorites',json=data('charts'),headers=headers).json()['category']=='charts'


def test_favorite_description_uses_answer_body_and_old_rows_refresh_without_rewriting_payload(clients):
    a,_,store=clients;value=data()
    value['answer']['interpretation']='## 测试案例\n\n**这是正文结论**，参考[资料](https://example.com)。\n[[AIME_FILE:/generated/report.html]]'
    result=a.post('/api/case-favorites',headers={'X-Veya-Day':'1'},json=value).json()
    expected='这是正文结论，参考资料。'
    assert result['preview']==expected and result['title']=='测试案例'
    with store.db() as db:
        row=db.execute('SELECT metadata,payload FROM case_favorites WHERE id=?',(result['id'],)).fetchone()
        import json
        metadata=json.loads(row['metadata']);metadata['preview']=value['question']
        db.execute('UPDATE case_favorites SET metadata=? WHERE id=?',(json.dumps(metadata),result['id']))
        original_payload=row['payload']
    assert a.get('/api/case-favorites').json()['cases'][0]['preview']==expected
    assert a.post('/api/case-favorites',headers={'X-Veya-Day':'1'},json=value).json()['preview']==expected
    with store.db() as db:
        row=db.execute('SELECT metadata,payload FROM case_favorites WHERE id=?',(result['id'],)).fetchone()
        assert row['payload']==original_payload and json.loads(row['metadata'])['preview']==value['question']


def test_preview_ignores_tool_progress_and_uses_verified_report_paragraphs(tmp_path):
    from app.case_favorites import answer_preview
    assert answer_preview({'streamBlocks':[{'kind':'progress','data':{'text':'正在取数'}},{'kind':'text','text':'公开正文结论。'}]})=='公开正文结论。'
    report=tmp_path/'report.html';report.write_text('<html><head><style>hidden CSS</style></head><body><h2>重复标题</h2><p>月度走势</p><p>杭州二手住宅挂牌均价累计下降，近期新房和二手房走势出现分化。</p></body></html>')
    answer={'interpretation':'[[AIME_CHART:/generated/report.html]]','reportArtifacts':[{'url':'/generated/report.html'}]}
    assert answer_preview(answer,tmp_path)=='杭州二手住宅挂牌均价累计下降，近期新房和二手房走势出现分化。'
    answer['reportArtifacts']=[{'url':'https://untrusted.example/generated/report.html'},{'url':'/generated/%2e%2e%2freport.html'}]
    assert answer_preview(answer,tmp_path)==''


def test_component_tags_refresh_old_favorites_without_changing_snapshots(clients):
    a,_,store=clients
    generated=store.directory.parent/'generated';generated.mkdir(exist_ok=True)
    (generated/'test.html').write_text('<h2 data-business-title>人物收益</h2>')
    row=a.post('/api/case-favorites',headers={'X-Veya-Day':'1'},json=data('mine')).json()
    assert row['tag']=='AInvest'
    with store.db() as db:
        import json
        original=db.execute('SELECT metadata,payload FROM case_favorites WHERE id=?',(row['id'],)).fetchone()
        metadata=json.loads(original['metadata']);metadata['tag']='收藏'
        db.execute('UPDATE case_favorites SET metadata=? WHERE id=?',(json.dumps(metadata),row['id']))
    assert a.get('/api/case-favorites').json()['cases'][0]['tag']=='AInvest'
    assert a.post('/api/case-favorites',headers={'X-Veya-Day':'1'},json=data('mine')).json()['tag']=='AInvest'
    with store.db() as db:
        assert db.execute('SELECT payload FROM case_favorites WHERE id=?',(row['id'],)).fetchone()['payload']==original['payload']


def test_component_tags_use_local_rendered_evidence_and_preserve_mixed_types(tmp_path):
    from app.case_favorites import answer_component_tag
    (tmp_path/'business.html').write_text('<iframe srcdoc="&lt;h2 data-business-title&gt;收益&lt;/h2&gt;"></iframe>')
    (tmp_path/'generic.html').write_text('<main class="chart-component">')
    answer={'interpretation':'正文提到 AInvest 和 TradingView，不构成组件证据。','reportArtifacts':[
        {'url':'/share-artifact/business.html'},{'url':'/generated/generic.html'},
        {'url':'/share-artifact/photo.png'},{'url':'/generated/business.html'}]}
    assert answer_component_tag(answer,tmp_path)=='AInvest · 通用图表 · 图片'
    assert answer_component_tag({'interpretation':answer['interpretation']},tmp_path)=='图文分析'
    assert answer_component_tag({'reportArtifacts':[{'url':'https://external.test/generated/business.html'},{'url':'/generated/%2e%2e%2fbusiness.html'}]},tmp_path)=='图文分析'
