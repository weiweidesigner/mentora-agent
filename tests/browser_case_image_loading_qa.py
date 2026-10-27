"""Offline real-browser regressions; never request inference or market providers."""
import re
import base64
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ARTIFACT='/static/cases/inspiration/business-investment_rating/inspiration-real-business-investment_rating-AAPL.html'


def main():
    html=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'app/static/index.html').read_text(),flags=re.S)
    row=dict(id='offline-rating',title='AAPL 投资评级',tag='测试',preview='离线案例',question='评级测试',cachedDate='2026-10-27',conversationUrl='/qa/conversation.json')
    document=(ROOT/'app'/ARTIFACT.lstrip('/')).read_text().replace('</body>','<script>parent.__radarBoots=(parent.__radarBoots||0)+1</script></body>')
    navigations=[];pending_images=[];ready_image=[]
    def route(r):
        path=urlparse(r.request.url).path
        if path=='/':return r.fulfill(body=html,content_type='text/html')
        if path=='/generated/flux-fixture.png':
            if ready_image:return r.fulfill(body=ready_image[0],content_type='image/png')
            pending_images.append(r);return
        if path==ARTIFACT:
            if r.request.is_navigation_request():navigations.append(path)
            return r.fulfill(body=document,content_type='text/html')
        if path=='/qa/conversation.json':return r.fulfill(json=dict(question=row['question'],answer=dict(interpretation='[[AIME_CHART:'+ARTIFACT+']]',reportArtifacts=[dict(path=ARTIFACT,url=ARTIFACT,title=row['title'],renderMode='iframe')],sources=[])))
        if path=='/static/cases/manifest.json':return r.fulfill(json=[row])
        if path=='/static/cases/inspiration/manifest.json':return r.fulfill(json=dict(categories=[],cases=[]))
        if path.startswith('/api/'):
            assert r.request.method=='GET' or path=='/api/day/execution-preferences',('unexpected write',path)
            return r.fulfill(json=dict(sessions=[],tasks=[],sceneTasks=[],models=[],frameworks=[]))
        file=ROOT/'app'/path.lstrip('/')
        return r.fulfill(path=str(file)) if file.is_file() else r.fulfill(status=404,body='')
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        for width in (390,1280):
            navigations.clear()
            page=browser.new_page(viewport=dict(width=width,height=1000))
            page.route('https://loading.test/**',route)
            page.goto('https://loading.test/')
            page.add_script_tag(content=(ROOT/'app/static/app.js').read_text())
            page.add_script_tag(content=(ROOT/'app/static/cases.js').read_text())
            page.wait_for_selector('[data-case="offline-rating"]')
            page.locator('[data-case="offline-rating"]').first.click()
            page.wait_for_function('document.querySelector(".cachedCaseAnswer")?.activityEnded===true')
            page.wait_for_timeout(400)
            assert page.evaluate('window.__radarBoots')==1
            assert len(navigations)==1,navigations
            assert page.locator('.cachedReplay.interleavedFlow .reportDocumentFrame').count()==1
            page.evaluate("""()=>{
              window.qaArticle=createAssistantMessage('生图测试',{taskContext:{question:'离线测试'}});
              handleStreamEvent(qaArticle,'status',{phase:'flux-generate',lang:'zh-CN'});
            }""")
            loading=page.locator('.imageGenerationLoading')
            assert loading.locator('circle').count()==621
            assert loading.locator('.imageGenerationProgress').inner_text()=='准备中'
            assert loading.locator('.imageGenerationLabel').count()==0
            loading.evaluate("node=>node.insertAdjacentHTML('afterbegin','<div class=\"imageGenerationLabel\">正在勾勒草图</div>')")
            assert loading.locator('.imageGenerationLabel').evaluate('(node)=>getComputedStyle(node).display')=='none'
            bounds=loading.bounding_box()
            assert bounds['width']<=width
            assert bounds['width']<=512 and abs(bounds['height']-bounds['width'])<1
            dots=loading.locator('.imageGenerationWave').nth(10)
            first=dots.evaluate('(g)=>getComputedStyle(g).transform')
            page.wait_for_timeout(500)
            assert dots.evaluate('(g)=>getComputedStyle(g).transform')!=first
            page.evaluate("handleStreamEvent(qaArticle,'status',{phase:'flux-wait',progressPct:36})")
            assert loading.locator('.imageGenerationProgress').inner_text()=='36%'
            assert loading.locator('.imageGenerationLabel').count()==0
            page.evaluate("handleStreamEvent(qaArticle,'status',{phase:'flux-denoise',progressPct:50,message:'正在生成图像细节 · 2/4 步'})")
            assert page.evaluate('qaArticle.dataset.currentThinking')=='正在生成图像细节 · 2/4 步'
            page.evaluate("handleStreamEvent(qaArticle,'status',{phase:'flux-decode',progressPct:100,message:'推理已完成，正在解码图片'})")
            assert page.evaluate('qaArticle.dataset.currentThinking')=='推理已完成，正在解码图片'
            page.emulate_media(reduced_motion='reduce')
            assert dots.evaluate('(g)=>getComputedStyle(g).animationName')=='none'
            page.evaluate("showStopped(qaArticle,'已停止',{skipSessionRecord:true})")
            assert loading.count()==0
            # Error and successful final settlement also remove the loading field.
            for terminal in ('error','final'):
                page.evaluate("""terminal=>{
                  const article=createAssistantMessage('生图测试',{taskContext:{question:'离线测试'}});
                  handleStreamEvent(article,'status',{phase:'flux-generate'});
                  handleStreamEvent(article,terminal,terminal==='error'?{detail:'离线失败'}:{interpretation:'完成',reportArtifacts:[]});
                }""",terminal)
                assert page.locator('.imageGenerationLoading').count()==0
            pending_images.clear();ready_image.clear()
            pending=page.evaluate("""()=>{
              window.imageArticle=createAssistantMessage('资源载入测试',{taskContext:{question:'离线测试'}});
              handleStreamEvent(imageArticle,'status',{phase:'flux-denoise',progressPct:75});
              handleStreamEvent(imageArticle,'final',{interpretation:'[[AIME_CHART:/generated/flux-fixture.html]]',reportArtifacts:[{url:'/generated/flux-fixture.html',mediaType:'image'}]});
              return {waiting:imageArticle.querySelectorAll('.imageGenerationLoading').length,images:imageArticle.querySelectorAll('img.reportGeneratedImage:not([hidden])').length};
            }""")
            assert pending==dict(waiting=1,images=0)
            page.wait_for_timeout(100)
            assert page.locator('.imageGenerationLoading').count()==1
            png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=')
            assert pending_images
            ready_image.append(png)
            pending_images.pop(0).fulfill(body=png,content_type='image/png',headers={'Cache-Control':'public,max-age=3600'})
            page.wait_for_function('window.imageArticle.activityEnded===true')
            for request in pending_images:request.fulfill(body=png,content_type='image/png')
            page.wait_for_selector('.reportGeneratedImage:not([hidden])')
            assert page.locator('.imageGenerationLoading').count()==0
            gap=page.evaluate("""()=>{
              const trigger=imageArticle.querySelector('.thinkingTrigger').getBoundingClientRect();
              const image=imageArticle.querySelector('.reportGeneratedImage').getBoundingClientRect();
              return image.top-trigger.bottom;
            }""")
            assert 3<=gap<=5,(width,gap)
            # Tightening image-only replies must not change ordinary answers.
            normal=page.evaluate("""()=>{
              const article=createAssistantMessage('文字测试',{taskContext:{question:'离线测试'}});
              handleStreamEvent(article,'final',{interpretation:'普通文字回答',reportArtifacts:[]});
              return getComputedStyle(article.querySelector('.thinkingTrigger')).marginBottom;
            }""")
            assert normal=='10px',normal
            page.close()
        browser.close()
    print('PASS: rating boots once; image loading animates and cleans up at mobile/desktop widths')


if __name__=='__main__':main()
