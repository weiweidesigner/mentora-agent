"""Check single-line hints and inline favorite controls at desktop/mobile widths."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]


def main():
    html=(ROOT/'app/static/index.html').read_text()
    html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
    html=html.replace('</body>','<script src="/static/portfolio.js"></script><script src="/static/portfolio-import.js"></script></body>')
    def route(request):
        path=urlparse(request.request.url).path
        if path=='/':return request.fulfill(body=html,content_type='text/html')
        if path=='/api/portfolio/workflow':return request.fulfill(json=dict(favorites=[],preferences={},tasks=[],strategies={},watchlist=[]))
        if path.startswith('/api/'):
            return request.fulfill(json=dict(initial=1000,cash=1000,equity=1000,marketValue=0,positions=[],trades=[],plans=[],history=[],settings={},valuationComplete=True,scan={},strategies=[],items=[]))
        file=ROOT/'app'/path.lstrip('/')
        if file.is_file():return request.fulfill(path=str(file))
        return request.fulfill(status=404,body='')
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        for width in (1280,390):
            page=browser.new_page(viewport=dict(width=width,height=900))
            page.route('http://portfolio.test/**',route)
            page.goto('http://portfolio.test/?tab=portfolio&portfolioView=profile')
            page.wait_for_selector('[data-ocr-upload]')
            title=page.locator('.pfFavoriteHeader h2').bounding_box()
            form=page.locator('#pfFavoriteForm').bounding_box()
            assert abs(title['y']+title['height']/2-form['y']-form['height']/2)<5,(width,title,form)
            assert form['x']+form['width']<=width+1,(width,form)
            assert form['height']<60,(width,form)
            for control in page.locator('#pfFavoriteForm button,#pfFavoriteField').all():
                if not control.is_visible():continue
                box=control.bounding_box()
                assert abs(title['y']+title['height']/2-box['y']-box['height']/2)<5,(width,box,title)
            page.locator('#pfIdeaInput').evaluate('el=>{el.placeholder="股价高于二十日均线，在最大回撤约束下如何选择？".repeat(12);el.value="";el.dispatchEvent(new Event("input",{bubbles:true}));}')
            metrics=page.locator('#pfIdeaInput').evaluate('el=>({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight),whiteSpace:getComputedStyle(el).whiteSpace})')
            assert metrics['height']<=metrics['line']+2 and metrics['whiteSpace']=='nowrap',metrics
            page.locator('.pfFavoriteHeader').scroll_into_view_if_needed()
            page.screenshot(path=f'/tmp/portfolio-controls-{width}.png')
            print(json.dumps(dict(width=width,inlineFavorites=True,singleLineHint=True,ocrButton=True)))
            page.close()
        browser.close()


if __name__=='__main__':main()
