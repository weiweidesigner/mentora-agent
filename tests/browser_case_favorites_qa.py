"""Offline browser QA: real app controls and galleries, fixture-only persistence."""
import json
import hashlib
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'app/static/index.html').read_text(),flags=re.S)
saved={};snapshots={};writes=[]
categories=['reports','charts','analysis','videos','art']
catalog=dict(cases=[dict(id=f'demo-{c}-{i}',category=c,title='离线模块测试卡片',question='离线测试问题',tag='测试',preview='仅用于界面测试，不是投资事实。',cachedDate='2026-10-26',conversationUrl='/qa/'+c) for c in categories for i in range(9)],categories=[dict(id=c,title=c,subtitle='离线测试模块') for c in categories])

def route(r):
    path=urlparse(r.request.url).path
    if path=='/':return r.fulfill(body=html,content_type='text/html')
    if path=='/api/case-favorites':
        if r.request.method=='DELETE':
            value=r.request.post_data_json;writes.append(path)
            fingerprint=hashlib.sha256(json.dumps(dict(question=value['question'],answer=value['answer']),ensure_ascii=False,sort_keys=True).encode()).hexdigest()
            ids=[key for key,row in saved.items() if row['fingerprint']==fingerprint]
            for key in ids:saved.pop(key);snapshots.pop(key)
            return r.fulfill(json=dict(removedIds=ids,removedCount=len(ids),fingerprint=fingerprint))
        if r.request.method=='POST':
            value=r.request.post_data_json;key='favorite-'+value['category'];writes.append(path)
            row=dict(id=key,category=value['category'],question=value['question'],title=value['title'],
                     preview='离线测试案例',tag='收藏',cachedDate='2026-10-26',conversationUrl='/api/case-favorites/'+key,
                     fingerprint=hashlib.sha256(json.dumps(dict(question=value['question'],answer=value['answer']),ensure_ascii=False,sort_keys=True).encode()).hexdigest())
            saved[key]=row;snapshots[key]=dict(question=value['question'],answer=value['answer'])
            return r.fulfill(json=row)
        return r.fulfill(json=dict(cases=list(saved.values())))
    if path=='/api/case-favorites/status':
        value=r.request.post_data_json
        fingerprint=hashlib.sha256(json.dumps(dict(question=value['question'],answer=value['answer']),ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        return r.fulfill(json=dict(saved=any(row['fingerprint']==fingerprint for row in saved.values())))
    if path.startswith('/api/case-favorites/'):return r.fulfill(json=snapshots[path.rsplit('/',1)[1]])
    if path=='/static/cases/manifest.json':return r.fulfill(json=[])
    if path=='/static/cases/inspiration/manifest.json':return r.fulfill(json=catalog)
    if path.startswith('/api/'):
        assert r.request.method=='GET',('unexpected mutation',path)
        return r.fulfill(json=dict(sessions=[],tasks=[],sceneTasks=[],models=[],frameworks=[],reasoningEffort='low'))
    file=ROOT/'app'/path.lstrip('/')
    return r.fulfill(path=str(file)) if file.is_file() else r.fulfill(status=404,body='')


with sync_playwright() as runtime:
    browser=runtime.chromium.launch()
    for width in (390,1280):
        for theme in ('light','dark'):
            saved.clear();snapshots.clear();writes.clear()
            page=browser.new_page(viewport=dict(width=width,height=900),reduced_motion='reduce')
            page.route('https://case-test.local/**',route)
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            def load():
                page.goto('https://case-test.local/')
                for asset in ('app.js','case-favorites.js','cases.js'):
                    page.add_script_tag(content=(ROOT/'app/static'/asset).read_text())
                page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
                page.wait_for_function('document.querySelector("#inspirationTabs [data-category=mine]")')
            load()
            assert page.locator('#inspirationTabs [aria-selected=true]').get_attribute('data-category')=='mine'
            assert page.locator('#inspirationTabs [data-category=all]').count()==0
            tab=page.locator('#inspirationTabs [data-category=reports]')
            before=tab.evaluate('(el)=>getComputedStyle(el).backgroundColor')
            tab.hover()
            assert tab.evaluate('(el)=>getComputedStyle(el).backgroundColor')!=before
            assert page.locator('#inspirationTabs [aria-selected=true]').get_attribute('data-category')=='mine'
            page.mouse.move(0,0)
            assert page.locator('#inspiration-section-mine .inspirationEmpty').count()==1
            page.evaluate('''()=>{
                startNewChat(false,false);
                const a=createAssistantMessage('仅离线软件测试问题');
                renderFinalAnswer(a,{interpretation:'这是一条离线收藏测试答案，不是投资事实。',lang:'zh-CN',sources:[]});
            }''')
            page.locator('.favoriteResultButton').click()
            page.wait_for_function('document.querySelector(".favoriteResultButton").classList.contains("is-favorited")')
            assert page.locator('.caseFavoriteDialog').count()==0
            assert len(saved)==1 and saved['favorite-mine']['category']=='mine'
            assert all(p=='/api/case-favorites' for p in writes)
            load()
            assert page.locator('#caseGrid [data-case^=favorite-]').count()==0
            assert page.locator('#inspiration-section-mine [data-case=favorite-mine]').count()==1
            assert page.locator('.inspirationCategory').count()==6
            for category in categories+['mine']:
                page.evaluate('''category=>{
                    const container=document.querySelector('.conversation');
                    const tabs=document.querySelector('#inspirationTabs');
                    const section=document.querySelector('#inspiration-section-'+category);
                    container.scrollTop+=section.getBoundingClientRect().top-container.getBoundingClientRect().top-(parseFloat(getComputedStyle(tabs).top)||0)-tabs.offsetHeight-10;
                }''',category)
                page.wait_for_function('category=>document.querySelector("#inspirationTabs [aria-selected=true]").dataset.category===category',arg=category)
            page.locator('#inspirationTabs [data-category=charts]').click()
            page.wait_for_function('document.querySelector("#inspirationTabs [aria-selected=true]").dataset.category==="charts"')
            assert page.locator('.inspirationCategory').count()==6
            page.keyboard.press('Home')
            page.wait_for_function('document.querySelector("#inspirationTabs [aria-selected=true]").dataset.category==="mine"')
            page.locator('#inspiration-section-mine [data-case=favorite-mine]').click()
            page.wait_for_function('document.querySelector(".cachedCaseAnswer .favoriteResultButton")?.classList.contains("is-favorited")')
            assert '离线收藏测试答案' in page.locator('#messages').inner_text()
            page.locator('.cachedCaseAnswer .favoriteResultButton').click()
            page.wait_for_function('!document.querySelector(".cachedCaseAnswer .favoriteResultButton").classList.contains("is-favorited")')
            assert not saved and page.locator('#inspiration-section-mine [data-case^=favorite-]').count()==0
            assert page.locator('.caseOverlay').count()==1
            page.locator('.cachedCaseAnswer .favoriteResultButton').click()
            page.wait_for_function('document.querySelector(".cachedCaseAnswer .favoriteResultButton").classList.contains("is-favorited")')
            assert saved['favorite-mine']['category']=='mine' and page.locator('dialog.caseFavoriteDialog').count()==0
            page.locator('#caseBackButton').click()
            load();assert page.locator('#inspiration-section-mine [data-case=favorite-mine]').count()==1
            assert not errors,errors
            print(json.dumps(dict(width=width,theme=theme,mineDefault=True,directFavorite=True,scrollSpy=True,persistentReplay=True,noExecution=True)))
            page.close()
    browser.close()
