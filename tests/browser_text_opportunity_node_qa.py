"""Real-browser node creation/save QA; no inference, orders or user tasks."""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from app.text_opportunities import TOOL
html=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'app/static/index.html').read_text(),flags=re.S)
html=html.replace('</body>','<script src="/static/day-tasks.js"></script><script src="/static/workflows.js"></script></body>')
saved=[]
def route(r):
    path=urlparse(r.request.url).path
    if path=='/':return r.fulfill(body=html,content_type='text/html')
    if path=='/api/workflows/catalog':return r.fulfill(json=dict(kinds=[],tools=[TOOL],model='test'))
    if path.startswith('/api/day/tasks') and r.request.method in ('POST','PUT'):
        task={**r.request.post_data_json,'id':'saved-text-test'};saved.append(task);return r.fulfill(json=task)
    if path.startswith('/api/'):return r.fulfill(json=dict(tasks=[],sceneTasks=[],markets=[],serverTime='2026-10-26T00:00:00Z'))
    file=ROOT/'app'/path.lstrip('/')
    return r.fulfill(path=str(file)) if file.is_file() else r.fulfill(status=404,body='')
with sync_playwright() as runtime:
    browser=runtime.chromium.launch()
    for width in (390,1280):
        page=browser.new_page(viewport=dict(width=width,height=900));page.route('https://text-node.test/**',route)
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto('https://text-node.test/')
        page.evaluate('MentoraWorkflow.open()')
        if not page.locator('[data-add=tool][data-tool=text-opportunities]').is_visible():
            page.locator('.wfCanvasTools [data-act=library]').click()
        page.locator('[data-add=tool][data-tool=text-opportunities]').click()
        assert not errors,errors
        text=page.locator('[data-field=opportunityText]');text.fill('AAPL 仅为离线输入保存测试，不是投资事实。')
        assert json.loads(page.locator('[data-json]').input_value())['text'].startswith('AAPL')
        assert not page.locator('[data-field=foreach]').count()
        box=text.bounding_box();assert box['x']>=0 and box['x']+box['width']<=width,box
        page.locator('[data-act=save]').click()
        page.wait_for_function("document.querySelector('#wfNotice').textContent.includes('已保存')")
        node=saved[-1]['workflow']['nodes'][0]
        assert node['tool']=='text-opportunities' and node['arguments']['text'].startswith('AAPL')
        page.evaluate('task=>{document.querySelector(".wfCanvas").close();MentoraWorkflow.open(task)}',saved[-1])
        page.locator('[data-node="'+node['id']+'"]').click()
        assert text.input_value().startswith('AAPL')
        page.locator('[data-act=schedule]').click()
        toggle=page.locator('#dayForm [name=enabled]');assert toggle.is_visible();toggle.uncheck()
        page.locator('#daySave').click()
        page.wait_for_function("!document.querySelector('#dayDialog').open")
        assert saved[-1]['enabled'] is False
        page.locator('[data-act=schedule]').click();assert not toggle.is_checked()
        page.locator('#dayCancelEdit').click()
        page.evaluate('''async()=>{
            document.querySelector('.wfCanvas').close();
            await MentoraWorkflow.open({workflow:{version:1,nodes:[
                {id:'input',kind:'start',title:'离线输入',x:90,y:140},
                {id:'out',kind:'output',title:'离线输出',x:440,y:140}
            ],edges:[{source:'input',target:'out',when:'always'}]},lastTrial:{status:'running',nodes:{input:{status:'success'},out:{status:'running'}}}});
        }''')
        assert page.locator('#wfModelHint').count()==0
        assert page.locator('.wfEdge.is-flowing .wfEdgeLine').evaluate('el=>getComputedStyle(el).display')=='none'
        assert page.locator('.wfEdgeFlow').evaluate('el=>getComputedStyle(el).animationName')=='wf-edge-flow'
        assert not errors,errors
        print(json.dumps(dict(width=width,nodeVisible=True,textEditable=True,saveAndReopen=True,noExecution=True)))
        page.close()
    browser.close()
