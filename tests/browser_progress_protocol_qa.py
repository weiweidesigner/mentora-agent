"""Exercise candidate JS through the real page, without starting an agent run."""
from pathlib import Path
import json
import sys
from playwright.sync_api import sync_playwright

source=(Path(__file__).parents[1]/'app/static/app.js').read_text()
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        for theme in ('light','dark'):
            page=browser.new_page(viewport={'width':width,'height':900})
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            if '--live' not in sys.argv:
                page.route('**/static/app.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=source))
            page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
            page.wait_for_function("typeof handleStreamEvent==='function'")
            result=page.evaluate('''theme=>{
                document.documentElement.dataset.theme=theme;
                const article=createAssistantMessage('进度协议验证',{target:document.body});
                article.dataset.lang='zh-CN';article.dataset.thinkingState='active';
                const send=(event,data)=>handleStreamEvent(article,event,data);
                const title=()=>article.querySelector('.thinkingSummaryText').textContent;
                const legacyElapsed=document.createElement('div');legacyElapsed.className='thinkingElapsedLive';article.querySelector('.assistantBubble').prepend(legacyElapsed);
                send('progress',{blockId:'p1',text:'核对日期与数据口径',kind:'commentary'});
                if(!title().startsWith('已处理'))throw Error('elapsed header missing');
                if(article.querySelector('.thinkingElapsedLive'))throw Error('legacy duplicate elapsed label remains');
                if(article.querySelector('.activityLiveThinking'))throw Error('synthetic thinking placeholder remains');
                if(!article.querySelector('.thinkingCurrentTool').textContent.includes('核对日期与数据口径'))throw Error('current stage missing');
                send('tool_step',{tool:'bash',callId:'b',phase:'started',thoughtSummary:'加载市场数据',params:['true']});
                if(!article.querySelector('.thinkingFlow').textContent.includes('加载市场数据'))throw Error('new tool missing from timeline');
                send('progress',{blockId:'p2',text:'汇总本周表现',kind:'commentary'});
                if(!article.querySelector('.thinkingFlow').textContent.includes('汇总本周表现'))throw Error('new progress missing from timeline');
                send('tool_step',{tool:'bash',callId:'b',phase:'completed',thoughtSummary:'加载市场数据',params:['true']});
                if(!title().startsWith('已处理'))throw Error('tool completion replaced elapsed header');
                if(article.querySelector('.finalAnswer').textContent.trim())throw Error('progress leaked into answer');
                if(article.querySelector('.thinkingFlow')?.hidden!==true)throw Error('full history should start collapsed');
                if(article.querySelector('.thinkingCurrentTool').textContent.includes('核对日期'))throw Error('old stage remains in compact view');
                if(!article.querySelector('.thinkingCurrentTool').textContent.includes('汇总本周表现'))throw Error('latest stage missing from compact view');
                send('answer_text',{blockId:'answer',delta:'**已核实结论**：结果为 2。'});
                if(!article.querySelector('.finalAnswer').textContent.includes('结果为 2'))throw Error('answer not streamed immediately');
                send('tool_step',{tool:'read',callId:'later',phase:'started',thoughtSummary:'核对组件',params:['/outputs/fixture.json']});
                if(!article.querySelector('.finalAnswer').textContent.includes('结果为 2'))throw Error('later tool hid answer');
                send('progress',{blockId:'p3',text:'验证组件展示',kind:'commentary'});
                const body=article.querySelector('.finalAnswer').textContent;
                if(body.includes('验证组件展示')||body.includes('核对日期'))throw Error('duplicate progress paragraph');
                if(!article.querySelector('.thinkingFlow').textContent.includes('验证组件展示'))throw Error('latest timeline item not current');
                if(!article.querySelector('.thinkingFlow').textContent.includes('核对日期'))throw Error('lost history');
                article.querySelector('.thinkingTrigger').click();
                if(article.querySelector('.thinkingFlow').hidden)throw Error('history did not expand on click');
                if(!article.querySelector('.thinkingCurrentTool').hidden)throw Error('compact activity duplicated expanded history');
                article.querySelector('.thinkingTrigger').click();
                if(!article.querySelector('.thinkingFlow').hidden)throw Error('history did not collapse on click');
                if(article.querySelector('.thinkingCurrentTool').hidden)throw Error('latest stage not restored');
                article.remove();return {width:innerWidth,theme,progressOnlyInThinking:true,latestStatus:true,answerImmediate:true,history:true};
            }''',theme)
            assert not errors, errors
            checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
