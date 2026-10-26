import json
from types import SimpleNamespace

from app import main
from app.jev_kline_annotations import CATALOG
from test_jev_kline_annotations import run_fixture


def test_host_uses_component_v2_catalog_and_recognizes_native_requests():
    assert CATALOG['version'] == 2
    assert main.requested_native_kline_annotation_type('请在JPM K线上画斐波那契回撤') == 'fib-retracement'
    assert main.wants_model_derived_chart_annotation('请在JPM K线上画回归通道')


def test_renderer_and_jev_use_the_same_complete_drawing_contract():
    from app.artifact_upgrades import _native_kline
    contract=_native_kline().component_schema()['annotationContract']
    assert len(contract['supportedTypes'])==43
    for key in ('version','supportedTypes','aliases','typeDefinitions','semantics','unsupportedTypes'):
        assert contract[key]==CATALOG[key],key


def test_host_preserves_native_drawing_style_and_fib_palette(tmp_path, monkeypatch):
    run, rows = run_fixture(tmp_path)
    monkeypatch.setattr(main, 'wants_model_derived_chart_annotation', lambda q: True)
    monkeypatch.setattr(main, 'execute_skill_command', lambda **kw: SimpleNamespace(returncode=0,timed_out=False,stdout='',stderr=''))
    mark = {'symbol':'JPM','type':'fib-retracement','period':'1d','source':'jev-kline-plan',
            'points':[{'time':rows[2]['time'],'price':101},{'time':rows[-1]['time'],'price':120}],
            'time':rows[2]['time'],'price':101,'text':'Observed range',
            'lineWidth':3,'lineStyle':'dotted','levels':[0,.5,1],'levelColors':['#123456','#abcdef','#456789'],
            'fillOpacity':.2,'extendRight':True}
    result = main.apply_model_kline_annotations('画斐波那契回撤',SimpleNamespace(chart_annotations=(mark,)),[run],None)
    assert result[0]['ok']
    applied = json.loads(run.payload_path.read_text())['props']['annotations'][0]
    for key in ('lineWidth','lineStyle','levels','levelColors','fillOpacity','extendRight','points'):
        assert applied[key] == mark[key]
    assert 'color' not in applied


def test_host_does_not_drop_an_explicit_mark_set_before_jev(tmp_path, monkeypatch):
    run, rows = run_fixture(tmp_path)
    monkeypatch.setattr(main,'wants_model_derived_chart_annotation',lambda q:True)
    proposals=[{'symbol':'JPM','type':'horizontal-line','period':'1d','time':rows[-1]['time'],'price':110+i,'text':f'Level {i}'} for i in range(10)]
    assert len(main.normalize_model_chart_annotations(proposals,'全部标记',[run])) == 10
