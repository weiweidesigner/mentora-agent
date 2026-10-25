import json
import pytest
from app import widget_planner as planner
from app.artifact_upgrades import upgrade_widget_tradingview


def payload(selected=''):
    return planner.PlanningInput(message='把两张卡片左右各占一半',selectedCardId=selected,board={'id':'board','title':'我的看板','cards':[
        {'id':'one','title':'苹果行情','component':'tv-advanced-chart','x':0,'y':0,'w':12,'h':18,'parameters':{'symbols':['NASDAQ:AAPL'],'interval':'D'}},
        {'id':'two','title':'筛选器','component':'tv-screener','x':0,'y':19,'w':12,'h':18,'parameters':{'market':'default'}},
    ]})


def test_raw_config_updates_merge_preserve_and_validate_against_skill():
    p=payload('one');p.message='修改图表参数'
    p.board.cards[0].parameters.config={'style':'1','hide_volume':True,'studies':['STD;SMA']}
    result=planner.validate_plan({'reply':'已更新','actions':[{'type':'update','cardId':'one','parameters':{'config':{'style':'2','studies':['STD;EMA']}}}]},p,[planner.enrich_card(c) for c in p.board.cards])
    config=result['actions'][0]['parameters']['config']
    assert config=={'style':'2','hide_volume':True,'studies':['STD;EMA']}
    with pytest.raises(ValueError,match='Unsupported settings'):
        planner.validate_plan({'reply':'bad','actions':[{'type':'update','cardId':'one','parameters':{'config':{'pine_code':'not supported'}}}]},p,[planner.enrich_card(c) for c in p.board.cards])


def test_raw_config_indicator_add_preserves_existing_and_accepts_structured_values():
    p=payload('one');p.message='添加指标'
    p.board.cards[0].parameters.config={'studies':['STD;SMA'],'hide_volume':True}
    value={'id':'MASimple@tv-basicstudies','inputs':{'length':20}}
    result=planner.validate_plan({'reply':'已更新','actions':[{'type':'update','cardId':'one','parameters':{'config':{'studies':[value]}}}]},p,[planner.enrich_card(c) for c in p.board.cards])
    assert result['actions'][0]['parameters']['config']['studies']==['STD;SMA',value]


def test_planner_catalogue_exposes_same_skill_config_defaults():
    from app.widget_library import renderer
    for item in planner.catalogue():
        if item.get('provider')=='TradingView':
            assert item['configDefaults']==renderer().CATALOG[item['widget']]['defaults']


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


def test_auto_sized_board_fractional_positions_reach_planner_and_survive_actions(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    seen=[]
    def model(context):
        seen.append(context)
        return {'reply':'已调整标题，保持当前布局。','actions':[{'type':'update','cardId':'two','title':'市场观察','layout':{'y':427/24}}]}
    monkeypatch.setattr(planner,'model_plan',model)
    app=FastAPI();app.include_router(planner.router)
    request=payload().model_dump()
    request['board']['cards'][1]['y']=427/24
    with TestClient(app) as client:
        response=client.post('/api/widgets/plan',json=request)
    assert response.status_code==200
    assert seen[0]['board']['cards'][1]['y']==427/24
    assert response.json()['actions'][0]['layout']['y']==427/24


@pytest.mark.parametrize('value',[-0.1,10001,float('nan'),float('inf')])
def test_fractional_coordinates_still_reject_invalid_positions(value):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):planner.Card(id='bad',y=value)
    with pytest.raises(ValidationError):planner.Geometry(y=value)


@pytest.mark.parametrize('action',[
    {'type':'update','cardId':'missing','layout':{'w':6}},
    {'type':'update','cardId':'two','layout':{'w':6}},
    {'type':'add','componentId':'unregistered-component','parameters':{'symbols':['AAPL']}},
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


def test_existing_advanced_chart_style_period_and_panels_update_same_card():
    p=payload();p.message='把高级图表改成30分钟折线，打开绘图工具栏，隐藏成交量'
    cards=[planner.enrich_card(c) for c in p.board.cards]
    result=planner.validate_plan({'reply':'已调整。','actions':[{'type':'update','cardId':'one','parameters':{
        'interval':'30m','style':'line','showDrawingToolbar':True,'showVolume':False,
    }}]},p,cards)
    action=result['actions'][0]
    assert action['componentId']=='tv-advanced-chart'
    assert action['parameters']['symbols']==['NASDAQ:AAPL']
    assert action['parameters']['interval']=='30'
    assert action['parameters']['style']=='2'
    assert action['parameters']['showDrawingToolbar'] is True
    assert action['parameters']['showVolume'] is False


def test_adding_compare_symbols_and_watchlist_preserves_existing_values():
    p=payload();p.message='给高级图表添加 TSLA 对比，加入 NVDA 到观察列表'
    p.board.cards[0].parameters.compareSymbols=['NASDAQ:MSFT']
    p.board.cards[0].parameters.watchlist=['NASDAQ:AAPL']
    cards=[planner.enrich_card(c) for c in p.board.cards]
    result=planner.validate_plan({'reply':'已添加。','actions':[{'type':'update','cardId':'one','parameters':{
        'compareSymbols':['NASDAQ:TSLA'],'watchlist':['NASDAQ:NVDA'],
    }}]},p,cards)
    params=result['actions'][0]['parameters']
    assert params['compareSymbols']==['NASDAQ:MSFT','NASDAQ:TSLA']
    assert params['watchlist']==['NASDAQ:AAPL','NASDAQ:NVDA']


def test_existing_advanced_chart_control_request_retries_model_that_does_nothing(monkeypatch):
    calls=[]
    def model(context):
        calls.append(dict(context))
        if len(calls)==1:return {'reply':'不支持切换。','actions':[]}
        return {'reply':'已改为折线。','actions':[{'type':'update','cardId':'one','parameters':{'style':'line'}}]}
    monkeypatch.setattr(planner,'model_plan',model)
    p=payload();p.message='把高级图表改成折线图'
    result=planner.plan_widgets(p)
    assert len(calls)==2
    assert '高级图表的设置修改' in calls[1]['validationError']
    assert result['actions'][0]['parameters']['style']=='2'


def test_existing_advanced_chart_indicator_request_updates_studies_instead_of_adding_card(monkeypatch):
    calls=[]
    def model(context):
        calls.append(dict(context))
        if len(calls) == 1:
            return {'reply':'新增 MACD 图表。','actions':[{'type':'add','componentId':'tv-advanced-chart','parameters':{'symbols':['NASDAQ:AAPL'],'studies':['MACD']}}]}
        return {'reply':'已给现有高级图表添加 MACD。','actions':[{'type':'update','cardId':'one','parameters':{'studies':['MACD']}}]}
    monkeypatch.setattr(planner,'model_plan',model)
    p=payload();p.message='给高级图表添加 MACD 技术指标'
    result=planner.plan_widgets(p)
    assert len(calls)==2
    assert '高级图表的设置修改' in calls[1]['validationError']
    assert result['actions']==[{
        'type':'update','cardId':'one','componentId':'tv-advanced-chart',
        'parameters':{'symbols':['NASDAQ:AAPL'],'interval':'D','studies':['MACD@tv-basicstudies']},
    }]


def test_new_advanced_chart_with_indicator_is_still_allowed():
    p=planner.PlanningInput(message='新建一个带 MACD 的 TradingView 高级图表',board={'id':'b','title':'看板','cards':[]})
    result=planner.validate_plan({'reply':'已新增。','actions':[{'type':'add','componentId':'tv-advanced-chart','parameters':{'symbols':['NASDAQ:AAPL'],'studies':['MACD']}}]},p,[])
    assert result['actions'][0]['parameters']['studies']==['MACD@tv-basicstudies']


def test_adding_an_indicator_preserves_existing_advanced_chart_studies():
    p=payload();p.message='给当前 TradingView 高级图表加上 RSI 指标'
    p.board.cards[0].parameters.studies=['MACD@tv-basicstudies']
    cards=[planner.enrich_card(c) for c in p.board.cards]
    result=planner.validate_plan({'reply':'已添加 RSI。','actions':[{'type':'update','cardId':'one','parameters':{'studies':['RSI']}}]},p,cards)
    assert result['actions'][0]['parameters']['studies']==['MACD@tv-basicstudies','RSI@tv-basicstudies']


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


def test_switching_to_intraday_drops_previous_candle_interval():
    p=payload('one');cards=[planner.enrich_card(c) for c in p.board.cards]
    result=planner.validate_plan({'reply':'改为日内分时','actions':[{'type':'update','cardId':'one','componentId':'tv-intraday'}]},p,cards)
    assert result['actions'][0]['componentId']=='tv-intraday'
    assert result['actions'][0]['parameters']['symbols']==['NASDAQ:AAPL']
    assert 'interval' not in result['actions'][0]['parameters']


def test_host_footer_is_hidden_for_standalone_and_old_canvas_documents():
    document='<html><head></head><body><main><footer>host note</footer></main><script id="tv-config">{}</script><iframe src="https://www.tradingview-widget.com"></iframe></body></html>'
    upgraded=upgrade_widget_tradingview(document)
    assert '<style data-tv-host-footer>main>footer,.tradingview-widget-copyright{display:none!important}' in upgraded
    assert 'https://www.tradingview-widget.com' in upgraded
    assert upgrade_widget_tradingview(upgraded)==upgraded
    legacy=upgraded.replace(upgraded[upgraded.index('<style data-tv-host-footer>'):upgraded.index('</style>',upgraded.index('<style data-tv-host-footer>'))+8],'')
    assert 'data-tv-host-footer' in upgrade_widget_tradingview(legacy)


def test_broker_addition_without_parameters_gets_default():
    from app import widget_planner as planner
    payload=planner.PlanningInput(message='加个经纪商评分',board={'id':'b','title':'看板','cards':[]})
    result=planner.validate_plan({'reply':'已添加经纪商评分。','actions':[{'type':'add','componentId':'tv-broker-rating'}]},payload,[])
    assert result['actions'][0]['parameters']['symbols']==['easymarkets']


def test_first_custom_board_retries_missing_generated_title(monkeypatch):
    calls=[]
    def model(context):
        calls.append(dict(context))
        actions=[{'type':'add','componentId':'tv-advanced-chart','parameters':{'symbols':['NASDAQ:AAPL']}}]
        if len(calls)>1:actions.insert(0,{'type':'rename_board','title':'苹果趋势观察看板'})
        return {'reply':'创建苹果看板','actions':actions}
    monkeypatch.setattr(planner,'model_plan',model)
    p=planner.PlanningInput(message='帮我跟踪苹果的价格趋势',board={'id':'new','title':'自定义','cards':[]})
    result=planner.plan_widgets(p)
    assert len(calls)==2
    assert 'validationError' in calls[1]
    assert result['actions'][0]['title']=='苹果趋势观察看板'


def test_custom_board_keeps_placeholder_when_clarification_is_needed():
    p=planner.PlanningInput(message='帮我创建一个',board={'id':'new','title':'自定义','cards':[]})
    assert planner.validate_plan({'reply':'想关注哪个市场？','actions':[]},p,[])['actions']==[]


@pytest.mark.parametrize('effort,api_effort',[('low','low'),('medium','high'),('high','high'),('xhigh','high'),('ultra','max')])
def test_widget_model_receives_selected_reasoning_effort(monkeypatch,effort,api_effort):
    from types import SimpleNamespace
    calls=[]
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"reply":"已理解","actions":[]}'))])
    monkeypatch.setenv('DEEPSEEK_API_KEY','test-key')
    monkeypatch.setattr(planner,'OpenAI',lambda **kwargs:SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    planner.model_plan({'message':'调整看板','reasoningEffort':effort})
    assert calls[0]['reasoning_effort']==api_effort
    assert calls[0]['extra_body']['thinking']['type']=='enabled'


def test_widget_plan_accepts_strength_and_passes_it_to_planning(monkeypatch):
    seen=[]
    monkeypatch.setattr(planner,'model_plan',lambda context:seen.append(context) or {'reply':'已理解','actions':[]})
    request=payload().model_dump();request['reasoningEffort']='ultra'
    planner.plan_widgets(planner.PlanningInput.model_validate(request))
    assert seen[0]['reasoningEffort']=='ultra'
    request['reasoningEffort']='invalid'
    with pytest.raises(ValueError):planner.PlanningInput.model_validate(request)
