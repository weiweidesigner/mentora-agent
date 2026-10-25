"""The full live activity stays expanded until the running task completes."""
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
                const a=createAssistantMessage('验证答案开始时保持展开',{target:document.body});
                a.dataset.lang='zh-CN';a.dataset.thinkingState='active';
                appendToolStep(a,{tool:'bash',callId:'b',phase:'started',thoughtSummary:'核对数据',params:['true']});
                setInlineActivityExpanded(a,true);
                const expanded=()=>!a.querySelector('.thinkingFlow').hidden;
                if(!expanded())throw Error('fixture not expanded');
                renderStreamAnswerText(a,{blockId:'empty',text:'  '});
                renderStreamAnswerText(a,{blockId:'discard',discard:true});
                if(!expanded())throw Error('empty/discard event collapsed activity');
                renderStreamAnswerText(a,{blockId:'answer',delta:'**已核实结论**'});
                if(!expanded()||a.querySelector('.thinkingTrigger').getAttribute('aria-expanded')!=='true')throw Error('first answer collapsed live activity');
                if(!a.querySelector('.thinkingCurrentTool').hidden)throw Error('tool row still visible during answer');
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
                if(!a.querySelector('.thinkingCurrentTool').hidden||!expanded())throw Error('later event hid live activity');
                renderStreamAnswerText(a,{blockId:'answer',delta:'：正文继续输出。'});
                if(!expanded())throw Error('later delta collapsed live activity');
                setInlineActivityExpanded(a,false);
                renderStreamAnswerText(a,{blockId:'answer',delta:'仍在输出。'});
                if(expanded())throw Error('later delta overrode manual collapse');
                const b=createAssistantMessage('验证侧栏收起',{target:document.body});
                b.dataset.thinkingState='active';openActivityDrawer(b);
                renderStreamAnswerText(b,{blockId:'b-answer',delta:'正式答案'});
                if(isMobileLayout()&&activeActivityArticle!==b)throw Error('answer closed live activity drawer');
                if(!isMobileLayout()&&b.querySelector('.thinkingFlow').hidden)throw Error('answer collapsed desktop activity');
                closeActivityDrawer();
                a.remove();b.remove();return {width:innerWidth,theme,firstDeltaStayedExpanded:true,runStillActive:true,manualCollapsePreserved:true,drawerStayedOpen:true};
            }''',theme)
            assert not errors,errors
            checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
