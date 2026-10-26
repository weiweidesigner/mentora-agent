"""Offline browser regression: backdrop dismissal and real hollow canvas bars."""
import importlib.util
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
script=ROOT/'app/skills/business-chart-recall/scripts/kline.py'
spec=importlib.util.spec_from_file_location('continuity_kline',script)
kline=importlib.util.module_from_spec(spec);spec.loader.exec_module(kline)
# Explicit renderer-only fixture, not market evidence.
rows=[dict(time=1700000000000+i*86400000,open=100+i%8,high=112+i%8,low=96+i%8,close=105+i%8,volume=1000+i*10) for i in range(90)]
chart=kline.render_document(dict(type='kline',props=dict(code='TEST',dataType='1d',availablePeriods=['1d'],ma=[],subIndicators=['VOL','MACD']),dataByPeriod={'1d':rows}))
shell=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'app/static/index.html').read_text(),flags=re.S)
shell=shell.replace('</body>','<script src="/static/day-tasks.js"></script><script src="/static/workflows.js"></script></body>')
def route(r):
    path=r.request.url.split('http://continuity.test')[-1].split('?')[0]
    if path=='/chart':return r.fulfill(body=chart,content_type='text/html')
    if path=='/':return r.fulfill(body=shell,content_type='text/html')
    if path.startswith('/api/'):return r.fulfill(json=dict(tasks=[],sceneTasks=[],markets=[],serverTime='2026-10-26T00:00:00Z',tools=[],kinds=[]))
    file=ROOT/'app'/path.lstrip('/')
    return r.fulfill(path=str(file)) if file.is_file() else r.fulfill(status=404,body='')

with sync_playwright() as runtime:
    browser=runtime.chromium.launch()
    for width in (390,1280):
        page=browser.new_page(viewport=dict(width=width,height=900));page.route('http://continuity.test/**',route)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.add_init_script("""window.outlines=[];const original=CanvasRenderingContext2D.prototype.strokeRect;CanvasRenderingContext2D.prototype.strokeRect=function(...args){window.outlines.push(args);return original.apply(this,args);};""")
        page.goto('http://continuity.test/chart')
        assert not page.locator('.period-tabs').count()
        page.evaluate("""()=>{window.outlines=[];document.querySelector('.kline-component').dispatchEvent(new CustomEvent('kline-config-update',{detail:{volumeBarStyle:'hollow',macdBarStyle:'hollow'}}));}""")
        first=page.evaluate('window.outlines.length');assert first>20,first
        page.evaluate("""()=>{window.outlines=[];document.querySelector('.kline-component').dispatchEvent(new CustomEvent('kline-config-update',{detail:{maLineWidth:3,candleUpColor:'#abcdef'}}));}""")
        assert page.evaluate('window.outlines.length')==first
        page.goto('http://continuity.test/')
        page.evaluate("window.MentoraWorkflow.open({title:'已保存',workflow:{version:1,nodes:[],edges:[]}})")
        assert page.locator('.wfCanvas').is_visible()
        page.mouse.click(width/2,20)
        assert not page.locator('.wfCanvas').is_visible()
        page.evaluate("window.MentoraWorkflow.open({title:'已保存',workflow:{version:1,nodes:[],edges:[]}})")
        page.locator('#wfTitle').fill('未保存的修改');page.mouse.click(width/2,20)
        assert page.locator('.wfDiscard').is_visible()
        page.locator('[data-discard=cancel]').click();assert page.locator('.wfCanvas').is_visible()
        assert not errors,errors
        print(json.dumps(dict(width=width,hollowBars=True,consecutivePatch=True,backdropClose=True,unsavedGuard=True)))
        page.close()
    browser.close()
