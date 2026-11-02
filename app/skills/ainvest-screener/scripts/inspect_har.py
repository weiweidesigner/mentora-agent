#!/usr/bin/env python3
"""Extract only the confirmed read-only screener endpoint from a local HAR; never replay."""
import argparse,base64,datetime as dt,json
from pathlib import Path
ENDPOINT='https://extquote.ainvest.com/index_api/indicator/v2/snapshot'
def extract(path):
 rows=[]
 for entry in json.loads(Path(path).read_text())['log']['entries']:
  req=entry['request'];res=entry['response']
  if req['url']!=ENDPOINT or req['method']!='POST':continue
  body=json.loads(req.get('postData',{}).get('text','{}'));content=res.get('content',{});text=content.get('text','')
  if content.get('encoding')=='base64':text=base64.b64decode(text).decode()
  try:response=json.loads(text)
  except (ValueError,TypeError):response=None
  rows.append({'captured_at':entry.get('startedDateTime'),'method':'POST','endpoint':ENDPOINT,'http_status':res['status'],'request':body,'response':response})
 return {'data_mode':'browser_capture','har':str(Path(path).resolve()),'read_endpoint':ENDPOINT,'count':len(rows),'calls':rows}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('har',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--request-index',type=int);a=p.parse_args();result=extract(a.har)
 if a.request_index is not None:
  if not 0<=a.request_index<len(result['calls']):p.error('request-index out of range')
  row=result['calls'][a.request_index];data=(row.get('response') or {}).get('data',{});result={**{k:v for k,v in row.items() if k!='response'},'data_mode':'browser_capture','page':data.get('page'),'indicator_metadata':data.get('indicator'),'rows':data.get('data',[])}
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'ok':True,'output':str(a.output.resolve()),'data_mode':'browser_capture','count':len(result.get('calls',result.get('rows',[])))},ensure_ascii=False))
if __name__=='__main__':main()
