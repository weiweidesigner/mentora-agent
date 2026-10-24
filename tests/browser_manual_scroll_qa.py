"""Streaming, artifact growth and completion never move the reader; clicks do."""
from pathlib import Path
import json
import sys
from playwright.sync_api import sync_playwright

root=Path(__file__).parents[1];checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        for theme in ('light','dark'):
            page=browser.new_page(viewport={'width':width,'height':900},reduced_motion='reduce')
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            if '--live' not in sys.argv:
                for asset in ('app.js','styles.css'):
                    page.route('**/static/'+asset+'*',lambda route,request,asset=asset:route.fulfill(status=200,content_type='text/javascript' if asset.endswith('.js') else 'text/css',body=(root/'app/static'/asset).read_text()))
                page.route('**/mentora/',lambda route:route.fulfill(status=200,content_type='text/html',body=(root/'app/static/index.html').read_text().replace('src="/static/','src="/mentora/static/').replace('href="/static/','href="/mentora/static/')))
            page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
            page.wait_for_function("typeof updateScrollHint==='function'")
            result=page.evaluate('''async theme=>{
                const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
                document.documentElement.dataset.theme=theme;
                messages.replaceChildren();conversation.classList.remove('is-empty');
                messages.style.cssText='flex:0 0 260px;height:260px;min-height:260px';
                const a=createAssistantMessage('验证手动滚动');a.dataset.lang='zh-CN';
                const hint=document.querySelector('#scrollToBottomButton');
                messages.scrollTop=0;await settle();
                const top=messages.scrollTop;
                for(let i=0;i<10;i++){
                    renderStreamAnswerText(a,{blockId:'a',delta:'正文持续输出，不移动正在阅读的位置。\\n\\n'.repeat(4)});
                    await settle();
                    if(Math.abs(messages.scrollTop-top)>1)throw Error('stream moved scroll position');
                }
                if(hint.hidden||!hint.classList.contains('is-loading')||!hint.textContent.includes('生成中')||!hint.getAttribute('aria-label').includes('生成中'))throw Error('missing generating hint');
                hint.click();await settle();
                if(messages.scrollHeight-messages.scrollTop-messages.clientHeight>2||!hint.hidden)throw Error('click did not reach latest content: '+[messages.scrollHeight,messages.scrollTop,messages.clientHeight,hint.hidden]);
                const clickedTop=messages.scrollTop;
                renderStreamAnswerText(a,{blockId:'a',delta:'点击之后继续生成，也不能重新自动跟随。\\n\\n'.repeat(8)});await settle();
                if(Math.abs(messages.scrollTop-clickedTop)>1||hint.hidden)throw Error('click enabled sticky following');
                const chart=document.createElement('div');chart.style.height='500px';a.append(chart);await settle();
                if(Math.abs(messages.scrollTop-clickedTop)>1)throw Error('artifact growth moved reader');
                a.activityEnded=true;a.dataset.thinkingState='done';scheduleScrollHint();await settle();
                if(hint.hidden||hint.classList.contains('is-loading')||hint.textContent.includes('生成中'))throw Error('completed hint still generating');
                // Completion used to jump to the answer's start. Assert that path is gone.
                a.taskContext={};
                renderFinalAnswer(a,{question:'验证',interpretation:'最终正文',sources:[],streamBlocks:[{kind:'text',id:'done',text:'最终正文\\n\\n'.repeat(100)}]});await settle();
                if(Math.abs(messages.scrollTop-clickedTop)>1)throw Error('completion jumped to answer start');
                if(getComputedStyle(messages).overflowAnchor!=='none')throw Error('browser scroll anchoring still enabled');
                return {width:innerWidth,theme,noAutomaticScroll:true,generatingHint:true,manualJump:true,noStickyAfterClick:true,artifactStable:true,completionStable:true};
            }''',theme)
            assert not errors,errors
            checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
