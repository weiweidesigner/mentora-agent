"""A delayed title and stale session poll must not replay a completed answer."""
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

source=(Path(__file__).parents[1]/'app/static/app.js').read_text()
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        page=browser.new_page(viewport={'width':width,'height':900})
        if '--live' not in sys.argv:
            page.route('**/static/app.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=source))
        page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
        page.wait_for_function("typeof recordAssistantResult==='function'")
        result=page.evaluate('''async()=>{
            await serverSessionReady;
            const realFetch=window.fetch, originalResume=resumeChatRun;
            let resolveTitle, resumeCount=0;
            const now=Date.now();
            const running={id:'settlement-qa',question:'验证流式结果',title:'验证流式结果',requestId:'request-qa',activeRunId:'run-qa',status:'running',createdAt:now,updatedAt:now,messages:[{role:'user',text:'验证流式结果'}]};
            currentSession=structuredClone(running);storeSessions([currentSession]);
            window.fetch=async(url,options)=>{
                if(String(url)==='/api/session-title') return await new Promise(resolve=>{resolveTitle=resolve;});
                // Deliberately newer clock time: run identity and terminal state
                // must take precedence over a delayed running snapshot's timestamp.
                if(String(url)==='/api/chat/sessions') return {ok:true,json:async()=>({sessions:[{...running,updatedAt:now+60000}]})};
                return realFetch(url,options);
            };
            resumeChatRun=async()=>{resumeCount++;};
            const article=createAssistantMessage('验证流式结果');
            renderStreamAnswerText(article,{blockId:'answer-qa',delta:'**答案只输出一次。**'});
            const answerNode=article.querySelector('.streamAnswerPreview');
            renderFinalAnswer(article,{chatRunId:'run-qa',interpretation:'**答案只输出一次。**',sources:[],streamBlocks:[{kind:'text',id:'answer-qa',text:'**答案只输出一次。**'}]});
            const storedBeforeTitle=loadSessions().find(s=>s.id===running.id);
            await syncServerSessions();
            const stayedConnected=article.isConnected&&answerNode.isConnected;
            const storedAfterPoll=loadSessions().find(s=>s.id===running.id);
            resolveTitle({ok:true,json:async()=>({title:'自动标题'})});
            await new Promise(resolve=>setTimeout(resolve,10));
            if(storedBeforeTitle?.status!=='completed')throw Error('completion was not persisted before title request; '+JSON.stringify({stayedConnected,resumeCount,storedStatus:storedAfterPoll?.status}));
            if(storedAfterPoll?.status!=='completed')throw Error('stale running poll overwrote completed result');
            if(!stayedConnected||resumeCount)throw Error('completed answer was cleared and replayed');
            if(article.querySelectorAll('.streamAnswerPreview').length!==1)throw Error('answer rendered more than once');
            for(const change of ['followup','rename']){
                currentSession={...structuredClone(running),id:'settlement-'+change,messages:[{role:'user',text:'原问题'}]};
                storeSessions([currentSession]);
                const naming=recordAssistantResult({chatRunId:'run-qa',interpretation:'原回答',sources:[]});
                const newer=loadSessions()[0];
                if(change==='followup'){
                    newer.requestId='request-next';newer.activeRunId='run-next';newer.status='running';
                    newer.messages.push({role:'user',text:'后续追问'});
                }else{newer.title='手动标题';newer.customTitle=true;}
                currentSession=newer;storeSessions([newer]);
                resolveTitle({ok:true,json:async()=>({title:'迟到的旧标题'})});
                await naming;
                const kept=loadSessions()[0];
                if(change==='followup'&&(kept.requestId!=='request-next'||kept.status!=='running'||kept.messages.at(-1).text!=='后续追问'))throw Error('late naming overwrote a follow-up');
                if(change==='rename'&&kept.title!=='手动标题')throw Error('late naming overwrote a manual rename');
            }
            window.fetch=realFetch;resumeChatRun=originalResume;
            article.remove();currentSession=null;storeSessions([]);
            return {width:innerWidth,persistedBeforeTitle:true,stalePollIgnored:true,answerNodePreserved:true,resumeCount,followupPreserved:true,manualTitlePreserved:true};
        }''')
        results.append(result);page.close()
    browser.close()
print(json.dumps(results))
