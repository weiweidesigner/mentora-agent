"""Validate actual SVG width and signed colors without any live account calls."""
import json
from pathlib import Path
import re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]


def main():
    html=(ROOT/'app/static/index.html').read_text()
    html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
    html=html.replace('</body>','<script src="/static/portfolio.js"></script></body>')
    account=dict(initial=1000,cash=1000,equity=1080,totalReturn=8,marketValue=80,unrealized=-20,realized=100,positions=[],trades=[],plans=[],settings={},valuationComplete=True,scan={},history=[dict(day='2026-10-'+day,equity=equity) for day,equity in [('16',1000),('17',995),('18',990),('19',900),('20',910),('24',910),('25',910),('26',920),('27',1080)]])
    def route(request):
        path=urlparse(request.request.url).path
        if path=='/':return request.fulfill(body=html,content_type='text/html')
        if path=='/api/portfolio/workflow':return request.fulfill(json=dict(favorites=[],preferences={},tasks=[],strategies={},watchlist=[]))
        if path.endswith('/opportunities'):return request.fulfill(json=dict(items=[]))
        if path.startswith('/api/'):return request.fulfill(json=account)
        file=ROOT/'app'/path.lstrip('/')
        if file.is_file() and ROOT in file.resolve().parents:return request.fulfill(path=str(file))
        return request.fulfill(status=404,body='')
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        for theme in ('light','dark'):
            page=browser.new_page(viewport=dict(width=1920,height=1100))
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.route('http://portfolio.test/**',route);page.goto('http://portfolio.test/?tab=portfolio&portfolioView=returns')
            page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
            page.wait_for_selector('.pfProfitPlot svg')
            for width in (1920,1280,390):
                page.set_viewport_size(dict(width=width,height=1100))
                card=page.locator('.pfCard').filter(has=page.get_by_role('heading',name='历史收益变化',exact=True))
                card.scroll_into_view_if_needed()
                metrics=page.locator('.pfProfitPlot svg').evaluate('''svg=>{
                    const line=svg.querySelector('.pfProfitLine'),matrix=svg.getScreenCTM();
                    const first=line.getPointAtLength(0).matrixTransform(matrix),last=line.getPointAtLength(line.getTotalLength()).matrixTransform(matrix),r=svg.getBoundingClientRect();
                    const positive=getComputedStyle(svg.querySelector('.pfProfitPositive')).color,negative=getComputedStyle(svg.querySelector('.pfProfitNegative')).color;
                    return {left:first.x-r.left,right:r.right-last.x,width:r.width,ratio:(last.x-first.x)/r.width,positive,negative,areaCount:svg.querySelectorAll('.pfProfitArea').length};
                }''')
                assert metrics['ratio']>.99 and metrics['left']<5 and metrics['right']<5,metrics
                red=[int(v) for v in re.findall(r'\d+',metrics['positive'])[:3]]
                green=[int(v) for v in re.findall(r'\d+',metrics['negative'])[:3]]
                assert red[0]>red[1] and green[1]>green[0] and metrics['areaCount']==2,metrics
                assert page.locator('.pfHero.pfGain').evaluate('e=>getComputedStyle(e).color')==metrics['positive']
                assert page.locator('.pfMetrics strong.pfLoss').first.evaluate('e=>getComputedStyle(e).color')==metrics['negative']
                assert card.locator('.pfSubtle').count()==0
                assert card.bounding_box()['x']>=0 and card.bounding_box()['width']<=width
                assert not errors,errors
                card.screenshot(path=f'/tmp/portfolio-profit-{theme}-{width}.png')
                print(json.dumps(dict(theme=theme,width=width,chartWidth=metrics['width'],curveWidthRatio=round(metrics['ratio'],3),redPositiveGreenNegative=True)))
            page.close()
        browser.close()


if __name__=='__main__':main()
