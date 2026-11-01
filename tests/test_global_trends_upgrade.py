import copy,json,re
from app import artifact_upgrades as upgrades


def test_saved_global_trends_upgrade_preserves_source_and_never_refetches(monkeypatch):
 native=upgrades._native_rating('global_economic_trends')
 monkeypatch.setattr(native,'fetch_data',lambda *a,**k:(_ for _ in ()).throw(AssertionError('no fetch')))
 row={'countryCode':'CA','country':'Canada','value':6.5,'unit':'%','frequency':'Monthly','observationPeriod':'20260930'}
 payload={'type':'global-economic-trends','metric':'unemployment','language':'zh-CN','theme':'dark','title':'全球失业率','source':{'fetchedAt':'2026-11-01T00:00:00Z'},'modules':[{'id':key,'metric':metric,'thresholds':thresholds,'countries':[row.copy()],'ranking':[row.copy()]} for key,metric,thresholds,*_ in native.MODULES]}
 original=copy.deepcopy(payload)
 old='<html data-global-trends-ui="1" data-theme="dark"><script id="component-data">'+json.dumps(payload)+'</script></html>'
 doc=upgrades.upgrade_global_economic_trends(old)
 assert 'data-global-trends-ui="2"' in doc and doc.count('<h2>')==1
 assert '加拿大' in doc and '2026年9月' in doc
 assert json.loads(re.search(r'id="component-data">(.*?)</script>',doc,re.S)[1])==original
 assert upgrades.upgrade_global_economic_trends(doc)==doc
 for bad in ['other','global-economic-trends without payload','<script id="component-data">{"type":"other"}</script>']:
  assert upgrades.upgrade_global_economic_trends(bad)==bad
