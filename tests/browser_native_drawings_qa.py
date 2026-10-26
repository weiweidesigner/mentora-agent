"""Real browser checks against offline fixture OHLCV, never a live account."""
import json
import math
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.artifact_upgrades import _native_kline,upgrade_widget_generic_chart


def main():
    native=_native_kline()
    rows=[dict(time=1700000000000+i*86400000,open=100+i*.1,close=101+i*.1+math.sin(i),high=105+i*.1,low=95+i*.1,volume=1000+i) for i in range(120)]
    point=lambda i,price:dict(time=rows[i]['time'],price=price)
    marks=[dict(type='fib-retracement',period='1d',points=[point(30,98),point(90,113)],levels=[0,.5,1],levelColors=['#123456','#abcdef','#456789']),dict(type='regression-channel',period='1d',points=[point(30,103),point(100,110)],lineWidth=3,lineStyle='dotted'),dict(type='long-position',period='1d',points=[point(75,108),point(75,104),point(110,115)],text='Offline scenario')]
    base=dict(type='kline',props=dict(code='TEST',dataType='1d',availablePeriods=['1d'],klineType='line',ma=[5,20],annotations=marks,theme='dark',fitAnnotations=True),data=rows)
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        for width in (390,1280):
            for multi in (False,True):
                payload=json.loads(json.dumps(base))
                if multi:
                    payload['props']['availablePeriods']=['1d','1w'];payload['dataByPeriod']={'1d':rows,'1w':rows}
                html=upgrade_widget_generic_chart(native.render_document(payload))
                page=browser.new_page(viewport=dict(width=width,height=760));errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.route('http://chart.test/**',lambda route:route.fulfill(body=html,content_type='text/html'))
                page.goto('http://chart.test/?canvas=1',wait_until='networkidle')
                assert page.locator('#kline-canvas').bounding_box()['width']>100
                assert page.locator('.period-tabs').count()==int(multi)
                if multi:
                    page.locator('[data-period="1w"]').click()
                    assert 'active' in page.locator('[data-period="1w"]').get_attribute('class')
                    page.locator('[data-period="1d"]').click()
                else:
                    assert page.locator('.kline-title').evaluate('el=>getComputedStyle(el).display')=='none'
                page.locator('.kline-component').evaluate('el=>el.dispatchEvent(new CustomEvent("kline-config-update",{detail:{ma:[5],maColors:["#ff0000"],annotationStyles:[{type:"fib-retracement",lineWidth:4,levels:[0,.25,.5,1],extendRight:true}]}}))')
                assert not errors,errors
                if not multi:page.screenshot(path=f'/tmp/native-drawings-{width}.png')
                print(json.dumps(dict(width=width,multiplePeriods=multi,liveStyleUpdate=True,noRuntimeErrors=True)))
                page.close()
        browser.close()


if __name__=='__main__':main()
