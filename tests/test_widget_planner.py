import json
import pytest
from app import widget_planner as planner
from app.artifact_upgrades import upgrade_widget_tradingview


def payload(selected=''):
    return planner.PlanningInput(message='把两张卡片左右各占一半',selectedCardId=selected,board={'id':'board','title':'我的看板','cards':[
        {'id':'one','title':'苹果行情','component':'tv-advanced-chart','x':0,'y':0,'w':12,'h':18,'parameters':{'symbols':['NASDAQ:AAPL'],'interval':'D'}},
        {'id':'two','title':'筛选器','component':'tv-screener','x':0,'y':19,'w':12,'h':18,'parameters':{'market':'default'}},
    ]})


def test_layout_plan_is_model_generated_and_contains_only_validated_actions(monkeypatch):
    calls=[]
    def model(context):
        calls.append(context)
        return {'reply':'已将两张卡片并排。','actions':[{'type':'update','cardId':'one','layout':{'x':0,'y':0,'w':6}},{'type':'update','cardId':'two','layout':{'x':6,'y':0,'w':6}}]}
    monkeypatch.setattr(planner,'model_plan',model)
    result=planner.plan_widgets(payload())
    assert len(calls)==1
    assert calls[0]['board']['cards'][0]['id']=='one'
    assert result['actions'][1]['layout']['x']==6
    assert 'url' not in calls[0]['board']['cards'][0]


@pytest.mark.parametrize('action',[
    {'type':'update','cardId':'missing','layout':{'w':6}},
    {'type':'update','cardId':'two','layout':{'w':6}},
    {'type':'add','componentId':'kline','parameters':{'symbols':['AAPL']}},
    {'type':'update','cardId':'one','layout':{'x':8,'w':6}},
    {'type':'update','cardId':'one','parameters':{'interval':'5s'}},
])
def test_invalid_or_out_of_scope_operations_never_execute(action):
    p=payload('one');cards=[planner.enrich_card(c) for c in p.board.cards]
    with pytest.raises(ValueError):planner.validate_plan({'reply':'调整','actions':[action]},p,cards)


def test_selected_parameter_changes_preserve_symbol_and_route_to_same_component():
    p=payload('one')
    result=planner.validate_plan({'reply':'改为周线','actions':[{'type':'update','cardId':'one','parameters':{'interval':'W'}}]},p,[planner.enrich_card(c) for c in p.board.cards])
    action=result['actions'][0]
    assert action['componentId']=='tv-advanced-chart'
    assert action['parameters']=={'symbols':['NASDAQ:AAPL'],'interval':'W'}


def test_invalid_model_response_is_repaired_once(monkeypatch):
    calls=[]
    def model(context):
        calls.append(dict(context))
        if len(calls)==1:return {'reply':'调整','actions':[{'type':'remove','cardId':'missing'}]}
        return {'reply':'要调整哪张卡片？','actions':[]}
    monkeypatch.setattr(planner,'model_plan',model)
    result=planner.plan_widgets(payload())
    assert len(calls)==2 and 'validationError' in calls[1]
    assert result['actions']==[]


def test_existing_tradingview_config_can_be_recovered_from_saved_html(monkeypatch,tmp_path):
    monkeypatch.setattr(planner,'ROOT',tmp_path)
    directory=tmp_path/'outputs/generated';directory.mkdir(parents=True)
    (directory/'old.html').write_text('<script id="tv-config" type="application/json">'+json.dumps({'widget':'market-data','config':{'symbolsGroups':[{'symbols':[{'name':'NASDAQ:MSFT'}]}]}})+'</script>')
    result=planner.enrich_card(planner.Card(id='old',url='/mentora/generated/old.html'))
    assert result['component']=='tv-market-data'
    assert result['parameters']['symbols']==['NASDAQ:MSFT']


def test_tradingview_dashboard_chrome_is_scoped_to_canvas_and_preserves_provider_frame():
    document='<html><head></head><body><header>title</header><iframe src="https://tradingview.com"></iframe><script id="tv-config">{}</script></body></html>'
    result=upgrade_widget_tradingview(document)
    assert 'canvas' in result and 'main>header' in result
    assert '<iframe src="https://tradingview.com"></iframe>' in result
    assert upgrade_widget_tradingview(result)==result
    plain='<html><head></head><body>plain chart</body></html>'
    assert upgrade_widget_tradingview(plain)==plain


def test_follow_up_history_is_passed_as_context(monkeypatch):
    from app import widget_planner as planner
    seen = []
    monkeypatch.setattr(planner, 'model_plan', lambda context: seen.append(context) or {'reply':'已理解你的追问。','actions':[]})
    planner.plan_widgets(planner.PlanningInput(message='改成周线', history=[{'role':'user','content':'看苹果行情'},{'role':'assistant','content':'已添加苹果日线。'}], board={'id':'b','title':'看板','cards':[]}))
    assert seen[0]['history'][1]['content'] == '已添加苹果日线。'
    assert seen[0]['message'] == '改成周线'

def test_compact_ticker_height_is_supported_without_shrinking_normal_charts():
    from app import widget_planner as planner
    import pytest
    payload=planner.PlanningInput(message='加一个紧凑行情条',board={'id':'b','title':'看板','cards':[]})
    result={'reply':'已添加。','actions':[{'type':'add','componentId':'tv-ticker-tape','parameters':{'symbols':['NASDAQ:AAPL']},'layout':{'h':6}}]}
    assert planner.validate_plan(result,payload,[])['actions'][0]['layout']['h']==6
    result['actions'][0]['componentId']='tv-advanced-chart'
    with pytest.raises(ValueError,match='高度过小'):
        planner.validate_plan(result,payload,[])
