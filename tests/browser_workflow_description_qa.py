"""Measure actual two-line clipping at desktop/mobile widths and canvas zooms."""
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
    description='读取当前用户的真实自选股票与投资偏好，保留来源和失败原因，不伪造行情。长描述完整内容应在节点详情中显示。'*10
    graph=dict(version=1,nodes=[dict(id='data',kind='tool',tool='portfolio-data',title='逐标的获取真实历史行情',instruction=description,x=90,y=140,foreach='{{watch}}',onItemError='continue',arguments=dict(operation='history',symbol='{{item.symbol}}'))],edges=[])
    def route(request):
        path=urlparse(request.request.url).path
        if path=='/':return request.fulfill(body=html,content_type='text/html')
        if path=='/api/workflows/catalog':return request.fulfill(json=dict(kinds=[],tools=[dict(id='portfolio-data',label='交易数据',group='交易能力')],model='test'))
        if path.startswith('/api/'):return request.fulfill(json=dict(tasks=[],sceneTasks=[],markets=[],serverTime='2026-10-25T00:00:00Z'))
        file=ROOT/'app'/path.lstrip('/')
        if file.is_file() and ROOT in file.resolve().parents:
            return request.fulfill(path=str(file))
        return request.fulfill(status=404,body='')
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        for width in (1280,390):
            page=browser.new_page(viewport=dict(width=width,height=850))
            page.route('http://workflow.test/**',route)
            page.goto('http://workflow.test/')
            page.evaluate('(graph)=>window.MentoraWorkflow.open({workflow:graph})',graph)
            node=page.locator('[data-node=data]')
            for zoom in range(4):
                if zoom:page.locator('[data-act=zoom-out]').click()
                metrics=node.locator('p').evaluate('el=>{const s=getComputedStyle(el);return {height:el.getBoundingClientRect().height,line:parseFloat(s.lineHeight),padding:s.padding,clamp:s.webkitLineClamp,max:parseFloat(s.maxHeight),title:el.title,text:el.textContent}}')
                assert metrics['clamp']=='2' and metrics['padding']=='0px',metrics
                assert abs(metrics['max']-2*metrics['line'])<.1,metrics
                assert metrics['height']<=2*metrics['line']+1,metrics
                assert metrics['title']==description and metrics['text']==description
            page.screenshot(path=str(ROOT.parent/f'workflow-description-{width}.png'))
            node.click()
            assert page.locator('[data-field=instruction]').input_value()==description
            assert page.locator('[data-field=onItemError]').input_value()=='continue'
            print(json.dumps(dict(width=width,zoomChecks=4,twoLines=True,fullDescriptionPreserved=True)))
            flow_graph=dict(version=1,nodes=[dict(id='input',kind='start',title='已完成输入',x=90,y=140),dict(id='data',kind='tool',tool='portfolio-data',title='运行中真实查询',x=440,y=140)],edges=[dict(source='input',target='data',when='always')])
            task=dict(workflow=flow_graph,lastTrial=dict(status='running',nodes=dict(input=dict(status='success'),data=dict(status='running'))))
            page.evaluate('(task)=>{document.querySelector(".wfCanvas").close();return MentoraWorkflow.open(task)}',task)
            flow=page.locator('.wfEdgeFlow');assert flow.count()==1
            before=flow.evaluate('el=>getComputedStyle(el).strokeDashoffset')
            page.wait_for_timeout(180)
            after=flow.evaluate('el=>getComputedStyle(el).strokeDashoffset')
            assert before!=after,(before,after)
            page.screenshot(path=str(ROOT.parent/f'workflow-edge-flow-{width}.png'))
            dark_stroke=flow.evaluate('el=>getComputedStyle(el).stroke')
            page.evaluate('document.documentElement.dataset.theme="light"')
            assert flow.evaluate('el=>getComputedStyle(el).stroke')!=dark_stroke
            page.evaluate('document.documentElement.dataset.theme="dark"')
            page.emulate_media(reduced_motion='reduce')
            assert flow.evaluate('el=>getComputedStyle(el).animationName')=='none'
            page.emulate_media(reduced_motion='no-preference')
            task['lastTrial']['status']='success'
            page.evaluate('(task)=>{document.querySelector(".wfCanvas").close();return MentoraWorkflow.open(task)}',task)
            assert page.locator('.wfEdgeFlow').count()==0
            print(json.dumps(dict(width=width,directionalFlow=True,reducedMotion=True,terminalMotionStopped=True)))
            page.close()
        browser.close()

if __name__=='__main__':main()
