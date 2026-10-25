"""Verify the user-selected compact stage and expandable history in the page."""
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

root = Path(__file__).parents[1]
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        for theme in ('light', 'dark'):
            page = browser.new_page(viewport={'width': width, 'height': 900})
            if '--live' not in sys.argv:
                for asset, content_type in [('app.js', 'text/javascript'), ('styles.css', 'text/css')]:
                    body = (root / 'app/static' / asset).read_text()
                    page.route('**/static/' + asset + '*', lambda route, request, body=body, content_type=content_type: route.fulfill(status=200, content_type=content_type, body=body))
            page.goto('https://weiweidesigner.com/mentora/', wait_until='domcontentloaded')
            page.wait_for_function("typeof appendToolStep === 'function'")
            page.evaluate('''theme => {
                document.documentElement.dataset.theme = theme;
                messages.replaceChildren();
                window.qaArticle = createAssistantMessage('执行过程展示验证');
                const a = window.qaArticle;
                a.dataset.startedAt = String(Date.now() - 171000);
                const semantics = {provider:'local-laya',status:'classified'};
                appendToolStep(a,{callId:'read',tool:'read',phase:'completed',thoughtSummary:'正在确认项目与运行环境',params:['README.md'],activitySemantics:semantics});
                appendToolStep(a,{callId:'data',tool:'bash',phase:'completed',thoughtSummary:'正在获取分析所需的市场数据',shellCommand:['python3','price_snapshot.py'],activitySemantics:semantics});
                appendToolStep(a,{callId:'metrics',tool:'bash',phase:'started',thoughtSummary:'正在计算关键指标与对比关系',shellCommand:['python3','calculate.py'],activitySemantics:semantics});
            }''', theme)
            result = page.evaluate('''() => {
                const a=qaArticle, compact=a.querySelector('.thinkingCurrentTool'), full=a.querySelector('.thinkingFlow');
                if(compact.hidden || !full.hidden) throw Error('default view should show only latest stage');
                if(!compact.textContent.includes('正在计算关键指标与对比关系') || !compact.textContent.includes('calculate.py')) throw Error('latest stage/tool missing');
                if(compact.textContent.includes('README') || compact.textContent.includes('price_snapshot')) throw Error('old stage remains visible');
                if(a.querySelector('.activityLiveThinking')) throw Error('synthetic thinking placeholder remains');
                const style=getComputedStyle(a.querySelector('.thinkingTrigger'));
                if(style.fontSize!=='15px') throw Error('elapsed header typography changed');
                return {width:innerWidth,theme:document.documentElement.dataset.theme,latestOnly:true};
            }''')
            if '--screenshots' in sys.argv and width == 1280 and theme == 'dark':
                page.screenshot(path=str(root.parent / 'latest-stage.png'))
            page.evaluate('''() => {
                const a=qaArticle, trigger=a.querySelector('.thinkingTrigger');trigger.click();
                if(a.querySelector('.thinkingFlow').hidden || !a.querySelector('.thinkingCurrentTool').hidden) throw Error('history click failed');
                if(!a.querySelector('.thinkingFlow').textContent.includes('README.md')) throw Error('history lost earlier tool');
            }''')
            if '--screenshots' in sys.argv and width == 1280 and theme == 'dark':
                page.screenshot(path=str(root.parent / 'full-history.png'))
            page.evaluate('''() => {
                const a=qaArticle, trigger=a.querySelector('.thinkingTrigger');trigger.click();
                if(!a.querySelector('.thinkingFlow').hidden || a.querySelector('.thinkingCurrentTool').hidden) throw Error('latest stage not restored');
                completeThinking(a);a.activityEnded=true;a.dataset.thinkingState='done';updateThinkingSummary(a,'');
                if(!a.querySelector('.thinkingFlow').hidden || !a.querySelector('.thinkingCurrentTool').hidden) throw Error('completed activity not collapsed');
                trigger.click();
                if(!a.querySelector('.thinkingFlow').textContent.includes('price_snapshot.py')) throw Error('completed history missing');
            }''')
            checks.append(dict(result,historyToggle=True,completedHistory=True))
            page.close()
    browser.close()
print(json.dumps(checks))
