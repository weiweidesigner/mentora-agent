import json
import subprocess
from pathlib import Path
from app import main as m


def test_registered_tool_and_host_execution(tmp_path):
    component=m.ALLOWED_COMPONENTS_BY_FILE['trading_view_chart.py']
    selected=m.SkillScript(component.key,component.label,component.filename,component.description)
    assert component.label=='TradingViewChart'
    assert m.skill_name_for_script_filename(selected.filename)=='trading-view-chart'
    out=tmp_path/'tv.html';payload=tmp_path/'tv.json'
    command=m.build_script_command(selected,m.script_path_for_filename(selected.filename),'NASDAQ:AAPL',out,payload,['--widget','advanced-chart'],'用 TradingView 看苹果日线')
    subprocess.run(command,check=True,capture_output=True)
    result=json.loads(payload.read_text())
    assert result['config']['symbol']=='NASDAQ:AAPL'
    assert result['config']['locale']=='zh_CN'
    assert out.stat().st_size>1000


def test_group_widget_does_not_inherit_scalar_symbol(tmp_path):
    c=m.ALLOWED_COMPONENTS_BY_FILE['trading_view_chart.py']
    selected=m.SkillScript(c.key,c.label,c.filename,c.description)
    command=m.build_script_command(selected,m.script_path_for_filename(c.filename),'SPX',tmp_path/'map.html',tmp_path/'map.json',['--widget','stock-heatmap'],'TradingView heatmap')
    assert '--symbol' not in command
    subprocess.run(command,check=True,capture_output=True)
    assert json.loads((tmp_path/'map.json').read_text())['widget']=='stock-heatmap'
