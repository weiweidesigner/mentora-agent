import copy,json,re
from app import artifact_upgrades as upgrades


def test_saved_history_gets_semantic_table_and_arrow_without_refetch(monkeypatch):
 native=upgrades._native_rating('inflation_history_heatmap')
 monkeypatch.setattr(native,'fetch_data',lambda *a,**k:(_ for _ in ()).throw(AssertionError('no fetch')))
 p={'type':'inflation-history-heatmap','months':['2026-09'],'rows':[{'countryCode':c,'country':c,'unit':'%','history':[],'cells':[{'value':-45.99 if c=='IN' else None if c=='BR' else 2.5,'source':'series' if c!='BR' else 'missing','observationPeriod':'20260930','t':123}]} for c in native.COUNTRIES],'source':{'fetchedAt':'2026-11-01T00:00:00Z'},'language':'zh-CN','theme':'dark'}
 before=copy.deepcopy(p);old='<html data-inflation-history-ui="2" data-theme="dark"><script id="component-data">'+json.dumps(p)+'</script></html>'
 new=upgrades.upgrade_inflation_history_heatmap(old)
 assert 'data-inflation-history-ui="3"' in new and 'color-legend' not in new and 'data-side=' in new
 assert '通缩' in new and '-45.99' in new and 'border:7px solid transparent' in new
 assert json.loads(re.search(r'id="component-data"[^>]*>(.*?)</script>',new,re.S)[1])==before
 assert upgrades.upgrade_inflation_history_heatmap(new)==new
 assert upgrades.upgrade_inflation_history_heatmap('other')=='other'
