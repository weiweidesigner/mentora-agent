"""Homepage card layout with offline saved-component fixtures."""
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
HTML=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'app/static/index.html').read_text(),flags=re.S)
TITLE='目前有哪些议员收益表现较好，找出来对比一下'
ROWS=[dict(id='favorite-test',category='mine',personal=True,title=TITLE*3,question=TITLE,
           tag='AInvest',preview='从近一年收益看，对比不同人物的投资表现与收益变化。',
           cachedDate='2026-10-29',conversationUrl='/api/case-favorites/favorite-test')]

def route(request):
    path=urlparse(request.request.url).path
    if path=='/':return request.fulfill(body=HTML,content_type='text/html')
    if path=='/api/case-favorites':return request.fulfill(json={'cases':ROWS})
    if path=='/static/cases/manifest.json':return request.fulfill(json=[])
    if path=='/static/cases/inspiration/manifest.json':return request.fulfill(json={'cases':[],'categories':[]})
    if path.startswith('/api/'):
        assert request.request.method=='GET'
        return request.fulfill(json=dict(sessions=[],tasks=[],sceneTasks=[],models=[],frameworks=[],reasoningEffort='low'))
    file=ROOT/'app'/path.lstrip('/')
    return request.fulfill(path=str(file)) if file.is_file() else request.fulfill(status=404,body='')

with sync_playwright() as runtime:
    browser=runtime.chromium.launch()
    for width in (390,768,1280):
        for theme in ('light','dark'):
            page=browser.new_page(viewport=dict(width=width,height=900),reduced_motion='reduce')
            page.route('https://case-test.local/**',route)
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto('https://case-test.local/')
            for asset in ('app.js','case-favorites.js','cases.js'):
                page.add_script_tag(content=(ROOT/'app/static'/asset).read_text())
            page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
            card=page.locator('#inspiration-section-mine .caseCard');card.wait_for()
            assert page.locator('#inspiration-section-mine .inspirationCategorySubtitle').inner_text()=='收藏你感兴趣的内容，随时回看图表、报告与灵感。'
            assert card.locator('.caseCardTag').inner_text()=='AInvest'
            assert card.locator('h4').evaluate('(el)=>{const s=getComputedStyle(el);return s.whiteSpace==="nowrap"&&s.textOverflow==="ellipsis"&&el.scrollWidth>el.clientWidth&&el.clientHeight<=parseFloat(s.lineHeight)+1}')
            assert card.locator('p').inner_text()==ROWS[0]['preview']
            assert card.locator('p').evaluate('(el)=>el.getBoundingClientRect().top>=el.previousElementSibling.getBoundingClientRect().bottom')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert not errors,errors
            print(dict(width=width,theme=theme,singleLine=True,description=True,componentType=True))
            page.close()
    browser.close()
