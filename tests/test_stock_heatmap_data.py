from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import stock_heatmap_data as module


def client():
 app=FastAPI();app.include_router(module.router);return TestClient(app)


def test_selection_is_allowlisted_and_errors_are_sanitized(monkeypatch):
 class Native:
  def fetch_selection(self,kind,universe,code):
   if code:raise RuntimeError('secret-cookie')
   return {'type':'stock-heatmap','stocks':[],'selection':{'kind':kind,'universe':universe}}
 monkeypatch.setattr(module,'_native_rating',lambda name:Native())
 c=client();r=c.get('/api/stock-heatmap/data?kind=universe&universe=dji')
 assert r.status_code==200 and r.headers['cache-control']=='no-store'
 assert r.json()['selection']['universe']=='dji'
 for query in ['kind=unsafe','kind=universe&universe=unsafe','kind=theme','kind=sector&code=https://unsafe']:
  assert c.get('/api/stock-heatmap/data?'+query).status_code==422
 r=c.get('/api/stock-heatmap/data?kind=theme&code=89:865220')
 assert r.status_code==502 and 'secret-cookie' not in r.text


def test_saved_stock_heatmap_upgrade_preserves_source_payload(monkeypatch):
 from app import artifact_upgrades as upgrades
 import json
 payload={'type':'stock-heatmap','stocks':[{'price':218.34}]}
 seen=[]
 class Native:
  def render_html(self,p):seen.append(p);return '<main data-stock-heatmap-runtime="5"></main>'
 monkeypatch.setattr(upgrades,'_native_rating',lambda name:Native())
 source='<main class="stock-heatmap"></main><script id="component-data" type="application/json">'+json.dumps(payload)+'</script>'
 result=upgrades.upgrade_stock_heatmap(source)
 assert seen==[payload] and upgrades.upgrade_stock_heatmap(result)==result
