from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import etf_heatmap_data as module


def test_etf_selection_validation_no_cache_and_sanitized_failures(monkeypatch):
 calls=[]
 class Native:
  def fetch_selection(self,kind,dimension,code):
   calls.append((kind,dimension,code))
   if code:raise RuntimeError('secret-cookie')
   return {'type':'etf-heatmap','groups':{dimension:[]},'members':{}}
 monkeypatch.setattr(module,'_native_rating',lambda name:Native())
 app=FastAPI();app.include_router(module.router);c=TestClient(app)
 r=c.get('/api/etf-heatmap/data?kind=root&dimension=region')
 assert r.status_code==200 and r.headers['cache-control']=='no-store'
 assert calls==[('root','region',None)]
 for query in ['kind=unsafe','kind=root&dimension=unsafe','kind=members','kind=members&code=https://unsafe']:
  assert c.get('/api/etf-heatmap/data?'+query).status_code==422
 r=c.get('/api/etf-heatmap/data?kind=members&code=89:862201')
 assert r.status_code==502 and 'secret-cookie' not in r.text


def test_busy_capacity_released(monkeypatch):
 class Busy:
  def acquire(self,blocking=False):return False
 monkeypatch.setattr(module,'_slots',Busy())
 app=FastAPI();app.include_router(module.router);c=TestClient(app)
 assert c.get('/api/etf-heatmap/data?kind=root').status_code==429


def test_aum_area_is_forwarded_and_saved_chart_upgrades_without_changing_data(monkeypatch):
 import json
 from app import artifact_upgrades as upgrades
 calls=[]
 class Native:
  def fetch_selection(self,*args,**kwargs):calls.append((args,kwargs));return {'groups':{}}
  def render_html(self,payload):calls.append(payload);return '<main data-etf-heatmap-runtime="2"></main>'
 monkeypatch.setattr(module,'_native_rating',lambda name:Native())
 app=FastAPI();app.include_router(module.router);c=TestClient(app)
 assert c.get('/api/etf-heatmap/data?kind=root&dimension=region&size_by=aum').status_code==200
 assert calls[0]==(('root','region',None),{'size_by':'aum'})
 assert c.get('/api/etf-heatmap/data?kind=root&size_by=unsafe').status_code==422
 monkeypatch.setattr(upgrades,'_native_rating',lambda name:Native())
 payload={'type':'etf-heatmap','groups':{'theme':[{'metrics':{'size:aum':None}}]},'members':{}}
 doc='<main data-etf-heatmap-runtime="1"></main><script id="component-data" type="application/json">'+json.dumps(payload)+'</script>'
 updated=upgrades.upgrade_etf_heatmap(doc)
 assert calls[-1]==payload and 'data-etf-heatmap-runtime="2"' in updated
 assert upgrades.upgrade_etf_heatmap(updated)==updated
