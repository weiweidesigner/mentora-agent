"""Offline host/iframe viewer regressions; never request actual third-party images."""
import tempfile
import html
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from app.search_images import render_gallery

ROOT=Path(__file__).resolve().parents[1]
SVG='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="#6b7c9c"/><circle cx="480" cy="280" r="150" fill="#d9b798"/><path d="M220 640Q220 370 480 370T740 640" fill="#353d50"/></svg>'

def main():
    css=(ROOT/'app/static/image-viewer.css').read_text()
    app_css=(ROOT/'app/static/styles.css').read_text()
    script=(ROOT/'app/static/image-viewer.js').read_text()
    payload=dict(requested_query='参考照片',images=[
        dict(image_url='https://images.test/good.svg',thumbnail_url='https://images.test/thumb.svg',source_url='https://source.test/story',source_name='来源网站',title='完整照片'),
        dict(image_url='https://images.test/bad.svg',thumbnail_url='https://images.test/thumb.svg',source_url='https://source.test/bad',title='原图失效'),
        dict(image_url='https://images.test/hang.svg',thumbnail_url='https://images.test/thumb.svg',title='原图超时'),
        dict(image_url='https://images.test/late.svg',thumbnail_url='https://images.test/thumb.svg',title='延迟原图')])
    document=render_gallery(payload)
    host=f'<html data-theme="dark"><head><meta charset="utf-8"><style>{app_css}</style><style>body{{margin:0;background:#101010;color:white}}h1{{margin:16px}}iframe{{width:100%;height:400px;border:0}}</style><style>{css}</style></head><body><h1>搜索结果</h1><article class="message assistant"><iframe class="reportDocumentFrame" src="/share-artifact/gallery.html?theme=dark"></iframe></article><script>{script}</script></body></html>'
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        for width,prefix in ((390,''),(1280,'/mentora'),(390,'/veya')):
            page=browser.new_page(viewport=dict(width=width,height=900),accept_downloads=True);errors=[];late=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            def route(r):
                url=r.request.url
                if '/share-artifact/' in url:return r.fulfill(body=document,content_type='text/html')
                if url=='https://app.test'+prefix+'/':return r.fulfill(body=host.replace('src="/share-artifact/','src="'+prefix+'/share-artifact/'),content_type='text/html')
                if url=='https://app.test'+prefix+'/nested-host':
                    inner=host.replace('src="/share-artifact/','src="'+prefix+'/share-artifact/')
                    outer=f'<html><head><meta charset="utf-8"><style>{css}</style></head><body style="margin:0;background:#191919"><aside style="width:25%;height:100vh;position:fixed;background:#555">侧栏</aside><iframe class="sharePreviewIframe" id="sharePreviewIframe" style="margin-left:25%;width:70%;height:360px" srcdoc="{html.escape(inner,quote=True)}"></iframe><script>{script}</script></body></html>'
                    return r.fulfill(body=outer,content_type='text/html')
                if url.endswith('/bad.svg'):return r.fulfill(status=404,body='')
                if url.endswith(('/hang.svg','/late.svg')):late.append(r);return
                return r.fulfill(body=SVG,content_type='image/svg+xml',headers={'Access-Control-Allow-Origin':'*'})
            page.route('**/*',route);page.goto('https://app.test'+prefix+'/')
            frame=page.frame_locator('iframe');frame.locator('.preview img.ready').first.wait_for()
            frame.locator('.preview').first.hover()
            assert frame.locator('.view-icon').count()==0
            expect(frame.locator('.preview').first).to_have_css('cursor','pointer')
            frame.locator('.preview').first.click();page.locator('.iv-image').wait_for()
            assert frame.locator('dialog[open]').count()==0
            bounds=page.locator('dialog[open]').bounding_box()
            assert bounds['x']==0 and bounds['y']==0 and bounds['width']==width and bounds['height']==900
            assert page.locator('.iv-source').get_attribute('href')=='https://source.test/story'
            assert '来源网站 · 完整照片' in page.locator('.iv-source').inner_text()
            assert page.locator('.iv-image').evaluate('(n)=>getComputedStyle(n).objectFit')=='contain'
            assert page.locator('dialog').evaluate('(n)=>getComputedStyle(n,"::backdrop").backdropFilter')=='blur(18px)'
            page.locator('.iv-zoom').click();page.locator('[data-zoom="200"]').click()
            assert page.locator('.iv-image').evaluate('(n)=>n.getBoundingClientRect().width')==1920
            assert page.locator('.iv-stage').evaluate('(n)=>n.scrollWidth>n.clientWidth')
            page.locator('.iv-zoom').click();page.locator('[data-zoom="fit"]').click()
            assert page.locator('.iv-image').bounding_box()['width']<=width
            page.locator('.iv-zoom').click();page.keyboard.press('ArrowDown');page.keyboard.press('Escape')
            assert page.locator('.iv-menu').is_hidden() and page.locator('dialog').is_visible()
            with page.expect_download() as downloaded:page.locator('.iv-download').click()
            assert downloaded.value.suggested_filename=='完整照片.svg'
            page.evaluate("()=>{window.savedFetch=window.fetch;window.fetch=async()=>{throw new TypeError('CORS blocked')};}")
            page.locator('.iv-download').click()
            page.wait_for_function("document.querySelector('.iv-status').textContent.includes('来源限制直接下载')")
            assert page.locator('.iv-status').is_hidden()
            assert page.locator('.iv-original').is_hidden()
            page.evaluate('()=>{window.fetch=window.savedFetch;}')
            page.keyboard.press('Escape');assert not page.locator('dialog').is_visible()
            assert page.evaluate('document.documentElement.style.overflow')==''
            frame.locator('.preview').nth(1).click()
            page.wait_for_function("document.querySelector('.iv-status').textContent.includes('当前显示预览图')")
            assert page.locator('.iv-image').get_attribute('src')=='https://images.test/thumb.svg'
            assert page.locator('.iv-status').is_hidden()
            assert page.locator('.iv-retry').is_hidden() and page.locator('.iv-original').is_hidden()
            page.locator('.iv-close').click()
            # Timeouts terminate loading and preserve a usable thumbnail.
            page.clock.install();frame.locator('.preview').nth(2).click()
            page.wait_for_function("!!document.querySelector('.iv-image')")
            page.clock.fast_forward(13000)
            assert '原图载入超时' in page.locator('.iv-status').text_content()
            assert page.locator('.iv-image').is_visible()
            page.locator('.iv-close').click()
            frame.locator('.preview').nth(3).click();page.locator('.iv-close').click()
            frame.locator('.preview').first.click();page.wait_for_function("document.querySelector('.iv-image')?.alt==='完整照片'")
            for request in late:
                try:request.fulfill(body=SVG,content_type='image/svg+xml')
                except Exception:pass
            assert page.locator('.iv-image').get_attribute('alt')=='完整照片'
            page.locator('.iv-close').click()
            # A page pretending to be a result frame cannot open an overlay.
            page.evaluate("window.postMessage({type:'mentora:image-viewer-open',image:{original:'https://images.test/good.svg'}},'*')")
            assert not page.locator('dialog').is_visible()
            assert page.evaluate("MentoraImageViewer.open({original:'javascript:alert(1)'})") is False
            assert page.evaluate("MentoraImageViewer.open({original:'http://127.0.0.1/secret'})") is False
            if width==1280:
                frame.locator('.preview').first.click();page.locator('.iv-image').wait_for()
                page.screenshot(path='/tmp/mentora-image-viewer-desktop.png')
            # A srcdoc share preview adds a second iframe level. The overlay
            # must still cover the OUTER sidebar and viewport, not that frame.
            page.goto('https://app.test'+prefix+'/nested-host')
            nested=page.frame_locator('#sharePreviewIframe').frame_locator('.reportDocumentFrame')
            nested.locator('.preview img.ready').first.wait_for()
            nested.locator('.preview').first.click();page.locator('dialog[open] .iv-image').wait_for()
            assert page.frame_locator('#sharePreviewIframe').locator('dialog[open]').count()==0
            assert nested.locator('dialog[open]').count()==0
            bounds=page.locator('dialog[open]').bounding_box()
            assert bounds['x']==0 and bounds['y']==0 and bounds['width']==width and bounds['height']==900
            assert page.evaluate("document.elementFromPoint(5,450).closest('dialog')!==null")
            page.locator('.iv-close').click()
            for request in late:
                try:request.abort()
                except Exception:pass
            assert not errors,errors
            page.close()
        browser.close()
    print('PASS: host fullscreen, mobile/desktop, blur, fit/zoom, source, download, thumbnail fallback, timeout, stale loads, Escape and message validation')

if __name__=='__main__':main()
