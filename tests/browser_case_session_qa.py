"""Case playback/share are read-only; only an actual send creates a chat."""
from pathlib import Path
import json
import sys
from playwright.sync_api import sync_playwright

root=Path(__file__).parents[1];checks=[]
row=json.loads((root/'app/static/cases/manifest.json').read_text())[0]
fixture={'question':row['question'],'answer':{'question':row['question'],'interpretation':'案例回放只读验证。','sources':[],'lang':'zh-CN'},'activity':{'steps':[]}}
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        page=browser.new_page(viewport={'width':width,'height':900})
        writes=[]
        def api(route):
            request=route.request
            if request.method in ('POST','PATCH','DELETE','PUT'):
                writes.append(request.url)
                if request.url.endswith('/api/chat/runs'):
                    route.fulfill(json={'runId':'case-qa-run','sessionId':request.post_data_json['sessionId'],'status':'running'})
                else:route.fulfill(json={'title':'真实提问','ok':True})
            elif '/api/chat/runs/case-qa-run/events' in request.url:
                route.fulfill(content_type='text/event-stream',body='event: final\ndata: '+json.dumps({'chatRunId':'case-qa-run','interpretation':'真实发送的回答','lang':'zh-CN','sources':[]})+'\n\n')
            elif request.url.endswith('/api/chat/sessions'):route.fulfill(json={'sessions':[]})
            else:route.continue_()
        page.route('**/api/**',api)
        page.route('**/static/cases/manifest.json',lambda route:route.fulfill(json=[row]))
        page.route('**/static/cases/inspiration/manifest.json',lambda route:route.fulfill(json={'cases':[],'categories':[]}))
        page.route('**'+row['conversationUrl'],lambda route:route.fulfill(json=fixture))
        if '--live' not in sys.argv:
            for asset in ('app.js','cases.js'):
                page.route('**/static/'+asset+'*',lambda route,request,asset=asset:route.fulfill(content_type='text/javascript',body=(root/'app/static'/asset).read_text()))
        page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
        page.wait_for_function('window.veyaCases?.length>0')
        page.evaluate('''()=>{
            startNewChat(false,false);lastQuestion='不应串入案例的旧问题';
            volatileSessions=[{id:'existing',question:'已有问题',interpretation:'已有答案',title:'已有会话',messages:[]}];
            window.qaBefore=JSON.stringify(loadSessions());window.qaPersist=0;
            const original=persistChatSession;persistChatSession=session=>{window.qaPersist++;return original(session)};
        }''')
        case=page.locator('[data-case="'+row['id']+'"]').first
        case.dispatch_event('click')
        page.wait_for_function("document.querySelector('.cachedCaseAnswer')?.shareSession")
        page.evaluate('''()=>{
            if(currentSession!==null||qaPersist||JSON.stringify(loadSessions())!==qaBefore)throw Error('case created or changed history');
            const a=document.querySelector('.cachedCaseAnswer');
            if(!a.shareSession.id.startsWith('share-')||a.shareSession.question!==a.dataset.question)throw Error('case share borrowed a chat');
            openShareDialog(a);
            if(currentSession!==null||qaPersist||JSON.stringify(loadSessions())!==qaBefore)throw Error('opening share persisted case');
        }''')
        assert page.evaluate('persistShareSession(activeShareSession)')
        page.evaluate('closeShareDialog()')
        page.locator('#caseBackButton').click()
        page.evaluate("()=>{if(currentSession!==null||qaPersist||JSON.stringify(loadSessions())!==qaBefore)throw Error('closing case changed history')}")
        case.dispatch_event('click')
        page.wait_for_function("document.querySelector('.cachedCaseAnswer')?.shareSession")
        page.locator('#caseAskButton').click()
        assert page.evaluate('currentSession===null && qaPersist===0')
        assert page.locator('#question').input_value()==row['question']
        assert not any('/api/chat/runs' in url or '/api/chat/sessions' in url or '/api/session-title' in url for url in writes),writes
        page.locator('#submitButton').click()
        page.wait_for_function("currentSession?.status==='completed' && currentSession.lastRunId==='case-qa-run'")
        result=page.evaluate('''()=>{
            if(!currentSession.id.startsWith('session-')||currentSession.messages[0].role!=='user'||qaPersist<1)throw Error('real send did not create a normal chat');
            if(loadSessions().length!==2)throw Error('real send created an unexpected number of sessions');
            return {width:innerWidth,caseReadOnly:true,shareReadOnly:true,closeReadOnly:true,askDraftReadOnly:true,realSendCreatesOneSession:true};
        }''')
        checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
