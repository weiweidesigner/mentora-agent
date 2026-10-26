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


def test_technical_minute_edit_retries_false_refusal_and_retains_selected_card(monkeypatch):
    seen=[]
    def model(context):
        seen.append(dict(context))
        if len(seen)==1:return {'reply':'技术分析不支持1分钟，可另加高级图表','actions':[]}
        return {'reply':'已切换为1分钟技术评级','actions':[{'type':'update','cardId':'ta','parameters':{'interval':'1m'}}]}
    monkeypatch.setattr(planner,'model_plan',model)
    p=planner.PlanningInput(message='调整为1分钟',selectedCardId='ta',history=[{'role':'assistant','content':'仅支持1小时、日、周、月'}],board={'id':'b','title':'看板','cards':[{'id':'ta','title':'技术分析','component':'tv-technical-analysis','parameters':{'symbols':['NASDAQ:AAPL'],'interval':'1D','config':{'interval':'1D','showIntervalTabs':True}}}]})
    result=planner.plan_widgets(p)
    assert len(seen)==2 and '支持周期 1m' in seen[1]['validationError']
    assert '1m' in seen[0]['selectedCapabilities']['supportedIntervals']
    action=result['actions'][0]
    assert action['cardId']=='ta' and action['componentId']=='tv-technical-analysis'
    assert action['parameters']['interval']=='1m'
    assert action['parameters']['config']['showIntervalTabs'] is True
    assert action['parameters']['config'].get('interval','1m')=='1m'


@pytest.mark.parametrize('message',['双底在哪，帮我画出来','帮我识别并标出双底的两个低点和颈线','生成双底画线标记'])
def test_native_pattern_requests_delegate_instead_of_refusing_or_enabling_manual_tools(monkeypatch,message):
    seen=[]
    def model(context):
        seen.append(dict(context))
        if len(seen)==1:return {'reply':'只能调整界面，请自己手动画线','actions':[]}
        return {'reply':'正在分析双底并标记','actions':[{'type':'update','cardId':'chart','request':message,'parameters':{'drawingTools':True}}]}
    monkeypatch.setattr(planner,'model_plan',model)
    p=planner.PlanningInput(message=message,selectedCardId='chart',board={'id':'b','title':'看板','cards':[{'id':'chart','component':'kline','title':'AAPL','request':'AAPL 日线','parameters':{'symbols':['AAPL'],'interval':'1d','klineType':'line','ma':[5]}}]})
    result=planner.plan_widgets(p);action=result['actions'][0]
    assert len(seen)==2 and seen[0]['selectedCapabilities']['analysisRequestField']=='request'
    assert action['requiresGeneration'] is True and action['cardId']=='chart'
    assert action['parameters']['klineType']=='line' and action['parameters']['ma']==[5]
    assert action['request']=='AAPL 日线\n本次要求：'+message


def test_existing_pattern_style_change_does_not_request_new_analysis():
    assert not planner.native_kline_needs_data_work('把双底的颈线改为橙色虚线')


def test_widget_attachments_use_home_vision_and_pass_observations_not_base64_to_planner(monkeypatch):
    seen=[];observed=[]
    monkeypatch.setattr(planner,'observe_attachments',lambda question,images:observed.append((question,images)) or '图片内容：AAPL 周线，成交量和 MACD')
    monkeypatch.setattr(planner,'model_plan',lambda context:seen.append(context) or {'reply':'想保留哪几项？','actions':[]})
    p=payload();p.images=[planner.WidgetImage(name='chart.png',mimeType='image/png',dataUrl='data:image/png;base64,dGVzdA==')]
    result=planner.plan_widgets(p)
    assert len(observed)==1 and observed[0][1][0].name=='chart.png'
    assert result['attachmentContext']=='图片内容：AAPL 周线，成交量和 MACD'
    assert seen[0]['attachments']['images']==[{'name':'chart.png','mimeType':'image/png'}]
    assert 'dGVzdA==' not in json.dumps(seen[0])
    assert 'AAPL' in seen[0]['attachments']['observation']


@pytest.mark.parametrize('url',['https://example.com/image.png','data:text/html;base64,dGVzdA==','data:image/png;base64,!!!'])
def test_widget_attachment_rejects_unsupported_or_invalid_data(url):
    with pytest.raises(ValueError):planner.WidgetImage(dataUrl=url)


def test_widget_attachment_limit_and_empty_observation_fail_explicitly(monkeypatch):
    image={'name':'chart.png','mimeType':'image/png','dataUrl':'data:image/png;base64,dGVzdA=='}
    with pytest.raises(ValueError):planner.PlanningInput(**{**payload().model_dump(),'images':[image]*7})
    monkeypatch.setattr(planner,'observe_attachments',lambda *args:'')
    p=planner.PlanningInput(**{**payload().model_dump(),'images':[image]})
    with pytest.raises(ValueError,match='未能读取附件'):planner.plan_widgets(p)


def test_saved_live_settings_win_over_original_artifact_on_every_followup(monkeypatch,tmp_path):
    monkeypatch.setattr(planner,'ROOT',tmp_path)
    directory=tmp_path/'outputs/generated';directory.mkdir(parents=True)
    old={'code':'AAPL','dataType':'1d','ma':[5,10,20,60],'klineType':'candle-solid','candleUpColor':'#00ff00','volumeBarStyle':'solid'}
    (directory/'chart.html').write_text('<div class="kline-component"></div><script>const config = '+json.dumps(old)+';</script>')
    card=planner.Card(id='c',component='kline',url='/generated/chart.html',parameters={'symbols':['AAPL'],'ma':[],'klineType':'candle-hollow','candleUpColor':'#abcdef','volumeBarStyle':'hollow','annotationStyles':[{'text':'颈线','color':'#123456','lineWidth':2}]})
    first=planner.enrich_card(card)
    assert first['parameters']['ma']==[]
    assert first['parameters']['klineType']=='candle-hollow'
    assert first['parameters']['candleUpColor']=='#abcdef'
    p=planner.PlanningInput(message='颈线改粗为4，MACD柱空心',selectedCardId='c',board={'id':'b','title':'看板','cards':[card.model_dump()]})
    result=planner.validate_plan({'reply':'已调整','actions':[{'type':'update','cardId':'c','parameters':{'macdBarStyle':'hollow','annotationStyles':[{'text':'颈线','lineWidth':4}]}}]},p,[first])
    params=result['actions'][0]['parameters']
    assert params['volumeBarStyle']=='hollow' and params['macdBarStyle']=='hollow'
    assert params['annotationStyles']==[{'text':'颈线','color':'#123456','lineWidth':4}]
    reopened=planner.enrich_card(planner.Card(**{**card.model_dump(),'parameters':params}))
    assert reopened['parameters']==params


def test_tradingview_saved_config_wins_over_stale_artifact(monkeypatch,tmp_path):
    monkeypatch.setattr(planner,'ROOT',tmp_path)
    directory=tmp_path/'outputs/generated';directory.mkdir(parents=True)
    (directory/'chart.html').write_text('<script id="tv-config" type="application/json">'+json.dumps({'widget':'technical-analysis','config':{'symbol':'NASDAQ:AAPL','interval':'1D','showIntervalTabs':True}})+'</script>')
    card=planner.Card(id='c',component='tv-technical-analysis',url='/generated/chart.html',parameters={'interval':'1m','config':{'interval':'1m','showIntervalTabs':False}})
    result=planner.enrich_card(card)['parameters']
    assert result['config']['interval']=='1m' and result['config']['showIntervalTabs'] is False


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


def test_native_kline_config_is_recovered_and_can_be_adjusted_in_place(monkeypatch,tmp_path):
    monkeypatch.setattr(planner,'ROOT',tmp_path)
    directory=tmp_path/'outputs/generated';directory.mkdir(parents=True)
    config={'code':'000001.SH','dataType':'1d','ma':[5,10,20,60],'subIndicators':['VOL','MACD'],
            'klineType':'candle-hollow','candleColorMode':'red_up_green_down','drawingTools':False,
            'fitAnnotations':True,'mainChartHeight':470,'subChartHeight':104,'themeMode':'dark','language':'zh'}
    (directory/'kline.html').write_text('<section class="kline-component"></section><script>const config = '+json.dumps(config)+';</script>')
    card=planner.Card(id='chart',title='上证指数',url='/mentora/generated/kline.html',request='分析上证指数双底',parameters={'fromDate':'2025-01-01'})
    enriched=planner.enrich_card(card)
    assert enriched['component']=='kline'
    assert enriched['parameters']['symbols']==['000001.SH']
    assert enriched['parameters']['ma']==[5,10,20,60]
    assert enriched['parameters']['fromDate']=='2025-01-01'
    payload=planner.PlanningInput(message='去掉其他均线，只保留 MA60',selectedCardId='chart',board={'id':'b','title':'指数看板','cards':[card.model_dump()]})
    result=planner.validate_plan({'reply':'已调整','actions':[{'type':'update','cardId':'chart','parameters':{'ma':[60]}}]},payload,[enriched])
    action=result['actions'][0]
    assert action['componentId']=='kline'
    assert action['parameters']['symbols']==['000001.SH']
    assert action['parameters']['ma']==[60]
    assert '本次要求：去掉其他均线，只保留 MA60' in action['request']


def test_legacy_zero_ma_sentinel_is_normalized_to_empty_list():
    payload=planner.PlanningInput(message='调整 MACD 样式',selectedCardId='chart',board={'id':'b','title':'苹果','cards':[
        {'id':'chart','title':'MACD · NASDAQ:AAPL','component':'kline','parameters':{
            'symbols':['AAPL'],'interval':'1d','ma':[0],'subIndicators':['MACD'],
        }},
    ]})
    assert payload.board.cards[0].parameters.ma == []
    assert planner.Parameters(ma=[]).ma == []
    with pytest.raises(Exception,match='均线周期'):
        planner.Parameters(ma=[0,20])


def test_native_kline_visual_edit_retries_addition_and_requires_same_card(monkeypatch):
    calls=[]
    def model(context):
        calls.append(dict(context))
        if len(calls)==1:return {'reply':'新增图表','actions':[{'type':'add','componentId':'kline','parameters':{'symbols':['000001.SH']},'request':'新增'}]}
        return {'reply':'已调整原图','actions':[{'type':'update','cardId':'chart','parameters':{'annotationStyles':[{'text':'颈线','color':'#f97316','lineStyle':'dashed'}]}}]}
    monkeypatch.setattr(planner,'model_plan',model)
    payload=planner.PlanningInput(message='把 JEV 颈线改为橙色虚线',selectedCardId='chart',board={'id':'b','title':'指数看板','cards':[
        {'id':'chart','title':'上证指数','component':'kline','request':'分析双底','x':0,'y':0,'w':12,'h':22,'parameters':{'symbols':['000001.SH'],'interval':'1d'}}]})
    result=planner.plan_widgets(payload)
    assert len(calls)==2
    assert '现有原生 K 线' in calls[1]['validationError']
    assert result['actions'][0]['cardId']=='chart'
    assert result['actions'][0]['componentId']=='kline'
    assert result['actions'][0]['parameters']['annotationStyles'][0]['color']=='#f97316'


def test_final_planner_validation_error_keeps_the_component_reason(monkeypatch):
    monkeypatch.setattr(planner,'model_plan',lambda context:{'reply':'无法处理','actions':[]})
    payload=planner.PlanningInput(message='把均线改成 MA60',board={'id':'b','title':'指数看板','cards':[
        {'id':'chart','title':'上证指数','component':'kline','request':'分析双底','parameters':{'symbols':['000001.SH'],'interval':'1d'}}]})
    with pytest.raises(ValueError,match='现有原生 K 线'):
        planner.plan_widgets(payload)


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
