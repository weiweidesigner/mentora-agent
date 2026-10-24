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
            result=page.evaluate('''async theme=>{
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
                node.innerHTML='<h2 class="chart-title" style="font-size:16px">本周主要指数涨跌幅</h2>';
                const shell=withArtifactWidgetControl(node,{url:'/fixture.html'});
                a.append(shell);
                const button=shell.querySelector('.artifactAddToWidget');
                const style=getComputedStyle(button);
                const range=document.createRange();range.selectNodeContents(button.parentElement.firstChild);
                const visibleGap=button.querySelector('svg').getBoundingClientRect().left-range.getBoundingClientRect().right;
                if(style.marginLeft!=='6px'||button.getBoundingClientRect().width!==28||Math.abs(visibleGap-6)>.6)throw Error('chart visible icon gap/hit area incorrect: '+visibleGap);
                const frame=document.createElement('iframe');frame.style.width='100%';
                const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
                frame.srcdoc='<style>.chart-title{margin:0;font-size:16px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}</style><h2 class="chart-title">本周A股主要指数涨跌幅</h2>';
                a.append(withArtifactWidgetControl(frame,{url:'/fixture-frame.html'}));
                await loaded;await new Promise(resolve=>requestAnimationFrame(resolve));
                const frameTitle=frame.contentDocument.querySelector('.chart-title');
                const frameButton=frameTitle.querySelector('.artifactAddToWidget');
                const frameRange=frame.contentDocument.createRange();frameRange.selectNodeContents(frameTitle.firstChild);
                const frameGap=frameButton.querySelector('svg').getBoundingClientRect().left-Array.from(frameRange.getClientRects()).at(-1).right;
                if(Math.abs(frameGap-6)>.6)throw Error('iframe component visible gap incorrect: '+frameGap);
                a.remove();return {width:innerWidth,theme,noCaret:true,incrementalText:true,emphasis:true,visibleIconGap:visibleGap,iframeIconGap:frameGap,buttonWidth:28};
            }''',theme)
            checks.append(result);page.close()
    browser.close()
print(json.dumps(checks))
