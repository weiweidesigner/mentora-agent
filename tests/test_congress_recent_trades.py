from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import congress_recent_trades as m

def test_on_demand_route_validates_filters_and_preserves_source_status(monkeypatch):
 calls=[]
 class Native:
  def validate_filters(self,direction,start,end):
   if start and end and start>end:raise ValueError('invalid')
  def fetch_window(self,*args,**kwargs):calls.append((args,kwargs));return {'rows':[],'coverage':{'hasMore':True,'error':'source unavailable'}}
 monkeypatch.setattr(m,'component',lambda:Native());app=FastAPI();app.include_router(m.router);c=TestClient(app)
 r=c.get('/api/congress-recent-trades?cursor=4&direction=buy&from_date=2026-01-01&to_date=2026-10-29');assert r.status_code==200 and r.headers['cache-control']=='no-store' and r.json()['coverage']['error'];assert calls[0][0]==(4,'buy','2026-01-01','2026-10-29')
 assert c.get('/api/congress-recent-trades?direction=other').status_code==422
 assert c.get('/api/congress-recent-trades?cursor=0').status_code==422
 assert c.get('/api/congress-recent-trades?from_date=2026-10-29&to_date=2026-01-01').status_code==400

 assert c.get('/api/congress-recent-trades?all_dates=true&from_date=2026-01-01').status_code==400
 r=c.get('/api/congress-recent-trades?all_dates=true');assert r.status_code==200 and calls[-1][1]['all_dates'] is True
