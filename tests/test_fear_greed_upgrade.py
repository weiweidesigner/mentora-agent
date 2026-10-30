import json
from app import artifact_upgrades as upgrades


def test_saved_dashboard_upgrades_from_existing_payload_without_fetch(monkeypatch):
 payload={'type':'fear-greed','history':[{'date':'2026-10-29','value':30,'btcPrice':77825.34}]}
 seen=[]
 class Native:
  def render_html(self,data):
   seen.append(data)
   return '<main class="fear-greed" data-fear-greed-runtime="4"></main>'
 monkeypatch.setattr(upgrades,'_native_rating',lambda name:Native())
 old='<html data-theme="dark"><main class="fear-greed"></main><script id="component-data" type="application/json">'+json.dumps(payload)+'</script></html>'
 result=upgrades.upgrade_fear_greed(old)
 assert seen==[{**payload,'theme':'dark'}]
 assert upgrades.upgrade_fear_greed(result)==result
 assert upgrades.upgrade_fear_greed('<main>unrelated chart</main>')=='<main>unrelated chart</main>'
