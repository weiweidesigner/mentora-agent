import copy
import json
from pathlib import Path
import pytest
from app.chart_data_contract import prepare, validate, digest
from app.chart_composition import load_charts, compose


def setup_chart(tmp_path, *, missing=False):
    folder=tmp_path/'outputs/generated';folder.mkdir(parents=True)
    source=tmp_path/'outputs/source.json'
    records=[{'period':'20220317','v':0.5},{'period':'20230727','v':None if missing else 5.5},{'period':'20260917','v':4}]
    source.write_text(json.dumps({'series':records,'source':{'provider':'fixture'}}))
    payload={'type':'line','xField':'date','yField':'rate','xScale':'time', 'rightAxis':{'min':0,'max':6},
             'dataSource':{'path':'outputs/source.json','recordsPath':['series'],'fields':{'date':'period','rate':'v'},'dateFormats':{'date':'%Y%m%d'},'sortBy':'date'}}
    spec=tmp_path/'outputs/spec.json';spec.write_text(json.dumps(payload))
    script=tmp_path/'app/skills/generic-chart/scripts/line_chart.py'
    args=['--payload',str(spec),'--output',str(folder/'chart.html')]
    args,expected=prepare(script,args,tmp_path)
    return args,expected,source


def write_config(expected, mutate=None):
    config=copy.deepcopy(expected['payload'])
    config['series']=[{'field':'rate','axis':'right'}]
    if mutate:mutate(config)
    expected['output'].write_text('<html><head></head><body><script>const config = '+json.dumps(config)+';</script></body></html>')


def test_file_handoff_maps_dates_without_copying_numbers_or_filling(tmp_path):
    args,expected,source=setup_chart(tmp_path,missing=True)
    assert expected['rows']==[{'date':'2022-03-17','rate':0.5},{'date':'2023-07-27','rate':None},{'date':'2026-09-17','rate':4}]
    assert expected['payload']['missingValuePolicy']=='gap'
    assert expected['source']['sha256']==digest(source)
    assert json.loads(source.read_text())['series'][1]['v'] is None
    assert 'dataSource' not in json.loads(Path(args[1]).read_text())
    write_config(expected)
    proof,path=validate(expected)
    assert proof['series']['rate']['missingCount']==1
    assert proof['series']['rate']['last']['value']==4
    assert path.is_file()


@pytest.mark.parametrize('mutation',[
    lambda c:c['data'].pop(),
    lambda c:c['data'][1].update(rate=6.1),
    lambda c:c['data'].reverse(),
    lambda c:c['rightAxis'].update(max=4),
])
def test_source_value_loss_reordering_and_clipped_axes_fail(tmp_path,mutation):
    _,expected,_=setup_chart(tmp_path)
    write_config(expected,mutation)
    with pytest.raises(ValueError,match='Chart'):
        validate(expected)
    assert not expected['output'].with_suffix('.chart.json').exists()


def test_null_cannot_be_filled_with_previous_observation(tmp_path):
    _,expected,_=setup_chart(tmp_path,missing=True)
    write_config(expected,lambda c:c['data'][1].update(rate=0.5))
    with pytest.raises(ValueError,match='differ'):
        validate(expected)


def test_only_verified_unmodified_charts_can_be_composed(tmp_path):
    _,expected,_=setup_chart(tmp_path)
    write_config(expected);proof,_=validate(expected)
    charts=load_charts([str(expected['output'])],tmp_path/'outputs/generated')
    result=compose('<section><div data-chart-id="chart-1"></div></section>',charts)
    assert 'iframe data-verified-chart="chart-1"' in result
    assert 'srcdoc=' in result and '&quot;rate&quot;: 5.5' in result
    for bad in ['<div></div>','<div data-chart-id="chart-1"></div>'*2,'<div data-chart-id="chart-1"></div><div data-chart-id="chart-2"></div>']:
        with pytest.raises(ValueError):compose(bad,charts)
    expected['output'].write_text('modified')
    with pytest.raises(ValueError,match='stale'):
        load_charts([str(expected['output'])],tmp_path/'outputs/generated')


def test_file_handoff_rejects_outside_outputs_and_numeric_strings(tmp_path):
    args,expected,source=setup_chart(tmp_path)
    path=Path(args[1]);payload=expected['payload'];payload['data'][0]['rate']='0.5';path.write_text(json.dumps(payload))
    script=tmp_path/'app/skills/generic-chart/scripts/line_chart.py'
    with pytest.raises(ValueError,match='finite numbers'):
        prepare(script,args,tmp_path)
    with pytest.raises(ValueError,match='outputs'):
        prepare(script,['--payload',str(tmp_path/'outside.json')],tmp_path)


def test_native_streamviz_embeds_verified_chart_slots(tmp_path):
    from app.native_streamviz import stream_native_widget
    from types import SimpleNamespace
    _,expected,_=setup_chart(tmp_path)
    write_config(expected);validate(expected)
    captured=[]
    def create(**kwargs):
        captured.append(kwargs)
        arguments=json.dumps({'title':'Layout','widget_code':'<section><div data-chart-id="chart-1"></div></section>'})
        return iter([{'choices':[{'delta':{'tool_calls':[{'index':0,'id':'v','function':{'name':'visualize_show_widget','arguments':arguments}}]}}]}])
    client=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    events=list(stream_native_widget('Compose verified chart',tmp_path/'outputs/generated',evidence='facts',chart_artifacts=[str(expected['output'])],client_override=client,model_override='fixture'))
    final=next(data for kind,data in events if kind=='visualization' and data.get('final'))
    assert final['composedCharts'] is True
    assert 'data-chart-id="chart-1"' in captured[0]['messages'][1]['content']
    saved=tmp_path/'outputs/generated'/Path(final['htmlUrl']).name
    assert 'data-verified-chart="chart-1"' in saved.read_text()
    assert '&quot;rate&quot;: 5.5' in saved.read_text()


@pytest.mark.parametrize('name,kind',[('line_chart','line'),('group_line','group-line'),('bar_chart','bar'),('grouped_bar','grouped-bar'),('bar_line','bar-line')])
def test_concrete_renderers_accept_file_handoff_and_preserve_values(tmp_path,name,kind):
    import subprocess,sys
    args,expected,source=setup_chart(tmp_path)
    # Build an explicit mapping spec; numeric rows stay in the source file.
    spec=tmp_path/'outputs/spec.json'
    payload={'type':kind,'xField':'date','yField':'rate','dataSource':{'path':'outputs/source.json','recordsPath':['series'],'fields':{'date':'period','rate':'v','other':'v'}}}
    if name in ('group_line','grouped_bar'):
        payload['series']=[{'field':'rate','axis':'right'},{'field':'other','axis':'right'}]
    if name=='bar_line':
        payload['columnSeries']=[{'field':'rate','axis':'left'}]
        payload['lineSeries']=[{'field':'other','axis':'right'}]
    spec.write_text(json.dumps(payload))
    script=Path(__file__).resolve().parents[1]/'app/skills/generic-chart/scripts'/(name+'.py')
    args,expected=prepare(script,['--payload',str(spec),'--output',str(tmp_path/'outputs/generated/chart.html')],tmp_path)
    result=subprocess.run([sys.executable,str(script),*args],capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    proof,_=validate(expected)
    assert proof['rowCount']==3 and proof['series']['rate']['max']==5.5


def test_pie_source_file_preserves_labels_and_amounts(tmp_path):
    import subprocess,sys
    _,expected,_=setup_chart(tmp_path)
    spec=tmp_path/'outputs/spec.json'
    spec.write_text(json.dumps({'type':'pie','dataSource':{'path':'outputs/source.json','recordsPath':['series'],'fields':{'label':'period','value':'v'}}}))
    script=Path(__file__).resolve().parents[1]/'app/skills/generic-chart/scripts/pie.py'
    args,expected=prepare(script,['--payload',str(spec),'--output',str(tmp_path/'outputs/generated/chart.html')],tmp_path)
    result=subprocess.run([sys.executable,str(script),*args],capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    proof,_=validate(expected)
    assert proof['rowCount']==3 and proof['series']['value']['max']==5.5


@pytest.mark.parametrize('scale',['linear','unsupported'])
def test_invalid_continuous_x_geometry_fails_before_delivery(tmp_path,scale):
    _,expected,_=setup_chart(tmp_path)
    write_config(expected,lambda c:c.update(xScale=scale))
    with pytest.raises(ValueError,match='x-axis|xScale'):
        validate(expected)
