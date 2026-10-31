import copy
import json
import re
from pathlib import Path
from app import artifact_upgrades as upgrades


def test_saved_macro_values_periods_and_scope_survive_visual_upgrade(monkeypatch):
 native=upgrades._native_rating('economic_indicators_heatmap')
 monkeypatch.setattr(native,'fetch_data',lambda *a,**k:(_ for _ in ()).throw(AssertionError('no refetch')))
 cell=lambda v:{'value':v,'unit':'%','observationPeriod':'20311231','frequency':'Quarterly','indicatorName':None}
 row={'countryCode':'FR','country':'France','cells':{m:cell(8.3 if m=='UR' else -3.7) for m in native.METRICS}}
 row['cells']['GDP'].update(value=3370000000000,unit='USD')
 payload={'type':'economic-indicators-heatmap','rows':[row],'source':{'fetchedAt':'2026-10-31T11:00:00Z','selection':'original sample','limitations':['Original source values']},'theme':'dark','language':'zh-CN','title':'原来的宏观表'}
 original=copy.deepcopy(payload)
 old='<html data-theme="dark" data-economic-heatmap-runtime="1"><script id="component-data" type="application/json">'+json.dumps({'payload':payload,'labels':{}})+'</script></html>'
 new=upgrades.upgrade_economic_indicators_heatmap(old)
 assert 'data-economic-heatmap-runtime="3"' in new
 result=json.loads(re.search(r'id="component-data">(.*?)</script>',new,re.S)[1])
 assert result['payload']==original
 assert result['type']=='economic-indicators-heatmap'
 assert 'class="color-legend"' not in new and 'data-side="above"' in new
 assert upgrades.upgrade_economic_indicators_heatmap(new)==new
 for bad in ['<main>other</main>','<script id="component-data">economic-indicators-heatmap broken</script>','<script id="component-data">{"type":"other","name":"economic-indicators-heatmap"}</script>']:
  assert upgrades.upgrade_economic_indicators_heatmap(bad)==bad
 assert 'artifact = upgrade_economic_indicators_heatmap(artifact)' in (Path(__file__).parents[1]/'app/presentation.py').read_text()
