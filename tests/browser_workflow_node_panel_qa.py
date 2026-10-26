"""Node inspector layout QA against real assets and deterministic local API fixtures."""
import json
from pathlib import Path
import re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]


def main():
    html=(ROOT/'app/static/index.html').read_text()
    html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
    html=html.replace('</body>','<script src="/static/day-tasks.js"></script><script src="/static/workflows.js"></script></body>')
    graph=dict(version=1,nodes=[dict(id='news',kind='tool',tool='internal-search',title='检索 AInvest 最新资讯',instruction='直接获取 AInvest 原始新闻，保留正文、关联股票和来源链接，不使用模型归纳。',x=100,y=160,arguments=dict(source='homepage',limit=25))],edges=[])
    output=dict(count=25,items=[dict(title='News fixture',related_symbols=['GOOG','GOOGL','META'],summary='Full raw source text. '*500,verified=True)],interpretation='本地测试数据，不代表实时新闻。')
    task=dict(workflow=graph,lastTrial=dict(id='fixture',status='success',nodes=dict(news=dict(status='success',output=output))))
    def route(request):
        path=urlparse(request.request.url).path
        if path=='/':return request.fulfill(body=html,content_type='text/html')
        if path=='/api/workflows/catalog':return request.fulfill(json=dict(kinds=[],tools=[dict(id='internal-search',label='资讯搜索',description='获取 AInvest 原始资讯',group='数据与搜索')]))
        if path.startswith('/api/'):return request.fulfill(json=dict(tasks=[],sceneTasks=[],markets=[],serverTime='2026-10-26T00:00:00Z'))
        file=ROOT/'app'/path.lstrip('/')
        if file.is_file() and ROOT in file.resolve().parents:return request.fulfill(path=str(file))
        return request.fulfill(status=404,body='')
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        for width in (1440,390):
            for theme in ('light','dark'):
                page=browser.new_page(viewport=dict(width=width,height=1000))
                errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                page.route('http://workflow.test/**',route);page.goto('http://workflow.test/')
                page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
                page.evaluate('(task)=>MentoraWorkflow.open(task)',task)
                page.locator('[data-node=news]').click()
                panel=page.locator('.wfInspector');header=page.locator('#wfNodeHeader')
                assert page.locator('[data-news-limit]').input_value()=='25'
                assert json.loads(page.locator('#wfRunResult pre').inner_text())==output
                assert page.locator('#wfRunResult .wfJSON-string').count()>0
                metrics=panel.evaluate('el=>{const r=el.getBoundingClientRect();const b=el.querySelector(".wfInspectorBody");return {left:r.left,right:r.right,bottom:r.bottom,view:innerWidth,overflow:b.scrollHeight>b.clientHeight}}')
                assert metrics['left']>=12 and metrics['right']<=width-12,metrics
                assert metrics['overflow'],metrics
                assert page.locator('#wfRunResult pre').evaluate('e=>e.scrollWidth>e.clientWidth')
                page.locator('[data-news-limit]').fill('40')
                assert json.loads(page.locator('[data-json]').input_value())['limit']==40
                page.locator('[data-json]').focus()
                page.keyboard.press('ControlOrMeta+A');page.keyboard.insert_text('{"source":"homepage","limit":60}')
                assert page.locator('[data-news-limit]').input_value()=='60'
                assert page.locator('.wfJSONCode.is-editable pre').inner_text().strip()=='{"source":"homepage","limit":60}'
                page.locator('[data-act=node-more]').click()
                assert page.locator('#wfNodeMenu').is_visible()
                page.locator('[data-act=node-rename]').click();page.locator('[data-field=title]').fill('最新原始新闻');page.keyboard.press('Enter')
                assert page.locator('[data-field=title]').input_value()=='最新原始新闻'
                before=header.bounding_box();page.locator('.wfInspectorBody').evaluate('e=>e.scrollTop=e.scrollHeight')
                assert header.bounding_box()==before
                assert page.locator('[data-act=copy-output]').is_visible()
                page.locator('.wfInspectorBody').evaluate('e=>e.scrollTop=0')
                page.screenshot(path=str(ROOT.parent/f'workflow-node-panel-{width}-{theme}.png'))
                assert not errors,errors
                print(json.dumps(dict(width=width,theme=theme,headerFixed=True,jsonHighlight=True,newsCountSync=True)))
                page.close()
        browser.close()


if __name__=='__main__':main()
