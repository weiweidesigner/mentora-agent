import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT=Path(__file__).resolve().parents[1]


def load(path,name):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def test_all_enabled_ainvest_business_components_are_listed_and_executable():
    module=load('scripts/audit_widget_catalog.py','widget_catalog_audit')
    result=module.audit()
    assert result['supported']==result['listed']
    assert not any(result[k] for k in ['missing','extra','duplicateIds','unregistered','missingSchemas'])
    library=json.loads((ROOT/'app/static/widget-catalog.json').read_text())
    assert not any(c['category']=='图表' for c in library)
    assert {c['category'] for c in library if c['provider']=='TradingView' and c['id'] in {'tv-advanced-chart','tv-mini-chart'}}=={'行情走势'}
    macro=next(c for c in library if c['id']=='ainvest-macro-data')
    assert macro['outputMode']=='data-visualization' and macro['allowEmptySymbols']
    assert {'read_macro_indicator_data.py','read_macro_relations.py'}<=set(macro['dataCapabilities'])


def raw_history():
    values={'macro_symbol':'AUINTR','macro_country_code':'AU','macro_country_name':'Australia',
            'macro_indicator_code':'INTR','macro_indicator':'Interest rate','macro_unit':'%',
            'macro_frequency':'Monthly','macro_observation_period':'2026-10','macro_last':4.2}
    return {'symbol':'AUINTR',
            'snapshot':{'status_code':0,'data':{'indicator':[{'id':k} for k in values],
                'data':[{'symbol_code':'AUINTR','value':[{'v':v} for v in values.values()]}]}},
            'series':{'status_code':0,'data':{'indicator':[{'id':'macro_last'}],
                'data':[{'symbol_code':'AUINTR','value':[{'value':[
                    {'t':-1000,'v':-0.2,'macro_observation_period':'1969'},
                    {'t':1000,'v':None,'macro_observation_period':'1970'},
                    {'t':1000,'v':4.2,'macro_observation_period':'1970'}]}]}]}}}


def test_macro_data_handoff_preserves_units_missing_values_and_duplicate_dates(tmp_path):
    module=load('app/skills/market-data/scripts/read_macro_indicator_data.py','macro_data_reader')
    path=tmp_path/'source.json';path.write_text(json.dumps(raw_history()))
    args=SimpleNamespace(country='AU',indicator='INTR',symbol=None,list_countries=False,list_indicators=False,source_input=str(path))
    data=module.read_data(args)
    assert data['rendered'] is False and 'chartType' not in data
    assert data['type']=='macro-data' and data['symbol']=='AUINTR' and data['unit']=='%'
    assert [p['v'] for p in data['history']]==[-0.2,None,4.2]
    assert [p['t'] for p in data['history']]==[-1000,1000,1000]
    assert data['source']['inputMode']=='source-input' and 'fetchedAt' not in data['source']
    args.country='US'
    with pytest.raises(ValueError,match='identity mismatch'):module.read_data(args)


def test_macro_data_source_unavailable_does_not_create_a_placeholder():
    module=load('app/skills/market-data/scripts/read_macro_indicator_data.py','macro_data_missing')
    source=SimpleNamespace(fetch_data=lambda args: {'unavailable':True},normalize=lambda raw,args: {'unavailable':True,'history':[]})
    args=SimpleNamespace(country='AU',indicator='INTR',symbol=None,list_countries=False,list_indicators=False,source_input=None)
    # A missing source identity is rejected before any chart can be rendered.
    with pytest.raises(ValueError,match='identity mismatch'):module.read_data(args,source)
