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
