"""Exercise the saved native chart editor at desktop/mobile sizes, without an agent run."""
from pathlib import Path
import json
import re
import sys
import requests
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL='https://weiweidesigner.com/mentora/share-artifact/deepseek-sse-short-trend.html'
live='--live' in sys.argv
document=requests.get(URL,timeout=30).text
if not live:
    scripts='\n'.join((ROOT/'app/static'/name).read_text() for name in ('artifact-presentation.js','kline-pine.js'))
    document=re.sub(r'<script data-artifact-host-theme="[^"]*">.*?</script>',lambda _:'<script data-artifact-host-theme="dark">'+scripts+'</script>',document,flags=re.S)
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        outer=browser.new_page(viewport={'width':width,'height':1000})
        errors=[];outer.on('pageerror',lambda error:errors.append(str(error)))
        outer.route('**/share-artifact/deepseek-sse-short-trend.html*',lambda route:route.fulfill(content_type='text/html',body=document))
        outer.route('**/pine-editor-qa',lambda route:route.fulfill(content_type='text/html',body='<style>body{margin:0}iframe{width:100%;height:1800px;border:0}</style><iframe class="reportDocumentFrame" src="'+URL+'?theme=dark"></iframe>'))
        outer.goto('https://weiweidesigner.com/mentora/pine-editor-qa',wait_until='networkidle')
        page=outer.frames[1]
        page.wait_for_selector('.kline-code-toggle')
        # Enable the same iframe-only title action handshake used by the chat host.
        page.evaluate("dispatchEvent(new MessageEvent('message',{source:parent,data:{type:'mentora:widget-control'}}))")
        page.wait_for_selector('.kline-title [data-widget-title-action]')
        page.locator('.kline-code-toggle').click()
        editor=page.locator('[data-code]')
        assert page.locator('.kline-pine-bar,[data-code-state],[data-action=copy],[data-action=clear]').count()==0
        assert page.locator('.kline-pine button').count()==1
        assert not page.locator('[data-status]').is_visible()
        surface=page.locator('.kline-pine-surface').bounding_box()
        run_button=page.locator('[data-action=run]').bounding_box()
        assert abs(run_button['x']-surface['x'])<2 and run_button['y']>=surface['y']+surface['height'],(surface,run_button)
        if live:
            assert 'EMA5' in editor.input_value(), 'Exact historical source was not restored'
        editor.fill('//@version=5\nindicator("QA EMA", overlay=true)\nplot(ta.ema(close, 5), title="QA EMA", color=color.orange)')
        assert page.locator('.pine-token-function').count()>0
        assert not page.locator('.chart-host').is_visible()
        for legend in page.locator('.kline-mobile-legend,.kline-mobile-levels').all():
            assert not legend.is_visible(), 'Chart-only mobile labels leaked into the editor'
        bounds=page.locator('.kline-pine-surface').bounding_box()
        assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1,bounds
        page.locator('.kline-code-toggle').click();page.locator('.kline-code-toggle').click()
        assert 'QA EMA' in editor.input_value()
        assert not page.locator('[data-status]').is_visible()
        if not live:
            def plot(route):
                payload=route.request.post_data_json
                route.fulfill(content_type='application/json',body=json.dumps({'period':payload['period'],'timestamps':[r['time'] for r in payload['rows']],'plots':[{'title':'QA EMA','values':[r['close'] for r in payload['rows']],'color':'#f59e0b'}],'hlines':[],'barCount':len(payload['rows'])}))
            outer.route('**/api/portfolio/pine/plot',plot)
        page.locator('[data-action="run"]').click()
        page.wait_for_function("!document.querySelector('[data-action=run]').disabled")
        assert page.locator('.kline-component').get_attribute('data-pine-view')=='chart',page.locator('[data-status]').inner_text()
        assert 'QA EMA' in page.locator('.kline-pine-legend').inner_text()
        assert page.locator('.kline-title [data-widget-title-action]').count()==1
        page.locator('.kline-code-toggle').click()
        assert 'QA EMA' in editor.input_value()
        if '--screenshots' in sys.argv:
            outer.screenshot(path=f'/tmp/mentora-pine-editor-{width}.png')
        assert not errors,errors
        # Reopen the same native chart without Pine receipts: no generic editor entry.
        def remove_pine(match):
            config=json.loads(match[2]);config['pineOverlays']=[]
            return match[1]+json.dumps(config,ensure_ascii=False)+match[3]
        plain=re.sub(r'(\bconst config = )(\{[^\n]*\})(;)',remove_pine,document)
        outer.route('**/pine-editor-without-source.html',lambda route:route.fulfill(content_type='text/html',body=plain))
        page.goto('https://weiweidesigner.com/mentora/pine-editor-without-source.html',wait_until='networkidle')
        assert page.locator('.kline-code-toggle,.kline-pine').count()==0
        assert page.locator('.chart-host').is_visible()
        checks.append({'width':width,'toggle':True,'highlight':True,'editable':True,'runApplied':True,'widgetAction':True,'runBottomLeft':True,'noSourceNoIcon':True,'liveAPI':live})
        outer.close()
    browser.close()
print(json.dumps(checks))
