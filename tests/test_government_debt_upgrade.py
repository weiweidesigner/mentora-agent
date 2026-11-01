import copy,json,re
from app import artifact_upgrades as upgrades

def test_saved_debt_data_is_unchanged_by_category_upgrade(monkeypatch):
 native=upgrades._native_rating('government_debt_heatmap')
 monkeypatch.setattr(native,'fetch_data',lambda *a,**k:(_ for _ in ()).throw(AssertionError('no fetch')))
 p={'type':'government-debt-heatmap','years':['2024'],'rows':[{'countryCode':c,'country':c,'unit':'%','debtScope':None,'history':[],'cells':[{'value':236.66 if c=='JP' else 104.3,'source':'series','observationPeriod':'20241231','t':123}]} for c in native.COUNTRIES],'language':'zh-CN','theme':'dark','source':{'fetchedAt':'2026-11-01T00:00:00Z'}}
 before=copy.deepcopy(p);old='<html data-government-debt-ui="1" data-theme="dark"><script id="component-data">'+json.dumps(p)+'</script></html>'
 new=upgrades.upgrade_government_debt_heatmap(old)
 assert 'data-government-debt-ui="2"' in new and 'debt-two-plus' in new and 'color-legend' not in new
 assert json.loads(re.search(r'id="component-data"[^>]*>(.*?)</script>',new,re.S)[1])==before
 assert upgrades.upgrade_government_debt_heatmap(new)==new
 assert upgrades.upgrade_government_debt_heatmap('other')=='other'
