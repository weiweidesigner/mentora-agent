"""First answer collapses activity once, without completing the running task."""
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
                const a=createAssistantMessage('验证答案开始时收起',{target:document.body});
                a.dataset.lang='zh-CN';a.dataset.thinkingState='active';
                appendToolStep(a,{tool:'bash',callId:'b',phase:'started',thoughtSummary:'核对数据',params:['true']});
                setInlineActivityExpanded(a,true);
                const expanded=()=>!a.querySelector('.thinkingFlow').hidden;
                if(!expanded())throw Error('fixture not expanded');
                renderStreamAnswerText(a,{blockId:'empty',text:'  '});
                renderStreamAnswerText(a,{blockId:'discard',discard:true});
                if(!expanded())throw Error('empty/discard event collapsed activity');
                renderStreamAnswerText(a,{blockId:'answer',delta:'**已核实结论**'});
                if(expanded()||a.querySelector('.thinkingTrigger').getAttribute('aria-expanded')!=='false')throw Error('first answer did not collapse immediately');
                if(!a.querySelector('.thinkingCurrentTool').hidden)throw Error('tool row still visible during answer');
                if(a.activityEnded)throw Error('collapse prematurely ended run');
                if(!a.querySelector('.finalAnswer').textContent.includes('已核实结论'))throw Error('answer delayed');
                setModelActivity(a,'completed');
                appendToolStep(a,{tool:'bash',callId:'b',phase:'completed',thoughtSummary:'核对数据',params:['true']});
                renderPublicProgress(a,{blockId:'p',text:'检查图表'});
                if(!a.querySelector('.thinkingCurrentTool').hidden||expanded())throw Error('later event reopened activity');
                setInlineActivityExpanded(a,true);
                renderStreamAnswerText(a,{blockId:'answer',delta:'：正文继续输出。'});
                if(!expanded())throw Error('later delta overrode manual reopening');
                setInlineActivityExpanded(a,false);
                openActivityDrawer(a);
                // A second article exercises the drawer on the first delta.
                closeActivityDrawer();
                const b=createAssistantMessage('验证侧栏收起',{target:document.body});
                b.dataset.thinkingState='active';openActivityDrawer(b);
                renderStreamAnswerText(b,{blockId:'b-answer',delta:'正式答案'});
                if(activeActivityArticle===b)throw Error('answer left activity drawer open');
                a.remove();b.remove();return {width:innerWidth,theme,firstDeltaCollapsed:true,runStillActive:true,manualReopenPreserved:true,drawerClosed:true};
            }''',theme)
            assert not errors,errors
            checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
