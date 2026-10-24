import importlib.util
import json
from pathlib import Path
import subprocess
import sys

from app.pine_skill import capability

ROOT=Path(__file__).resolve().parents[1]
CODE='//@version=5\nindicator("Skill",overlay=true)\nplot(ta.sma(close,2),title="MA2",color=color.orange)'
ROWS=[dict(time=1735689600000+i*86400000,open=10+i,high=12+i,low=9+i,close=11+i,volume=1000) for i in range(5)]


def test_agent_registered_execution_and_kline_consumer(tmp_path):
    # User-independent fixtures, never market evidence. Registered output stays
    # under outputs/ per the host runner contract.
    import tempfile
    with tempfile.TemporaryDirectory(prefix='pine-skill-test-',dir=ROOT/'outputs') as folder:
        folder=Path(folder);payload=folder/'input.json';result=folder/'lines.json';code=folder/'indicator.pine'
        payload.write_text(json.dumps(dict(operation='evaluate',code=CODE,rows=ROWS,period='1d')))
        run=subprocess.run([sys.executable,'app/skill_runner.py','execute','--script','pine_script.py','--','--payload',str(payload),'--output',str(result),'--code-output',str(code)],cwd=ROOT,text=True,capture_output=True,timeout=20)
        assert run.returncode==0,run.stdout+run.stderr
        receipt=json.loads(run.stdout);assert receipt['ok'] and receipt['capability']=='pine_script'
        assert len(receipt['artifacts'])==2 and code.read_text()==CODE+'\n'
        spec=importlib.util.spec_from_file_location('composition_kline',ROOT/'app/skills/business-chart-recall/scripts/kline.py')
        kline=importlib.util.module_from_spec(spec);spec.loader.exec_module(kline)
        chart={'type':'kline','props':{'code':'FIXTURE','dataType':'1d','availablePeriods':['1d'],'pineOverlays':[json.loads(result.read_text())]},'dataByPeriod':{'1d':ROWS}}
        html=kline.render_document(chart)
        assert 'pineEmbeddedRaw' in html and '"pineOverlays": [{' in html
        chart['dataByPeriod']['1d']=[dict(r,volume=r['volume']+1) for r in ROWS]
        import pytest
        with pytest.raises(ValueError,match='OHLCV'):kline.render_document(chart)


def test_pine_source_is_a_deliverable_without_html_permission(tmp_path):
    from app.file_artifacts import collect_file_artifacts
    source=tmp_path/'indicator.pine';source.write_text(CODE)
    files,_=collect_file_artifacts('导出Pine代码',f'[[AIME_FILE:{source}]]',[],tmp_path,tmp_path)
    assert files[0]['type']=='PINE'


def test_registered_code_export_cannot_escape_outputs(tmp_path):
    result=subprocess.run([sys.executable,'app/skill_runner.py','execute','--script','pine_script.py','--','--operation','validate','--code-output',str(tmp_path/'outside.pine')],cwd=ROOT,text=True,capture_output=True,timeout=10)
    assert result.returncode!=0 and 'outputs/' in result.stdout
    assert not (tmp_path/'outside.pine').exists()
