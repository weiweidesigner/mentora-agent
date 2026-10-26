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
categories=['lane','reports','charts','analysis','videos','art']
catalog=dict(cases=[],categories=[dict(id=c,title=c,subtitle='') for c in categories[1:]])

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
                page.wait_for_function('window.MentoraCaseFavorites && document.querySelector("#inspirationTabs [role=tab]")')
            load()
            page.evaluate('''()=>{
                startNewChat(false,false);
                const a=createAssistantMessage('仅离线软件测试问题');
                renderFinalAnswer(a,{interpretation:'这是一条离线收藏测试答案，不是投资事实。',lang:'zh-CN',sources:[]});
            }''')
            page.locator('.favoriteResultButton').click()
            dialog=page.locator('.caseFavoriteDialog');box=dialog.bounding_box()
            assert box['x']>=0 and box['x']+box['width']<=width and box['height']<=900
            assert page.locator('#caseFavoriteCategory option').count()==6
            for category in categories:
                previous=len(writes)
                page.locator('#caseFavoriteCategory').select_option(category)
                assert len(writes)==previous,'Changing the selection must not save'
                page.locator('.caseFavoriteSubmit').click()
                page.wait_for_function('document.querySelector(".caseFavoriteStatus").textContent.startsWith("已收藏到")')
                assert len(writes)==previous+1
                assert 'M356.1 177.4' not in page.locator('.favoriteResultButton path').get_attribute('d')
            page.keyboard.press('Escape');assert not dialog.is_visible()
            assert len(saved)==6 and all(p=='/api/case-favorites' for p in writes)
            load()
            assert page.locator('#caseGrid [data-case=favorite-lane]').count()>0
            for category in categories[1:]:assert page.locator('#inspirationPanel [data-case=favorite-'+category+']').count()==1
            page.locator('[data-case=favorite-analysis]').click()
            page.wait_for_function('document.querySelector(".cachedCaseAnswer .favoriteResultButton")')
            assert '离线收藏测试答案' in page.locator('#messages').inner_text()
            page.wait_for_function('document.querySelector(".cachedCaseAnswer .favoriteResultButton").classList.contains("is-favorited")')
            page.locator('.cachedCaseAnswer .favoriteResultButton').click()
            page.wait_for_function('!document.querySelector(".cachedCaseAnswer .favoriteResultButton").classList.contains("is-favorited")')
            assert not page.locator('.caseFavoriteDialog').is_visible()
            assert not saved
            assert page.locator('#caseGrid [data-case^=favorite-]').count()==0
            assert page.locator('#inspirationPanel [data-case^=favorite-]').count()==0
            assert page.locator('.caseOverlay').count()==1,'Unfavorite must preserve the open answer'
            page.locator('.cachedCaseAnswer .favoriteResultButton').click();assert page.locator('.caseFavoriteDialog').is_visible()
            page.keyboard.press('Escape')
            load();assert page.locator('[data-case^=favorite-]').count()==0
            assert not errors,errors
            print(json.dumps(dict(width=width,theme=theme,sixDestinations=True,persistentReplay=True,noExecution=True)))
            page.close()
    browser.close()
