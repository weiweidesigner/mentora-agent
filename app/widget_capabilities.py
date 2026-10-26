"""Dashboard capabilities. Render-only tools are dialogue capabilities, not library tiles."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERIC_TITLES = {
    'bar_chart': '柱状图', 'line_chart': '折线图', 'group_line': '分组折线图',
    'grouped_bar': '分组柱状图', 'bar_line': '柱折组合图', 'pie': '饼图',
    'treemap': '矩形树图', 'waterfall': '瀑布图', 'double_ring_pie': '双环饼图',
    'dynamic_line': '动态折线图', 'dynamic_bar': '动态柱状图',
    'dynamic_bubble': '动态气泡图', 'mind_map': '脑图', 'flowchart': '流程图',
    'journey': '旅程图', 'timeline': '时间线',
}

KLINE_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1M', '3M']


def _kline_settings_schema() -> dict:
    """Expose the native renderer's safe, user-editable CLI contract."""
    schema_path = ROOT / 'app/skills/business-chart-recall/schemas/kline.schema.json'
    contract = json.loads(schema_path.read_text())
    mappings = {item.get('field'): item for item in contract.get('visualChannelMappings', [])}
    periods = mappings.get('dataType', {}).get('supportedValues') or KLINE_INTERVALS
    indicators = mappings.get('subIndicators', {}).get('supportedValues') or ['VOL', 'KDJ', 'MACD', 'RSI']
    return {
        'version': 1,
        'renderer': 'business-chart-recall/kline.py',
        'fields': [
            {'key': 'interval', 'label': '周期', 'type': 'select', 'default': '1d', 'options': [[v, v] for v in periods]},
            {'key': 'ma', 'label': '均线周期', 'type': 'integer-list', 'default': [5, 10, 20, 60], 'min': 1, 'max': 1000, 'placeholder': '例如 5,10,20,60'},
            {'key': 'subIndicators', 'label': '副图指标', 'type': 'multi-select', 'default': mappings.get('subIndicators', {}).get('default') or ['VOL', 'MACD'], 'options': [[v, v] for v in indicators]},
            {'key': 'klineType', 'label': 'K 线样式', 'type': 'select', 'default': mappings.get('klineType', {}).get('default') or 'candle-hollow', 'options': [['candle-hollow', '空心 K 线'], ['candle-solid', '实心 K 线'], ['line', '收盘价折线']]},
            {'key': 'candleColorMode', 'label': '涨跌颜色', 'type': 'select', 'default': '', 'options': [['', '跟随市场'], ['green_up_red_down', '绿涨红跌'], ['red_up_green_down', '红涨绿跌']]},
            {'key': 'fromDate', 'label': '开始日期', 'type': 'date'},
            {'key': 'toDate', 'label': '结束日期', 'type': 'date'},
            {'key': 'limit', 'label': 'K 线数量', 'type': 'integer', 'default': 320, 'min': 20, 'max': 10000},
            {'key': 'fullHistory', 'label': '加载完整历史', 'type': 'boolean', 'default': False},
            {'key': 'drawingTools', 'label': '显示画线标记工具', 'type': 'boolean', 'default': mappings.get('drawingTools', {}).get('default', True)},
            {'key': 'fitAnnotations', 'label': '自动适配标记范围', 'type': 'boolean', 'default': False},
            {'key': 'mainChartHeight', 'label': '主图高度', 'type': 'integer', 'default': mappings.get('mainChartHeight', {}).get('default') or 300, 'min': 180, 'max': 1200},
            {'key': 'subChartHeight', 'label': '副图高度', 'type': 'integer', 'default': mappings.get('subChartHeight', {}).get('default') or 52, 'min': 36, 'max': 400},
            {'key': 'themeMode', 'label': '图表主题', 'type': 'select', 'default': 'dark', 'options': [['dark', '深色'], ['light', '浅色']]},
            {'key': 'language', 'label': '图表语言', 'type': 'select', 'default': 'zh', 'options': [['zh', '简体中文'], ['zh-hk', '繁体中文'], ['en', 'English'], ['ja', '日本語'], ['th', 'ไทย']]},
            {'key': 'maColors', 'label': '均线颜色', 'type': 'color-list', 'default': ['#fbbf24', '#8b5cf6', '#38bdf8', '#f97316'], 'maxItems': 4, 'placeholder': '例如 #fbbf24,#8b5cf6,#38bdf8,#f97316'},
            {'key': 'maLineWidth', 'label': '均线粗细', 'type': 'number', 'default': 1.6, 'min': 1, 'max': 8, 'step': 0.1},
            {'key': 'candleUpColor', 'label': '上涨颜色', 'type': 'text', 'default': '', 'placeholder': '可选，例如 #ff2f57'},
            {'key': 'candleDownColor', 'label': '下跌颜色', 'type': 'text', 'default': '', 'placeholder': '可选，例如 #00b899'},
        ],
    }


def _attach_settings(component: dict) -> dict:
    item = dict(component)
    if item.get('id') == 'kline':
        item['settingsSchema'] = _kline_settings_schema()
        item['analysisCapabilities']=['识别技术形态（含双底、双顶、趋势、支撑压力）','基于真实行情的 JEV 自动画线和标记','新增 Pine 指标计算']
        item['analysisRequestField']='request'
    return item


def _tradingview_settings(widget: str, contract: dict) -> dict:
    labels={'chartType':'图表类型','dateRanges':'时间范围与周期','dateRange':'时间范围','showMA':'显示均线',
            'maLength':'均线周期','maLineColor':'均线颜色','maLineWidth':'均线粗细','lineWidth':'线条粗细',
            'lineType':'线形','showVolume':'显示成交量','symbols':'标的与显示名称','symbolsGroups':'标的分组',
            'tabs':'分组页签','currencies':'货币列表','countryFilter':'国家筛选','importanceFilter':'事件重要性',
            'grouping':'分组方式','blockSize':'区块大小指标','blockColor':'区块颜色指标','dataSource':'数据集',
            'displayMode':'展示模式','showToolbar':'显示工具栏','backgroundColor':'背景颜色',
            'colorTheme':'组件主题','theme':'组件主题','locale':'组件语言','isTransparent':'透明背景',
            'showIntervalTabs':'显示周期标签','exchange':'交易所','market':'市场','interval':'周期',
            'symbol':'标的代码','studies':'技术指标','watchlist':'观察列表','compareSymbols':'对比标的'}
    fields=[]
    for key,value in contract['fields'].items():
        if key=='interval':continue  # Uses the component-specific period control.
        field=dict(key=key,label=labels.get(key,key),scope='config',default=value)
        if key in {'width','height'}:field['type']='text'
        elif isinstance(value,bool):field['type']='boolean'
        elif isinstance(value,(dict,list)) or value is None:field['type']='json'
        elif isinstance(value,(int,float)):field.update(type='number',step='any')
        else:field['type']='text'
        fields.append(field)
    fields.append(dict(key='followTheme',label='跟随应用主题',type='boolean',default=True))
    return dict(version=1,renderer='trading-view-chart',fields=fields,fullConfigEditor=True,
                sourceUrl=contract['sourceUrl'],additionalProperties=True)


def generation_catalogue() -> list[dict]:
    """The planner can compose a data source with these existing renderers.

    Only static, registered component metadata crosses this boundary: no model
    supplied scripts, paths, HTML or endpoint URLs are accepted as capabilities.
    """
    library = [_attach_settings(item) for item in json.loads((ROOT / 'app/static/widget-catalog.json').read_text())]
    from app.widget_library import renderer
    from app.widget_library import ADVANCED_CHART_INTERVALS, TECHNICAL_ANALYSIS_INTERVALS
    tradingview=renderer().CATALOG
    for item in library:
        if item.get('provider')=='TradingView' and item.get('widget') in tradingview:
            contract=renderer().settings_contract(item['widget'])
            item['configDefaults']=contract['defaults']
            item['configExtraKeys']=['width','height','locale','isTransparent']
            item['configAdditionalProperties']=True
            item['configFields']=contract['fields']
            item['settingsSchema']=_tradingview_settings(item['widget'],contract)
            periods={'advanced-chart':ADVANCED_CHART_INTERVALS,'technical-analysis':TECHNICAL_ANALYSIS_INTERVALS}.get(item['widget'])
            if periods and not item.get('preset'):
                item['supportedIntervals']=sorted(periods)
    hidden = []
    for stem, title in GENERIC_TITLES.items():
        schema = ROOT / f'app/skills/generic-chart/schemas/{stem}.schema.json'
        script = ROOT / f'app/skills/generic-chart/scripts/{stem}.py'
        if not schema.is_file() or not script.is_file():
            continue
        contract = json.loads(schema.read_text())
        hidden.append({
            'id': 'generic-' + stem, 'title': title, 'provider': 'generic',
            'skill': 'generic-chart', 'script': stem + '.py',
            'description': contract.get('purpose', title), 'inputMode': 'data',
            'requiresDataSource': True, 'libraryVisible': False,
            'width': 6, 'height': 18,
        })
    hidden.append({
        'id': 'streamviz', 'title': 'StreamVis 可视化组件', 'provider': 'streamviz',
        'skill': 'streamviz', 'script': 'render_streamviz.py', 'inputMode': 'data',
        'description': '基于已核实的数据生成交互式可视化，可用于比较、时间线、流程或自定义组件。',
        'requiresDataSource': True, 'libraryVisible': False, 'width': 12, 'height': 22,
    })
    return library + hidden
