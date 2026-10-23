"""Verify native tool registration and dispatch with the installed SDK, no LLM."""
import json
import os
from pathlib import Path
import tempfile
import time
from deepseek_harness import DeepSeekHarness

root=Path(__file__).resolve().parents[2]
probe=Path(tempfile.mkdtemp(prefix='mentora-widget-probe-'))
result_file=probe/'result.json'
with DeepSeekHarness(cwd=str(root),runtime_cwd=str(probe),dsh_home=str(probe/'dsh'),
                     patches=(str(root/'app/dsh_tool_environment.cordis.yml'),str(Path(__file__).with_name('dsh_widget_probe.cordis.yml'))),
                     env={'MENTORA_PROJECT_ROOT':str(root),'MENTORA_WIDGET_PROBE_RESULT':str(result_file)}) as harness:
    deadline=time.monotonic()+40
    while not result_file.exists() and time.monotonic()<deadline:time.sleep(.1)
    assert result_file.exists(),f'No runtime result: {probe}'
    result=json.loads(result_file.read_text())
    assert 'error' not in result,result
    serialized=json.dumps(result)
    assert 'native-streamviz-' in serialized and 'Fixture' in serialized,result
    print(json.dumps({'ok':True,'nativeToolExecuted':True,'probe':str(probe)}))
