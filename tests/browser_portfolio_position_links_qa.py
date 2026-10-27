"""Real hover/focus and intercepted navigation tests; no external quote calls."""
import json
from pathlib import Path
import re
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]


def main():
    html=(ROOT/'app/static/index.html').read_text()
    html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
    html=html.replace('</body>','<script src="/static/portfolio.js"></script></body>')
    account=dict(initial=10000,equity=10000,cash=7000,marketValue=3000,unrealized=0,realized=0,history=[],trades=[],plans=[],settings={},valuationComplete=True,scan={},positions=[dict(symbol=symbol,quantity=10,availableToSell=10,averageCost=100,marketValue=1000,unrealized=0,quote=dict(price=100,name=name)) for symbol,name in [('0700.HK','腾讯控股'),('DOW','Dow Inc. Common Stock'),('NTES','NetEase, Inc.')]])
    def route(request):
        path=urlparse(request.request.url).path
        if path=='/':return request.fulfill(body=html,content_type='text/html')
        if path=='/api/portfolio/workflow':return request.fulfill(json=dict(watchlist=[],preferences={},strategies={}))
        if path.endswith('/opportunities'):return request.fulfill(json=dict(items=[]))
        if path.startswith('/api/'):return request.fulfill(json=account)
        file=ROOT/'app'/path.lstrip('/')
        if file.is_file() and ROOT in file.resolve().parents:return request.fulfill(path=str(file))
        return request.fulfill(status=404,body='')
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        for width in (1280,390):
            context=browser.new_context(viewport=dict(width=width,height=900))
            context.route('http://portfolio.test/**',route)
            context.route('https://www.tradingview.com/**',lambda request:request.fulfill(body='TradingView navigation fixture',content_type='text/html'))
            page=context.new_page();page.goto('http://portfolio.test/?tab=portfolio&portfolioView=positions')
            links=page.locator('.pfPositionSymbolLink');links.first.wait_for()
            for index,target in enumerate(('HKEX:700','DOW','NTES')):
                link=links.nth(index);label=link.locator('b')
                page.mouse.move(0,0);link.evaluate('el=>el.blur()')
                assert label.evaluate('el=>getComputedStyle(el).textDecorationLine')=='none'
                link.hover()
                assert label.evaluate('el=>getComputedStyle(el).textDecorationLine')=='underline'
                assert label.evaluate('el=>getComputedStyle(el).textDecorationStyle')=='dashed'
                with context.expect_page() as opened:link.click()
                popup=opened.value;popup.wait_for_load_state('domcontentloaded')
                assert parse_qs(urlparse(popup.url).query)['symbol']==[target]
                assert popup.evaluate('window.opener===null')
                popup.close()
            links.first.focus();page.keyboard.press('Tab');page.keyboard.press('Shift+Tab')
            assert links.first.evaluate('el=>el.matches(":focus-visible")')
            assert links.first.locator('b').evaluate('el=>getComputedStyle(el).textDecorationStyle')=='dashed'
            assert 'portfolioView=positions' in page.url
            print(json.dumps(dict(width=width,hoverDashed=True,newTab=True,targets=['HKEX:700','DOW','NTES'])))
            context.close()
        browser.close()


if __name__=='__main__':main()
