"""No streaming caret; compact chart action without shrinking its hit area."""
from pathlib import Path
import json
import sys
from playwright.sync_api import sync_playwright

root=Path(__file__).parents[1]
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        for theme in ('light','dark'):
            page=browser.new_page(viewport={'width':width,'height':900})
            if '--live' not in sys.argv:
                for asset in ('app.js','styles.css'):
                    page.route('**/static/'+asset+'*',lambda route,request,asset=asset:route.fulfill(status=200,content_type='text/javascript' if asset.endswith('.js') else 'text/css',body=(root/'app/static'/asset).read_text()))
            page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
            page.wait_for_function("typeof renderStreamAnswerText==='function'")
            result=page.evaluate('''theme=>{
                document.documentElement.dataset.theme=theme;
                const a=createAssistantMessage('样式回归',{target:document.body});
                a.dataset.lang='zh-CN';
                renderStreamAnswerText(a,{blockId:'answer',delta:'**本周表现**'});
                const text=a.querySelector('.streamingAnswer');
                const caret=getComputedStyle(text,'::after');
                if(!['none','normal',''].includes(caret.content))throw Error('streaming cursor still present');
                renderStreamAnswerText(a,{blockId:'answer',delta:'：持续输出。'});
                if(!a.querySelector('.streamingAnswer strong')||!a.querySelector('.finalAnswer').textContent.includes('持续输出'))throw Error('streaming prose or emphasis changed');
                const node=document.createElement('section');
                node.innerHTML='<h2 class="chart-title">本周主要指数涨跌幅</h2>';
                const shell=withArtifactWidgetControl(node,{url:'/fixture.html'});
                a.append(shell);
                const button=shell.querySelector('.artifactAddToWidget');
                const style=getComputedStyle(button);
                if(style.marginLeft!=='4px'||button.getBoundingClientRect().width!==28)throw Error('chart action spacing/hit area incorrect');
                a.remove();return {width:innerWidth,theme,noCaret:true,incrementalText:true,emphasis:true,actionGap:4,buttonWidth:28};
            }''',theme)
            checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
