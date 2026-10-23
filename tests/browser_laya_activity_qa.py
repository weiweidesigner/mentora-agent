"""Classifications update one tool without reviving old states or touching prose."""
from pathlib import Path
import json
import sys
from playwright.sync_api import sync_playwright

root=Path(__file__).parents[1];checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        for theme in ('light','dark'):
            page=browser.new_page(viewport={'width':width,'height':900})
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            if '--live' not in sys.argv:
                page.route('**/static/app.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=(root/'app/static/app.js').read_text()))
            page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
            page.wait_for_function("typeof appendToolStep==='function'")
            result=page.evaluate('''theme=>{
                document.documentElement.dataset.theme=theme;
                const a=createAssistantMessage('Laya工具语义验证',{target:document.body});a.dataset.lang='zh-CN';
                const pending={provider:'local-laya',status:'pending'};
                const semantics={provider:'local-laya',status:'classified',stage:'render-chart',providerModel:'local-laya-fixture',confidence:.9,labelSource:'stage-label'};
                const step=(id,phase,thoughtSummary,extra={})=>appendToolStep(a,{tool:'bash',callId:id,phase,thoughtSummary,params:['true'],...extra});
                step('a','started','正在识别步骤语义',{activitySemantics:pending});
                step('a','started','正在把分析结果转换为图表',{activitySemantics:semantics,semanticUpdate:true});
                if(a.querySelectorAll('.thinkingSteps .is-tool-step').length!==1)throw Error('semantic update duplicated running tool');
                if(a.querySelector('.thinkingSummaryText').textContent!=='正在把分析结果转换为图表')throw Error('Laya label not shown');
                step('a','completed','正在把分析结果转换为图表',{activitySemantics:semantics});
                step('b','started','正在识别步骤语义',{activitySemantics:pending});
                const previousTitle=a.querySelector('.thinkingSummaryText').textContent;
                step('a','completed','正在检查图表表达是否准确',{activitySemantics:{...semantics,stage:'validate-visual'},semanticUpdate:true});
                if(a.querySelector('.thinkingSummaryText').textContent!==previousTitle)throw Error('old semantic update stole current status');
                renderPublicProgress(a,{text:'公开进度更新',blockId:'p'});
                step('b','started','正在把分析结果转换为图表',{activitySemantics:semantics,semanticUpdate:true});
                if(a.querySelector('.thinkingSummaryText').textContent!=='公开进度更新')throw Error('late semantics overwrote newer public progress');
                const item=a.querySelector('[data-tool-call-id="a"]');
                if(item.dataset.toolPhase!=='completed'||item.classList.contains('is-loading'))throw Error('completed tool revived');
                if(JSON.parse(item.dataset.activitySemantics).provider!=='local-laya')throw Error('provenance missing');
                step('c','started','正在推进当前分析步骤',{activitySemantics:{...semantics,stage:'execute-step'}});
                setInlineActivityExpanded(a,true);
                if(!a.querySelector('.thinkingFlow').textContent.includes('正在推进当前分析步骤'))throw Error('valid Laya stage hidden by legacy filter');
                renderStreamAnswerText(a,{blockId:'answer',delta:'**正式答案**不应被语义更新改动。'});
                const before=a.querySelector('.finalAnswer').innerHTML;
                step('c','completed','正在推进当前分析步骤',{activitySemantics:{...semantics,stage:'execute-step'},semanticUpdate:true});
                if(a.querySelector('.finalAnswer').innerHTML!==before||!a.querySelector('.thinkingCurrentTool').hidden)throw Error('semantic update interfered with answer/collapse');
                a.remove();return {width:innerWidth,theme,singleTool:true,layaLabel:true,staleProtected:true,completedStatic:true,answerUnchanged:true};
            }''',theme)
            assert not errors,errors
            checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
