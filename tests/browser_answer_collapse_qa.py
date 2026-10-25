"""First answer collapses thinking once; later events respect manual replay."""
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
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            if '--live' not in sys.argv:
                page.route('**/static/app.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=source))
            page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
            page.wait_for_function("typeof renderStreamAnswerText==='function'")
            result=page.evaluate('''theme=>{
                document.documentElement.dataset.theme=theme;
                const a=createAssistantMessage('验证答案开始时自动收起',{target:document.body});
                a.dataset.lang='zh-CN';a.dataset.thinkingState='active';
                appendToolStep(a,{tool:'bash',callId:'b',phase:'started',thoughtSummary:'核对数据',params:['true']});
                setInlineActivityExpanded(a,true);
                const expanded=()=>!a.querySelector('.thinkingFlow').hidden;
                if(!expanded())throw Error('fixture not expanded');
                renderStreamAnswerText(a,{blockId:'empty',text:'  '});
                renderStreamAnswerText(a,{blockId:'discard',discard:true});
                if(!expanded())throw Error('empty/discard event collapsed activity');
                renderStreamAnswerText(a,{blockId:'answer',delta:'**已核实结论**'});
                if(expanded()||a.querySelector('.thinkingTrigger').getAttribute('aria-expanded')!=='false')throw Error('first answer did not collapse thinking');
                if(!a.querySelector('.thinkingCurrentTool').hidden)throw Error('tool row still visible during answer');
                if(a.querySelector('.thinkingTrigger').classList.contains('is-thinking'))throw Error('thinking style remains during answer');
                if(!a.querySelector('.thinkingSteps li.is-loading'))throw Error('first answer falsely completed a running tool');
                if(a.activityEnded)throw Error('collapse prematurely ended run');
                if(!a.querySelector('.thinkingSummaryText').textContent.startsWith('已处理'))throw Error('elapsed header missing');
                if(a.querySelectorAll('.thinkingElapsedLive').length)throw Error('duplicate elapsed label rendered');
                if(!a.querySelector('.finalAnswer').textContent.includes('已核实结论'))throw Error('answer delayed');
                const semantics={provider:'local-laya',status:'classified',stage:'inspect-contract'};
                appendToolStep(a,{tool:'bash',callId:'b',phase:'started',thoughtSummary:'正在确认组件规范与数据契约',activitySemantics:semantics,semanticUpdate:true,params:['true']});
                if(!a.querySelector('.thinkingSummaryText').textContent.startsWith('已处理'))throw Error('late semantics replaced elapsed header');
                setModelActivity(a,'completed');
                appendToolStep(a,{tool:'bash',callId:'b',phase:'completed',thoughtSummary:'核对数据',params:['true']});
                renderPublicProgress(a,{blockId:'p',text:'检查图表'});
                setModelActivity(a,'started');
                if(a.dataset.activityPhase!=='answer'||!a.querySelector('.thinkingCurrentTool').hidden||expanded())throw Error('later event revived thinking during answer');
                setInlineActivityExpanded(a,true);
                renderStreamAnswerText(a,{blockId:'answer',delta:'：正文继续输出。'});
                if(!expanded())throw Error('later delta overrode manual history reopening');
                setInlineActivityExpanded(a,false);
                renderStreamAnswerText(a,{blockId:'answer',delta:'仍在输出。'});
                if(expanded())throw Error('later delta overrode manual collapse');
                const b=createAssistantMessage('验证侧栏收起',{target:document.body});
                b.dataset.thinkingState='active';openActivityDrawer(b);
                renderStreamAnswerText(b,{blockId:'b-answer',delta:'正式答案'});
                if(activeActivityArticle===b||!b.querySelector('.thinkingFlow').hidden)throw Error('answer left activity panel open');
                renderStreamAnswerText(b,{blockId:'b-answer',discard:true});
                if(b.answerTextStarted||b.dataset.activityPhase==='answer')throw Error('retracted commentary left answer mode active');
                renderPublicProgress(b,{blockId:'b-answer',text:'已归类为执行进度'});
                if(b.querySelector('.finalAnswer').textContent.trim())throw Error('retracted progress remains in answer');
                if(!isMobileLayout()&&b.querySelector('.thinkingFlow').hidden)throw Error('retraction lost previous history state');
                renderStreamAnswerText(b,{blockId:'real',delta:'真正的正式回答'});
                if(!b.querySelector('.thinkingFlow').hidden||!b.querySelector('.thinkingCurrentTool').hidden)throw Error('real answer after retraction did not collapse');
                closeActivityDrawer();
                a.remove();b.remove();return {width:innerWidth,theme,firstDeltaCollapsed:true,runStillActive:true,manualReplayPreserved:true,retractionRecovered:true};
            }''',theme)
            assert not errors,errors
            checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
