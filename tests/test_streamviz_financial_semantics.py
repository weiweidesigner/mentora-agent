import importlib.util
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sv_financial_renderer',ROOT/'app/skills/streamviz/scripts/render_streamviz.py')
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)

@pytest.mark.parametrize('display,direction', [('+1.70%','up'),('-2.48%','down'),('−2.48%','down'),('0%','flat'),('-0.00%','flat')])
def test_financial_rankings_preserve_values_and_bind_direction(display,direction):
    page=renderer.render(dict(financialMarket='CN',blocks=[dict(type='rankings',items=[dict(label='行业',value=display)])]))
    soup=BeautifulSoup(page,'html.parser');node=soup.select_one('.sv-rank strong')
    assert node.text==display
    assert node.select_one('[data-sv-direction]')['data-sv-direction']==direction
    assert soup.select_one('main')['data-financial-market']=='CN'

def test_unknown_percentages_and_status_are_not_financial_changes():
    page=renderer.render(dict(financialMarket='CN',metrics=[dict(label='参与率',value='80.0%'),dict(label='置信度',value='34.72%')],status=[dict(label='正常',tone='success')]))
    soup=BeautifulSoup(page,'html.parser')
    assert not soup.select('[data-sv-direction]')
    assert soup.select_one('.sv-chip--success').text=='正常'

def test_direction_zero_override_and_column_selection():
    page=renderer.render(dict(financialMarket='CN',metrics=[dict(label='收益',value='显示值',change=0),dict(label='回报',value='-2%',direction='up')],
        blocks=[dict(type='table',financialMarket='US',columns=['名称&代码','涨跌幅','价格'],financialColumns=['涨跌幅'],rows=[{'名称&代码':'QQQ','涨跌幅':-2,'价格':100}])]))
    soup=BeautifulSoup(page,'html.parser')
    assert [x['data-sv-direction'] for x in soup.select('.sv-metric [data-sv-direction]')]==['flat','down']
    assert [x['data-sv-direction'] for x in soup.select('table [data-sv-direction]')]==['down']
    assert soup.select('td')[0].text=='QQQ' and soup.select('td')[2].text=='100'
    assert soup.select_one('.sv-table')['data-financial-market']=='US'
    assert soup.select_one('th').text=='名称&代码'

def test_local_market_override_and_custom_html_metadata():
    page=renderer.render(dict(financialMarket='CN',metrics=[dict(label='US',value='+2%',financialMarket='US')]))
    soup=BeautifulSoup(page,'html.parser')
    assert soup.select_one('.sv-metric [data-financial-market]')['data-financial-market']=='US'
    custom=renderer.render(dict(financialMarket='HK',html='<b data-sv-direction="down">-1%</b>'))
    assert 'data-financial-market="HK"' in custom and 'data-sv-financial-semantics' in custom
