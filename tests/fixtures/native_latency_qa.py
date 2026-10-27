"""Exercise the installed SDK, model and hooks using offline synthetic tools.

Run with the SDK credentials configured in the environment:
  python tests/fixtures/native_latency_qa.py --work-dir outputs/runtime-qa \
    --baseline-plugin old-guard.cjs --candidate-plugin app/dsh_lightweight_guard.cjs

This measures the tool boundary, not end-to-end research/report latency.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import time
import uuid

SCRIPT = """import sys,json,time
from pathlib import Path
started=time.monotonic();time.sleep(0.6)
rows=[{'id':i,'value':i*2,'label':'fixture'} for i in range(1200)]
out=Path(sys.argv[sys.argv.index('--output')+1]);out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps({'rows':rows}))
Path(str(out)+'.time').write_text(json.dumps({'start':started,'end':time.monotonic()}))
print(json.dumps({'rows':rows}))
"""
PROMPT = (
    'Offline runtime test, not a market request. Use bash to execute BOTH independent '
    'deterministic fixture commands in the SAME assistant tool-call batch: '
    '(1) python3 app/skill_runner.py execute --script read_market_data.py -- '
    '--operation quote --symbols FIRST --output outputs/a.json '
    '(2) python3 app/skill_runner.py execute --script read_market_data.py -- '
    '--operation quote --symbols SECOND --output outputs/b.json . '
    'Do not inspect any files. Each command writes 1200 synthetic rows. '
    'After both results reply only done; do not inspect the output files.'
)


def measure(root: Path, plugin: Path) -> dict:
    from deepseek_harness import DeepSeekHarness
    (root/'app').mkdir(parents=True)
    (root/'outputs').mkdir()
    (root/'runtime').mkdir()
    (root/'app/skill_runner.py').write_text(SCRIPT)
    (root/'guard.cjs').write_text(plugin.read_text())
    patch=root/'patch.yml'
    patch.write_text('- insert:\n    - id: latency-guard\n      name: '+str(root/'guard.cjs')+'\n')
    events=[]
    started=time.monotonic()

    def observe(notification):
        event=(getattr(notification,'payload',{}) or {}).get('event',{})
        if event.get('type') in ('tool/call','tool/result'):
            events.append((time.monotonic()-started,event['type'],event.get('data',{})))

    with DeepSeekHarness(
        provider='deepseek-official', model='deepseek-flash', reasoning_effort='low',
        max_tokens=4096, cwd=str(root), dsh_home=str(root/'.dsh'),
        runtime_cwd=str(root/'runtime'), patches=(str(patch),),
        env={'MENTORA_PROJECT_ROOT':str(root)}, request_timeout_seconds=100,
    ) as harness:
        harness.run(PROMPT,session_id='latency-qa-'+uuid.uuid4().hex,on_notification=observe)
    calls={}; intervals=[]; sizes=[]
    for at,kind,data in events:
        if kind=='tool/call':
            calls[data['callId']]=at
        else:
            message=data.get('message',{}); cid=message.get('toolCallId')
            if cid not in calls:continue
            intervals.append((calls[cid],at))
            sizes.append(len('\n'.join(b.get('text','') for b in message.get('content',[]) if b.get('type')=='text').encode()))
    bodies=[json.loads(p.read_text()) for p in (root/'outputs').glob('*.time')]
    assert len(calls)==len(bodies)==2, 'Model must select both fixture calls'
    return dict(
        toolCalls=len(calls), observationBytes=sum(sizes),
        toolBatchWallSeconds=round(max(b for a,b in intervals)-min(a for a,b in intervals),3),
        bodiesOverlap=max(b['start'] for b in bodies)<min(b['end'] for b in bodies),
        totalSeconds=round(time.monotonic()-started,3),
    )


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir',type=Path,required=True)
    parser.add_argument('--baseline-plugin',type=Path,required=True)
    parser.add_argument('--candidate-plugin',type=Path,required=True)
    args=parser.parse_args()
    root=args.work_dir.resolve()/uuid.uuid4().hex
    before=measure(root/'before',args.baseline_plugin.resolve())
    after=measure(root/'after',args.candidate_plugin.resolve())
    print(json.dumps({'before':before,'after':after,'fixtures':str(root)},indent=2))
    assert not before['bodiesOverlap'] and after['bodiesOverlap']
    assert after['observationBytes']<before['observationBytes']/10


if __name__=='__main__':main()
