"""Hold artifact fetches, inspect real loading UI, then release without dwell."""
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
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            if '--live' not in sys.argv:
                page.route('**/static/app.js*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=(root/'app/static/app.js').read_text()))
                page.route('**/static/styles.css*',lambda route:route.fulfill(status=200,content_type='text/css',body=(root/'app/static/styles.css').read_text()))
            pending=[];frames=[]
            page.route('**/generated/qa-loading.html',lambda route:pending.append(route))
            page.route('**/qa-loading-frame.html*',lambda route:frames.append(route))
            page.goto('https://weiweidesigner.com/mentora/',wait_until='domcontentloaded')
            page.wait_for_function("typeof createStreamVisualizationArtifact==='function' && !!window.AimeStreamViz?.mount")
            page.evaluate('''theme=>{
                document.documentElement.dataset.theme=theme;
                const a=createAssistantMessage('图表加载状态验证',{target:document.body});a.id='loading-qa';
                const item={url:'/generated/qa-loading.html',title:'本周 A 股主要指数涨跌幅'};
                a.querySelector('.finalAnswer').append(withArtifactWidgetControl(createStreamVisualizationArtifact(item,0),item));
            }''',theme)
            loading=page.locator('#loading-qa .visualize-widget-loading-inline')
            loading.wait_for(state='visible')
            assert loading.inner_text().strip()=='正在加载图表…'
            assert loading.evaluate("e=>getComputedStyle(e).borderWidth")=='0px'
            assert loading.evaluate("e=>getComputedStyle(e).backgroundColor")=='rgba(0, 0, 0, 0)'
            assert loading.locator('.visualize-widget-loading-icon').evaluate("e=>getComputedStyle(e).display")=='none'
            assert loading.bounding_box()['height'] <= 40
            assert loading.locator('.visualize-widget-loading-text').evaluate("e=>Number(getComputedStyle(e).opacity)<0.8")
            assert loading.evaluate("e=>e.scrollWidth<=e.clientWidth")
            page.locator('#loading-qa .chatArtifactShell').screenshot(path=str(Path(__file__).parent/f'loading-{width}-{theme}.png'))
            page.emulate_media(reduced_motion='reduce')
            assert loading.locator('.visualize-widget-loading-text').evaluate("e=>getComputedStyle(e).animationName")=='none'
            page.emulate_media(reduced_motion='no-preference')
            assert len(pending)==1
            pending[0].fulfill(status=200,content_type='text/html',body='<html><body><svg width="300" height="150"><rect width="80" height="100" fill="#08745f"/></svg></body></html>')
            loading.wait_for(state='hidden',timeout=3000)
            page.locator('#loading-qa .visualize-widget-panel iframe').wait_for(state='visible')
            page.evaluate('''()=>{
                const a=document.querySelector('#loading-qa');
                const frame=createArtifactFallbackFrame({url:'/qa-loading-frame.html'},0);frame.id='fallback-qa';a.querySelector('.finalAnswer').append(frame);
                upsertStreamVisualization(a,{id:'native-qa',reset:true,native:true,title:'生成自定义可视化'});
                const native=a.querySelector('[data-visualization-id="native-qa"]');
                if(!native.querySelector('.streamvizToolThought')||native.dataset.loadingKind==='artifact')throw Error('native generation style changed');
            }''')
            page.locator('#fallback-qa .chartLoadingOverlay').wait_for(state='visible')
            assert len(frames)==1
            frames[0].fulfill(status=200,content_type='text/html',body='<html><body><svg width="300" height="150"></svg></body></html>')
            page.locator('#fallback-qa .chartLoadingOverlay').wait_for(state='detached',timeout=3000)
            assert page.locator('#fallback-qa').get_attribute('data-artifact-ready')=='true'
            assert not errors,errors
            checks.append({'width':width,'theme':theme,'artifactLoading':True,'nativeUnchanged':True,'reducedMotion':True,'noArtificialDwell':True})
            page.close()
    browser.close()
print(json.dumps(checks))
