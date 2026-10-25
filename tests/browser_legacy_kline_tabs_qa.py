"""Native period controls on real historical HTML; no regeneration or quote requests."""
import json
import re
import sys
from pathlib import Path
import requests
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.artifact_upgrades import sync_native_kline_theme

URL='https://weiweidesigner.com/mentora/share-artifact/deepseek-spy-5m-kline.html'
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        for theme in ('light','dark'):
            response=requests.get(URL+'?theme='+theme,timeout=30);response.raise_for_status()
            document=response.text if '--live' in sys.argv else sync_native_kline_theme(response.text,theme)
            page=browser.new_page(viewport={'width':width,'height':900})
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.route('**/share-artifact/deepseek-spy-5m-kline.html*',lambda route:route.fulfill(content_type='text/html',body=document))
            page.goto(URL+'?theme='+theme,wait_until='networkidle')
            page.wait_for_selector('.period-button.active')
            state=page.evaluate('''()=>{
                const tabs=document.querySelector('.period-tabs'),button=tabs.querySelector('.active'),s=getComputedStyle(tabs),b=getComputedStyle(button),r=tabs.getBoundingClientRect();
                return {font:b.fontSize,height:b.height,radius:b.borderRadius,gap:s.gap,padding:s.paddingLeft,selection:b.backgroundColor,background:s.backgroundColor,width:r.width,viewport:innerWidth};
            }''')
            assert state['font']=='13px' and state['height']=='28px',state
            assert state['radius']=='6px' and state['gap']=='2px' and state['padding']=='2px',state
            assert state['selection']==('rgb(52, 52, 52)' if theme=='dark' else 'rgb(255, 255, 255)'),state
            assert state['width']<=state['viewport'],state
            title=page.locator('.kline-title strong').bounding_box();tabs=page.locator('.period-tabs').bounding_box()
            assert tabs['y']>=title['y']+title['height'],(title,tabs)
            # Available saved periods keep their original bindings and click handlers.
            week=page.locator('[data-period="1w"]')
            if week.count():week.click();assert 'active' in week.get_attribute('class')
            assert not errors,errors
            if '--screenshots' in sys.argv:page.screenshot(path=f'/tmp/mentora-tabs-{width}-{theme}.png')
            checks.append({'width':width,'theme':theme,**state,'periodSwitch':True})
            page.close()
    browser.close()
print(json.dumps(checks))
