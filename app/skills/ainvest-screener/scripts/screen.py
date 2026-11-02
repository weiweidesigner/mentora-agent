#!/usr/bin/env python3
"""Read-only AInvest screener: discover fields/presets, compile conditions, query results."""
from __future__ import annotations
import argparse, copy, csv, datetime as dt, json, math, os, re, sys, uuid
from http.cookiejar import CookieJar
from urllib.parse import urlencode
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler, HTTPCookieProcessor
from urllib.error import HTTPError, URLError

ROOT=Path(__file__).resolve().parents[1]
ENDPOINT='https://extquote.ainvest.com/index_api/indicator/v2/snapshot'
SOURCES=[{'siteName':'AInvest','title':'AInvest 股票与 ETF 筛选器','url':'https://www.ainvest.com/screener/','summary':'本次通过 AInvest 筛选器指标快照接口获取；取数时间不代表交易时间。'}]

def load(name):return json.loads((ROOT/'references'/name).read_text())
def key(value):return re.sub(r'[\W_]+','',str(value).casefold())
def option_key(value):return re.sub(r'\s+',' ',str(value).strip().casefold())
class ScreenError(ValueError):pass

def number(value):
 if isinstance(value,bool):raise ScreenError('Boolean is not a numeric bound')
 if isinstance(value,(int,float)):result=value
 else:
  m=re.fullmatch(r'([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([%kmb]?)',str(value).strip(),re.I)
  if not m:raise ScreenError('Invalid numeric bound; use numbers, %, K, M or B')
  result=float(m[1])*{'':1,'%':.01,'k':1e3,'m':1e6,'b':1e9}[m[2].lower()]
 if not math.isfinite(result):raise ScreenError('Non-finite numeric bound')
 return result

def fields(asset):return load(asset+'-fields.json')
def find_field(asset,name):
 matches=[f for f in fields(asset) if key(name) in {key(f.get('key','')),key(f['label']),key(f['prompt_id'])}]
 if len(matches)!=1:raise ScreenError('Unknown/ambiguous field; inspect fields --asset '+asset)
 return matches[0]
def metric(asset,name):
 candidates=[m for m in load('indicator-dictionary.json') if asset in m['assets'] and (key(name)==key(m['id']) or any(key(name)==key(a) for a in [m['title'],*m.get('aliases',[])]))]
 # Multiple dictionary aliases may refer to the same API field.
 exact=[m for m in candidates if str(m['id'])==str(name) or m['title'].lower()==str(name).lower()]
 if exact:candidates=exact
 candidates=list({json.dumps([m['id'],m.get('attrs',{})],sort_keys=True):m for m in candidates}.values())
 if len(candidates)!=1:raise ScreenError('Unknown/ambiguous result metric; inspect metrics --asset '+asset)
 m=candidates[0];return {'id':m['id'],**({'attr':m['attrs']} if m.get('attrs') else {})},m

def prompt(fid,attr=None,op='intersect'):
 return {'op':op,'type':'prompt_id','value':[fid],**({'attr':attr} if attr else {})}
def base(asset):return {'op':'intersect','type':'block_id','value':['C3FE']} if asset=='etf' else prompt('67fca073209f225f5e6bd457')

def condition(asset,item):
 if set(item)-{'field','value','min','max','period','option'}:raise ScreenError('Unknown filter properties')
 f=find_field(asset,item['field']);typ=f['type'];p=f['prompt_id'];attr={}
 if typ in {'signal','comparison'} or 'option' in item:
  label=item.get('option',item.get('value'));options=[o for o in f['options'] if option_key(o['label'])==option_key(label)]
  if len(options)!=1:raise ScreenError('Choose an exact option from the field catalog')
  o=options[0];p=o.get('prompt_id',p);attr={k:o[k] for k in ('value','min','max','period') if k in o}
  if any(k in item for k in ('min','max','period')):raise ScreenError('An option cannot also specify bounds or period')
 elif typ=='range':
  if 'value' in item or not any(k in item for k in ('min','max')):raise ScreenError('Range filter needs min and/or max')
  attr={k:number(item[k]) for k in ('min','max') if item.get(k) is not None}
  if not attr:raise ScreenError('Range filter needs a finite bound')
  if attr.get('min',-math.inf)>attr.get('max',math.inf):raise ScreenError('Range min exceeds max')
  periods=f.get('periods',[])
  if periods:
   name=item.get('period',periods[0]['value']);period=next((v for v in periods if key(v['value'])==key(name) or key(v['label'])==key(name)),None)
   if not period:raise ScreenError('Unsupported period for '+f['label'])
   p=period['prompt_id']
  elif 'period' in item:raise ScreenError('This field does not accept a period')
  if asset=='etf':attr={"min":attr.get('min',-999999999999),"max":attr.get('max',999999999999)}
  else:attr={'min':attr.get('min'),'max':attr.get('max')}
 else:
  if any(k in item for k in ('min','max','period')):raise ScreenError('Value filter does not accept bounds/period')
  value=item.get('value');options=[o for o in f.get('options',[]) if option_key(value) in {option_key(o.get('value','')),option_key(o['label'])}]
  if len(options)==1:value=options[0].get('value',options[0]['label'])
  elif not f.get('allowCustomValue'):raise ScreenError('Unsupported value for '+f['label'])
  if not isinstance(value,(str,bool,int,float)) or value=='':raise ScreenError('Missing filter value')
  # The current web client intentionally swaps these two backend bucket labels.
  if asset=='etf' and f.get('key')=='assetSize':value={'Mega-Cap':'Large-Cap','Large-Cap':'Mega-Cap'}.get(value,value)
  attr={'value':value}
 if asset=='etf' and any(k in attr for k in ('min','max')):attr={'min':attr.get('min',-999999999999),'max':attr.get('max',999999999999),**{k:v for k,v in attr.items() if k not in {'min','max'}}}
 return f.get('key',f['prompt_id']),prompt(p,attr)

def parse_preset_query(query):
 filters=[];ranking=None
 for part in query.split(';'):
  part=part.strip()
  m=re.fullmatch(r'ETF Ranking: (.+) \(Top (\d+)\)',part)
  if m:
   label,n=m.groups();rankings=[s for s in load('etf-strategies.json') if 'ranking' in s]
   found=next((s for s in rankings if s['query'].rsplit(' (Top ',1)[0]=='ETF Ranking: '+label),None)
   if found:ranking=copy.deepcopy(found['ranking'])
   else:
    ind,meta=metric('etf',label);ranking={'indicator':ind,'order':'desc','prompt_id':None}
   ranking['limit']=int(n);continue
  m=re.fullmatch(r'ETF ([^:]+): (.+)',part)
  if not m:raise ScreenError('Unsupported preset query syntax')
  label,value=m.groups();period=None;pm=re.fullmatch(r'(.+) \(([^)]+)\)',label)
  if pm and not any(key(label) in {key(f['label']),key(f.get('key',''))} for f in fields('etf')):label,period=pm.groups()
  f=find_field('etf',label);item={'field':f.get('key',f['label'])}
  if f['type']=='range':
   bounds=re.fullmatch(r'(.+?)\s+to\s+(.+)',value,re.I)
   if not bounds:raise ScreenError('Unsupported range in source preset')
   item.update(min=bounds[1],max=bounds[2])
   if period:item['period']=period
  else:item['value']=value
  filters.append(item)
 return filters,ranking

def prepare(asset,filters=None,strategy=None,columns=None,sort=None,order='desc',offset=0,limit=40):
 if asset not in {'etf','stock'}:raise ScreenError('asset must be etf or stock')
 if not isinstance(offset,int) or offset<0 or not isinstance(limit,int) or not 1<=limit<=1000:raise ScreenError('offset >= 0 and limit 1..1000 required')
 ranking=None;applied=[];groups={}
 if strategy:
  if asset!='etf':raise ScreenError('Captured strategy catalog is ETF-only; use stock fields/metrics')
  preset=next((s for s in load('etf-strategies.json') if key(strategy) in {key(s['id']),key(s['name'])}),None)
  if not preset:raise ScreenError('Unknown preset; inspect strategies')
  applied,ranking=parse_preset_query(preset['query'])
 for item in [*applied,*(filters or [])]:
  if not isinstance(item,dict) or 'field' not in item:raise ScreenError('Each filter needs a field')
  selections=item['value'] if isinstance(item.get('value'),list) else [item.get('value')]
  if not selections:raise ScreenError('Empty value selection')
  for value in selections:
   selection={**item,**({'value':value} if 'value' in item else {})};group,p=condition(asset,selection)
   if p not in groups.setdefault(group,[]):groups[group].append(p)
 default=['55','10','199112','13','国际北美etf@Assets Under Management(Latest)'] if asset=='etf' else ['55','10','199112','13','total_market_value','pe_ttm']
 indicators=[];labels={}
 for n,name in enumerate(columns or default):
  if name=='55':ind,meta={'id':'55'},{'title':'Name','numeric':False}
  else:ind,meta=metric(asset,name)
  rid='c'+str(n);ind={**ind,'req_unique_id':rid};indicators.append(ind);labels[rid]=meta['title']
 if sort:
  sortind,meta=metric(asset,sort)
 elif ranking:sortind=ranking['indicator'];order=ranking['order']
 else:
  name='国际北美etf@Assets Under Management(Latest)' if asset=='etf' else 'total_market_value';sortind,_=metric(asset,name)
 if order not in {'asc','desc'}:raise ScreenError('order must be asc or desc')
 pos=next((i for i,x in enumerate(indicators) if x['id']==sortind['id'] and x.get('attr',{})==sortind.get('attr',{})),None)
 if pos is None:pos=len(indicators);indicators.append({**sortind,'req_unique_id':'sort'});labels['sort']='Sort value'
 return {'asset':asset,'strategy':strategy,'filters':[*applied,*(filters or [])],'base':base(asset),'groups':groups,'ranking':ranking,'request':{'indicator':indicators,'sort':[{'pos':pos,'order':order}],'page':{'begin':offset,'count':limit}},'labels':labels}

class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise ScreenError('Redirect rejected; refresh the official session')
class Client:
 def __init__(self,cookie_file=None,headers_file=None):
  self.headers={'Content-Type':'application/json','Accept':'application/json','Origin':'https://www.ainvest.com','Referer':'https://www.ainvest.com/screener/','x-auth-progid':'7047','x-auth-version':'1.0','x-auth-select-market-level':'uus:level0'}
  if headers_file:
   extra=json.loads(Path(headers_file).expanduser().read_text());allowed={'cookie','authorization','fingerprint','x-auth-udid','x-auth-token','x-auth-appname','user-agent'}
   if not isinstance(extra,dict) or any(k.lower() not in allowed or not isinstance(v,str) or '\n' in v or '\r' in v for k,v in extra.items()):raise ScreenError('Unsupported authentication header file')
   self.headers.update(extra)
  file=cookie_file or os.environ.get('AINVEST_COOKIE_FILE');cookie=Path(file).expanduser().read_text().strip() if file else os.environ.get('AINVEST_COOKIE','').strip()
  if cookie:
   if cookie.lower().startswith('cookie:'):cookie=cookie.split(':',1)[1].strip()
   if '\n' in cookie or '\r' in cookie:raise ScreenError('Cookie file must contain one header line')
   self.headers['Cookie']=cookie
   for part in cookie.split(';'):
    name,sep,value=part.strip().partition('=')
    if name=='nova_fingerPrint':self.headers['fingerprint']=value;self.headers['x-auth-udid']=value
  self.calls=[];self.jar=CookieJar();self.opener=build_opener(NoRedirect(),HTTPCookieProcessor(self.jar))
  self.access_mode='provided_session'
  if not any(k.lower() in {'cookie','authorization','x-auth-token'} for k in self.headers):self.init_visitor()
 def init_visitor(self):
  # The public webpage initializes a visitor before requesting snapshots.
  fingerprint=str(uuid.uuid4())
  req=Request('https://user.ainvest.com/auth/visitor/login',data=urlencode({'udid':fingerprint,'clientType':'WEB'}).encode(),headers={'Content-Type':'application/x-www-form-urlencoded','fingerprint':fingerprint,'Origin':'https://www.ainvest.com','Referer':'https://www.ainvest.com/'},method='POST')
  try:
   with self.opener.open(req,timeout=30) as r:response=json.loads(r.read(1000001))
  except HTTPError as e:raise ScreenError(f'Visitor initialization HTTP {e.code}; stopped without retry') from None
  except (URLError,TimeoutError,json.JSONDecodeError):raise ScreenError('Visitor initialization response unavailable') from None
  if not isinstance(response.get('data'),dict) or not {'sessionid','userid'}.issubset({c.name for c in self.jar}):raise ScreenError('Visitor initialization did not establish the expected session')
  self.headers['fingerprint']=fingerprint
  self.access_mode='anonymous_visitor' 
 def query(self,payload):
  req=Request(ENDPOINT,data=json.dumps(payload,ensure_ascii=False,allow_nan=False).encode(),headers=self.headers,method='POST')
  try:
   with self.opener.open(req,timeout=30) as r:
    raw=r.read(20000001)
    if len(raw)>20000000:raise ScreenError('Response too large; reduce page size')
    result=json.loads(raw)
  except HTTPError as e:raise ScreenError(f'Snapshot HTTP {e.code}; stopped without retry (access mode: {self.access_mode})') from None
  except (URLError,TimeoutError,json.JSONDecodeError):raise ScreenError('JSON response unavailable; stopped without retry') from None
  if result.get('status_code')!=0 or not isinstance(result.get('data'),dict):raise ScreenError('AInvest application error; no retries or guessed endpoints')
  data=result['data']
  if not isinstance(data.get('data'),list) or not isinstance(data.get('indicator'),list):raise ScreenError('Unexpected snapshot response schema')
  self.calls.append({'request':payload,'response':data});return data

def paged(client,symbol,indicator,count=1000):
 begin=0;seen=set()
 while True:
  data=client.query({'symbol':symbol,'indicator':indicator,'page':{'begin':begin,'count':count}});rows=data['data'];fresh=[r['symbol_code'] for r in rows if r['symbol_code'] not in seen];seen.update(fresh)
  yield data
  begin+=len(rows)
  if not rows or begin>=data.get('page',{}).get('total',begin) or not fresh:return

def execute(plan,client):
 symbol=[plan['base']]
 for name,group in plan['groups'].items():
  if len(group)==1:symbol.extend(group);continue
  union=[{**x,'op':'union'} for x in group];codes=[]
  for data in paged(client,union,[{'id':'55','req_unique_id':'name'}]):codes.extend(x['symbol_code'] for x in data['data'])
  if not codes:return result(plan,{'indicator':plan['request']['indicator'],'data':[],'page':{'total':0}},client)
  symbol.append({'op':'intersect','type':'market_code','value':list(dict.fromkeys(codes))})
 ranking=plan['ranking']
 if ranking:
  if not 1<=ranking['limit']<=1000:raise ScreenError('Ranking Top N must be 1..1000, matching the page contract')
  if ranking.get('prompt_id'):symbol.append(prompt(ranking['prompt_id']))
  codes=[];begin=0
  while len(codes)<ranking['limit']:
   data=client.query({'symbol':symbol,'indicator':[{**ranking['indicator'],'req_unique_id':'ranking'}],'sort':[{'pos':0,'order':ranking['order']}],'page':{'begin':begin,'count':ranking['limit']}})
   pos=next((i for i,v in enumerate(data['indicator']) if v.get('req_unique_id')=='ranking'),None)
   if pos is None:raise ScreenError('Ranking indicator unavailable')
   for row in data['data']:
    value=row['value'][pos].get('v') if len(row.get('value',[]))>pos and isinstance(row['value'][pos],dict) else None
    try:valid=value is not None and str(value).strip()!='' and math.isfinite(float(value))
    except (TypeError,ValueError):valid=False
    if valid and row['symbol_code'] not in codes:codes.append(row['symbol_code'])
    if len(codes)==ranking['limit']:break
   begin+=len(data['data'])
   if not data['data'] or begin>=data.get('page',{}).get('total',begin):break
  if not codes:return result(plan,{'indicator':plan['request']['indicator'],'data':[],'page':{'total':0}},client)
  symbol=[{'type':'market_code','value':codes}]
 data=client.query({'symbol':symbol,**plan['request']});return result(plan,data,client)

def result(plan,data,client):
 rows=[];metadata=data['indicator']
 for entry in data['data']:
  code=entry['symbol_code'];row={'symbol_code':code,'symbol':code.split(':',1)[-1]}
  for i,m in enumerate(metadata):
   rid=m.get('req_unique_id',m['id']);values=entry.get('value',[]);value=values[i] if i<len(values) else None
   row[plan['labels'].get(rid,rid)]=value.get('v') if isinstance(value,dict) else value
  rows.append(row)
 return {'ok':True,'source':'AInvest screener snapshot API','endpoint':ENDPOINT,'retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat(),'asset':plan['asset'],'strategy':plan['strategy'],'applied_filters':plan['filters'],'ranking':plan['ranking'],'page':{**data.get('page',{}),'begin':plan['request']['page']['begin'],'count':len(rows),'requested_count':plan['request']['page']['count']},'rows':rows,'indicator_metadata':metadata,'request_count':len(client.calls),'data_mode':'live','sources':copy.deepcopy(SOURCES),'access_mode':getattr(client,'access_mode','test_fixture'),'note':'Raw API result units are preserved; filter bounds using % are converted to fractions. Retrieval time is not quote/trade time.'}

def write_json(path,value):
 path=Path(path).expanduser().resolve();path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n');return str(path)

def main():
 p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
 for cmd in ['fields','strategies','metrics']:
  x=sub.add_parser(cmd);x.add_argument('--asset',choices=['stock','etf'],default='etf');x.add_argument('--search',default='');x.add_argument('--detail',action='store_true')
 for cmd in ['plan','query']:
  x=sub.add_parser(cmd);x.add_argument('--asset',choices=['stock','etf'],default='etf');x.add_argument('--strategy');x.add_argument('--top',type=int,help='Override a preset ranking universe size, independently of output page size');x.add_argument('--filters-json',default='[]');x.add_argument('--filters-file');x.add_argument('--columns',help='Comma-separated sourced dictionary metric IDs or exact titles');x.add_argument('--sort');x.add_argument('--order',choices=['asc','desc'],default='desc');x.add_argument('--offset',type=int,default=0);x.add_argument('--limit',type=int,default=40);x.add_argument('--output');x.add_argument('--cookie-file');x.add_argument('--headers-file');x.add_argument('--csv');x.add_argument('--evidence-output')
 a=p.parse_args()
 if a.command in {'fields','strategies','metrics'}:
  if a.command=='strategies':
   if a.asset!='etf':raise ScreenError('Only ETF presets were confirmed; stock custom fields are available')
   rows=load('etf-strategies.json')
  elif a.command=='fields':rows=fields(a.asset)
  else:rows=[m for m in load('indicator-dictionary.json') if a.asset in m['assets']]
  rows=[r for r in rows if a.search.lower() in json.dumps(r,ensure_ascii=False).lower()]
  if not a.detail:rows=[{k:v for k,v in r.items() if k in {'key','id','prompt_id','name','label','title','type','category','description','query','periods','numeric','sortable','attrs','aliases'}} for r in rows]
  print(json.dumps({'asset':a.asset,'count':len(rows),'items':rows},ensure_ascii=False));return
 fs=json.loads(Path(a.filters_file).read_text()) if a.filters_file else json.loads(a.filters_json)
 if not isinstance(fs,list):raise ScreenError('filters must be an array')
 plan=prepare(a.asset,fs,a.strategy,a.columns.split(',') if a.columns else None,a.sort,a.order,a.offset,a.limit)
 if a.top is not None:
  if not plan['ranking'] or not 1<=a.top<=1000:raise ScreenError('--top requires a ranking preset and must be 1..1000')
  plan['ranking']['limit']=a.top
 if a.command=='plan':output=plan
 else:
  client=Client(a.cookie_file,a.headers_file);output=execute(plan,client)
  if a.evidence_output:write_json(a.evidence_output,{'endpoint':ENDPOINT,'retrieved_at':output['retrieved_at'],'calls':client.calls})
  if a.csv:
   path=Path(a.csv).expanduser();path.parent.mkdir(parents=True,exist_ok=True)
   with path.open('w',newline='',encoding='utf-8-sig') as f:
    keys=list(dict.fromkeys(k for row in output['rows'] for k in row));writer=csv.DictWriter(f,fieldnames=keys);writer.writeheader();writer.writerows(output['rows'])
 if a.output:
  path=write_json(a.output,output);print(json.dumps({'ok':True,'output':path,**({'total':output['page'].get('total'),'returned':len(output['rows']),'data_mode':output['data_mode'],'sources':output['sources']} if 'rows' in output else {'mode':'plan'})},ensure_ascii=False))
 else:print(json.dumps(output,ensure_ascii=False,indent=2,allow_nan=False))
if __name__=='__main__':
 try:main()
 except (ScreenError,OSError,json.JSONDecodeError) as e:print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False),file=sys.stderr);sys.exit(2)
