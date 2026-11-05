"""Check sticky backgrounds and source branding without accessing saved user data."""
import json,re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).parents[1]
HTML=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'app/static/index.html').read_text(),flags=re.S)
ROWS=[dict(id=f'favorite-native-{i}',category='mine',personal=True,businessChart=True,title='查看原生业务图表 '+str(i),question='查看图表',tag='行情与财报',preview='使用真实业务组件展示行情、财务与资金信息。',cachedDate='2026-11-05',conversationUrl='/api/case-favorites/fixture-'+str(i)) for i in range(12)]
ROWS[0].update(tag='聪明钱',title='展示最近的美国国会议员股票交易')
ROWS.append(dict(id='favorite-report',category='mine',title='普通报告',tag='报告',preview='普通报告不标记成 AInvest 图表。'))
CATALOG=json.loads((ROOT/'app/static/cases/inspiration/manifest.json').read_text())
CATALOG['categories'].append(dict(id='legacy-business',title='金融业务图表'))
BUSINESS_COUNT=sum(row['id'].startswith('business-') and row.get('tool')!='TradingViewChart' for row in CATALOG['cases'])+12
def route(request):
 path=urlparse(request.request.url).path
 if path=='/':return request.fulfill(body=HTML,content_type='text/html')
 if path=='/api/case-favorites':return request.fulfill(json={'cases':ROWS})
 if path=='/static/cases/manifest.json':return request.fulfill(json=[])
 if path=='/static/cases/inspiration/manifest.json':return request.fulfill(json=CATALOG)
 if path.startswith('/api/'):
  assert request.request.method=='GET'
  return request.fulfill(json=dict(sessions=[],tasks=[],sceneTasks=[],models=[],frameworks=[],reasoningEffort='low'))
 file=ROOT/'app'/path.lstrip('/')
 return request.fulfill(path=str(file)) if file.is_file() else request.fulfill(status=404,body='')
out=ROOT/'outputs/unified-financial-gallery-qa';out.mkdir(parents=True,exist_ok=True)
checks=[]
with sync_playwright() as runtime:
 browser=runtime.chromium.launch()
 for width in (390,1280):
  for theme in ('light','dark'):
   page=browser.new_page(viewport=dict(width=width,height=900),reduced_motion='reduce')
   page.route('https://case-test.local/**',route)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto('https://case-test.local/')
   for asset in ('app.js','case-favorites.js','cases.js'):page.add_script_tag(content=(ROOT/'app/static'/asset).read_text())
   page.locator('#inspiration-section-charts .caseCard').first.wait_for()
   page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
   assert page.locator('#inspiration-section-charts [data-brand=ainvest]').count()==BUSINESS_COUNT
   assert page.locator('#inspiration-section-mine [data-case=favorite-report] [data-brand=ainvest]').count()==0
   assert page.locator('#inspiration-section-charts .caseCardBrandIcon--tradingview').count()>0
   assert page.locator('#inspirationTabs button',has_text='金融业务图表').count()==0
   assert page.locator('#inspiration-section-charts .inspirationWidgetGroup').count()>=6
   assert page.locator('#financial-group-ownership').locator('..').locator('..').locator('[data-case=favorite-native-0]').count()==1
   assert all('AInvest' not in text and 'TradingView' not in text for text in page.locator('#inspiration-section-charts h4').all_text_contents())
   page.locator('#inspirationTabs [data-category=charts]').click()
   page.wait_for_function("document.querySelector('#inspirationTabs').classList.contains('is-stuck')")
   background=page.locator('#inspirationTabs').evaluate('(el)=>getComputedStyle(el).backgroundColor')
   assert background not in ('transparent','rgba(0, 0, 0, 0)')
   assert 'blur(20px)' in page.locator('#inspirationTabs').evaluate('(el)=>getComputedStyle(el).backdropFilter')
   assert page.locator('#inspirationTabs').evaluate('(el)=>getComputedStyle(el).borderRadius')=='0px'
   assert '/ 0.58)' in background
   assert page.locator('#inspirationTabs').evaluate('''(el)=>{const r=el.getBoundingClientRect();return [r.left+1,r.right-1].every(x=>el.contains(document.elementFromPoint(x,r.top+1)));}'''), 'Sticky top corners must cover the content underneath'
   page.wait_for_function("[...document.querySelectorAll('#inspiration-section-charts [data-brand=ainvest] img')].every(img=>img.complete&&img.naturalWidth>0)")
   page.screenshot(path=str(out/f'{theme}-{width}-sticky.png'))
   page.evaluate("conversation.scrollTop=0")
   page.wait_for_function("!document.querySelector('#inspirationTabs').classList.contains('is-stuck')")
   assert not errors,errors
   checks.append(dict(width=width,theme=theme,stickyBackground=background,returnsTransparent=True,ainvestLogos=BUSINESS_COUNT,providerIdentityPreserved=True))
   page.close()
 browser.close()
(out/'checks.json').write_text(json.dumps(checks,indent=2));print(json.dumps(checks))
