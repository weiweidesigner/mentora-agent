import json
from types import SimpleNamespace
from pathlib import Path
from app import main
from app.jev_kline_annotations import normalize_kline_annotations


def run_fixture(tmp_path):
    rows=[{'time':1780000000+i*86400,'open':100+i,'high':102+i,'low':99+i,'close':101+i,'volume':1000} for i in range(30)]
    path=tmp_path/'payload.json'
    path.write_text(json.dumps({'period':'1d','data':rows,'props':{'code':'JPM','dataType':'1d','ma':[20,50,200]}}))
    return SimpleNamespace(code='JPM',selected=SimpleNamespace(filename='kline.py'),payload_path=path,html_path=tmp_path/'chart.html'),rows


def test_host_delegates_selection_to_jev_without_a_second_prose_model(tmp_path,monkeypatch):
    run,rows=run_fixture(tmp_path)
    monkeypatch.setattr(main,'wants_model_derived_chart_annotation',lambda q:True)
    monkeypatch.setattr(main,'infer_symbol_from_question',lambda q:'JPM')
    monkeypatch.setattr(main,'deterministic_52_week_extrema_annotation',lambda *args:None)
    monkeypatch.setattr(main,'html_lang_for_question',lambda q:'zh-CN')
    monkeypatch.setattr(main,'model_api_key',lambda: (_ for _ in ()).throw(AssertionError('legacy model must not run')))
    captured={}
    class Router:
        def plan_kline_annotations(self,**kw):
            captured.update(kw)
            marks=normalize_kline_annotations([{'type':'horizontal','price':120,'time':rows[-1]['time'],'text':'支撑'}],symbol=kw['symbol'],period=kw['period'],ohlcv=kw['ohlcv'])
            return SimpleNamespace(annotations=marks,mark_strategy='threshold-reference',confidence=.9)
    monkeypatch.setattr(main,'JevVisualizationRouter',Router)
    result=main.infer_model_kline_annotations('JPM K线标记支撑位',[run])
    assert captured['symbol']=='JPM' and captured['period']=='1d' and len(captured['ohlcv'])==30
    assert result[0]['source']=='jev-kline-plan' and result[0]['color']=='#fb923c'


def test_host_writes_selected_native_points_and_period_to_renderer(tmp_path,monkeypatch):
    run,rows=run_fixture(tmp_path)
    monkeypatch.setattr(main,'wants_model_derived_chart_annotation',lambda q:True)
    mark={'symbol':'JPM','type':'segment','period':'1d','points':[{'time':rows[2]['time'],'price':101},{'time':rows[-1]['time'],'price':120}],'price':101,'time':rows[2]['time'],'text':'趋势线','color':'#f472b6','source':'jev-kline-plan'}
    monkeypatch.setattr(main,'execute_skill_command',lambda **kw:SimpleNamespace(returncode=0,timed_out=False,stdout='',stderr=''))
    result=main.apply_model_kline_annotations('JPM K线标记趋势线',SimpleNamespace(chart_annotations=(mark,)),[run],None)
    assert result[0]['ok']
    applied=json.loads(run.payload_path.read_text())['props']['annotations'][0]
    assert applied['period']=='1d' and applied['type']=='segment' and len(applied['points'])==2
    assert applied['source']=='jev-kline-plan' and applied['color']=='#f472b6'
