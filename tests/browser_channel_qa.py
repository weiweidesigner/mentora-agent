"""Verify native answer routing, Markdown and the compact live-tool gap."""
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

base=Path(__file__).parent
assets=base if (base/'app.js').exists() else base.parent/'app/static'
source=(assets/'app.js').read_text()
with sync_playwright() as p:
    browser=p.chromium.launch();checks=[]
    for width in (390,1280):
        for theme in ('light','dark'):
            page=browser.new_page(viewport={'width':width,'height':900})
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            if '--live' not in sys.argv:
                page.route('**/static/app.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=source))
            page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
            page.wait_for_function("typeof renderStreamAnswerText==='function'")
            result=page.evaluate('''theme=>{
                document.documentElement.dataset.theme=theme;
                const article=createAssistantMessage('输出通道验证',{target:document.body});article.taskContext={question:'fixture'};
                renderPublicProgress(article,{blockId:'progress',text:'获取全市场收盘快照'});
                renderStreamAnswerText(article,{blockId:'answer',delta:'**核心结论：本周市场表现如下。**',provisional:true,final:false});
                const answer=article.querySelector('.finalAnswer'),thinking=article.querySelector('.thinkingSteps');
                const strong=answer.querySelector('strong');
                if(!strong||strong.textContent!=='核心结论：本周市场表现如下。')throw Error('answer delta is held or displayed as plain thinking');
                if(thinking.textContent.includes('核心结论')||article.querySelector('.thinkingSummaryText').textContent.includes('核心结论'))throw Error('answer leaked into thinking');
                appendToolStep(article,{callId:'test',tool:'bash',params:[JSON.stringify({command:'date'})],thoughtSummary:'获取全市场收盘快照',phase:'started'});
                if(!answer.contains(strong)||thinking.textContent.includes('核心结论'))throw Error('tool boundary reclassified the answer');
                const tool=article.querySelector('.thinkingFlow .activityAction');
                if(!tool)throw Error('live tool missing');
                if(article.querySelector('.thinkingFlow').hidden)throw Error('live timeline collapsed');
                renderPublicProgress(article,{blockId:'next',text:'核对快照结果'});
                if(!article.querySelector('.thinkingFlow').textContent.includes('核对快照结果'))throw Error('explicit progress does not update timeline');
                const restored=createAssistantMessage('历史记录验证',{target:document.body});restored.activityEnded=true;
                replayOrderedStream(restored,[{kind:'text',id:'earlier',text:'**部分结论**'},{kind:'tool_step',data:{tool:'read'}},{kind:'progress',id:'legacy',data:{provisional:true,text:'兼容旧版本的公开正文'}}],restored.querySelector('.finalAnswer'));
                if(!restored.querySelector('.finalAnswer strong')||!restored.querySelector('.finalAnswer').textContent.includes('兼容旧版本'))throw Error('replay heuristics moved public answer into thinking');
                const result={width:innerWidth,theme,answerImmediate:true,noToolBoundaryReclassification:true,markdown:true,liveTimeline:true};
                article.remove();restored.remove();return result;
            }''',theme)
            assert not errors,errors
            checks.append(result);page.close()
    browser.close();print(json.dumps(checks))
