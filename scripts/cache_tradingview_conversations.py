"""Publish only accepted, completed conversations; never author replacement answers."""
from __future__ import annotations
import argparse,datetime,hashlib,json,re
from pathlib import Path
from collections import Counter
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
CASE_ROOT=ROOT/'app/static/cases/inspiration'
def sha(data):return hashlib.sha256(data).hexdigest()
def clean(text):
 text=re.sub(r'(?i)(?:sk-[A-Za-z0-9_-]{15,}|Bearer\s+[A-Za-z0-9._-]{16,})','[redacted]',str(text))
 text=re.sub(r'/(?:Users|home)/[^\s"\'<>]+','[local-file]',text)
 return text

def observation_text(value):
 if isinstance(value,str):
  try:return observation_text(json.loads(value))
  except (ValueError,TypeError):
   # Some Harness events JSON-escape the entire result without outer quotes.
   if value.startswith(('{\\"','[\\"')):
    try:return observation_text(json.loads('"'+value.replace('\n','\\n')+'"'))
    except (ValueError,TypeError):pass
   return value
 if isinstance(value,list):return '\n'.join(observation_text(item) for item in value)
 if isinstance(value,dict):
  if value.get('type')=='text':return str(value.get('text') or '')
  for key in ('message','content','result','output'):
   if key in value:return observation_text(value[key])
  return json.dumps(value,ensure_ascii=False)
 return str(value or '')

def observation_failed(value):
 if isinstance(value,str):
  try:return observation_failed(json.loads(value))
  except (ValueError,TypeError):return bool(re.search(r'(?:Exit code:|exit_code[\"\s:]+|EXIT=)\s*[1-9]\d*',value))
 if isinstance(value,list):return any(observation_failed(item) for item in value)
 if isinstance(value,dict):
  if value.get('isError') is True:return True
  if any(isinstance(value.get(key),int) and value[key]!=0 for key in ('exit_code','exitCode')):return True
  return any(observation_failed(v) for v in value.values())
 return False

def cache_one(folder,row):
 accepted=json.loads((folder/'accepted.json').read_text())
 meta=json.loads((folder/'metadata.json').read_text())
 raw=(folder/'final.json').read_bytes();final=json.loads(raw)
 assert final.get('agentRunId') and final['agentRunId']==accepted['agentRunId']
 assert row['widget'] in meta['widgets']
 raw_events=(folder/'events.jsonl').read_bytes();events=[json.loads(line) for line in raw_events.splitlines() if line.strip()]
 assert not any(e['event']=='error' for e in events),'Stream ended with an error'
 for event in events:
  if event['event']!='tool_step' or event['data'].get('phase')!='started':continue
  for param in event['data'].get('params') or []:
   try:arguments=json.loads(param)
   except (ValueError,TypeError):continue
   if isinstance(arguments,dict):
    command=str(arguments.get('command') or arguments.get('cmd') or '')
    assert not re.search(r'(?:^|\s)--sample(?:\s|$)',command),'Sample generation is not accepted as a real case'

 final_event=next(e['data'] for e in reversed(events) if e['event']=='final')
 assert final_event==final,'Final answer must be the original SSE result'
 destination=CASE_ROOT/row['id'];destination.mkdir(exist_ok=True)
 replacements={};artifacts=[];hashes=[];expected=False
 for artifact in final.get('reportArtifacts') or []:
  name=Path(artifact['url'].split('?')[0]).name;source=folder/name
  document=source.read_text()
  match=re.search(r'<script\b[^>]*\bid=["\']tv-config["\'][^>]*>(.*?)</script>',document,re.S)
  if match and json.loads(match.group(1)).get('widget')==row['widget']:expected=True
  # Asset relocation is the only change to the original generated HTML.
  assert not re.search(r'(?i)sk-[A-Za-z0-9_-]{15,}|Bearer\s+[A-Za-z0-9._-]{16,}',document),'Credential-like text in artifact'
  assert not re.search(r'/Users/|/home/ubuntu/',document),'Machine paths must be removed by the generator before acceptance'
  (destination/name).write_bytes(source.read_bytes())
  path=f'case:inspiration/{row["id"]}/{name}';url=f'/static/cases/inspiration/{row["id"]}/{name}'
  replacements[artifact['path']]=path;replacements[artifact['url']]=url
  artifacts.append({**artifact,'path':path,'url':url})
  hashes.append({'name':name,'sha256':sha(source.read_bytes())})
 assert expected,'Expected TradingView widget must exist in original artifacts'
 answer=dict(final)
 for key in ['interpretation','htmlUrl','reportUrl']:
  if answer.get(key):
   for old,new in replacements.items():answer[key]=answer[key].replace(old,new)
 answer['reportArtifacts']=artifacts;answer['payloadUrl']=None
 answer=json.loads(clean(json.dumps(answer,ensure_ascii=False)))
 assert answer['interpretation']
 starts={};steps=[]
 for event in events:
  if event['event']!='tool_step':continue
  data=event['data'];call=data.get('callId')
  if data.get('phase')=='started':starts[call]=event;continue
  if data.get('phase')!='completed':continue
  observation=observation_text(data.get('observation') or '')
  if re.search(r"(?i)(?:api_key|authorization|cookie)[\"']?\s*[=:]",observation):observation='[凭据相关输出已隐藏]'
  detail=clean(observation)
  step={'title':clean(data.get('thoughtSummary') or data.get('tool') or data.get('script') or 'Tool'),'detail':detail[:1600],'tool':data.get('tool') or data.get('script'),'state':'error' if data.get('isError') or observation_failed(data.get('observation')) else 'done','elapsedMs':event['elapsedMs'],'callId':call,'truncated':len(detail)>1600}
  if call in starts:step['durationMs']=max(0,event['elapsedMs']-starts[call]['elapsedMs'])
  steps.append(step)
 assert steps,'No completed tool events'
 started=datetime.datetime.fromisoformat(meta['startedAt']);elapsed=events[-1]['elapsedMs'];ended=started+datetime.timedelta(milliseconds=elapsed);started_ms=round(started.timestamp()*1000)
 cached={'question':meta['question'],'cachedAt':ended.isoformat(),'answer':answer,
  'activity':{'label':'实际执行记录','steps':steps,'startedAt':started_ms,'endedAt':started_ms+elapsed,'elapsedMs':elapsed,'durationSource':'measured-chat-stream','detailSource':'actual-sse-tool-events','stages':[{'name':'Mentora 实际对话生成','startedAt':started_ms,'endedAt':started_ms+elapsed,'elapsedMs':elapsed}]},
  'provenance':{'generation':'actual-mentora-chat-stream','renderer':'trading_view_chart.py','agentRunId':final['agentRunId'],'studioSessionId':final.get('studioSessionId'),'sessionId':meta['sessionId'],'widget':row['widget'],'sample':False,'sourceAnswerSha256':sha(final['interpretation'].encode()),'sourceFinalSha256':sha(raw),'sourceEventsSha256':sha(raw_events),'sourceArtifacts':hashes,'cacheScope':'actual-conversation-and-generated-artifacts','displayEdits':['artifact URLs relocated; credential and machine-path redaction only']}}
 (destination/'conversation.json').write_text(json.dumps(cached,ensure_ascii=False,indent=2)+'\n')
 row.update(question=meta['question'],generation='actual-mentora-chat-stream',cachedDate=ended.date().isoformat())
 # Excerpts are taken from the actual answer, never generated independently.
 for para in re.split(r'\n\s*\n',answer['interpretation']):
  text=re.sub(r'\[\[AIME_[^\]]+\]\]','',para);text=re.sub(r'[*`#>]','',text);text=re.sub(r'\s+',' ',text).strip()
  if len(text)>30 and not re.search(r'outputs/|payload\.json|\.py\b|\[local-file\]',text):row['preview']=text[:145];break
 print('CACHED',row['widget'],final['agentRunId'],len(steps),'tools',len(artifacts),'artifacts',flush=True)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--run-dir',type=Path,required=True);args=parser.parse_args()
 path=CASE_ROOT/'manifest.json';manifest=json.loads(path.read_text());rows=[r for r in manifest['cases'] if r.get('tool')=='TradingViewChart']
 missing=[r['widget'] for r in rows if not (args.run_dir/r['widget']/'accepted.json').exists()]
 if missing:raise SystemExit('Not publishing incomplete batch: '+', '.join(missing))
 for row in rows:cache_one(args.run_dir/row['widget'],row)
 manifest['cachedAt']=datetime.datetime.now(ZoneInfo('Asia/Shanghai')).isoformat()
 counts=Counter(row['category'] for row in manifest['cases']);manifest['counts']={**counts,'total':len(manifest['cases'])}
 manifest['version']=max(7,manifest.get('version',0))
 path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
