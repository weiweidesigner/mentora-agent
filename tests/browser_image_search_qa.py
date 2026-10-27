"""Offline gallery QA, with all remote image requests fulfilled locally."""
import base64
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright
from app.search_images import write_gallery

PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=')

def main():
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/'gallery.html'
        payload=dict(requested_query='照片 <script>alert(1)</script>',images=[dict(image_url='https://images.test/good.png',thumbnail_url='https://images.test/good.png',source_url='https://source.test/page',title='正常图片',width=800,height=600),
            dict(image_url='https://images.test/bad.png',thumbnail_url='',source_url='',title='失败图片')])
        payload['images'] += [dict(image_url=f'https://images.test/{n}/good.png',source_url='https://source.test/page',title='长标题照片 '+str(n),description='来源已有的说明文字') for n in range(2,10)]
        write_gallery(path,payload);document=path.read_text()
        with sync_playwright() as runtime:
            browser=runtime.chromium.launch(headless=True)
            for width in (320,390,1280):
                for theme in ('light','dark'):
                    page=browser.new_page(viewport=dict(width=width,height=900));errors=[]
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    def route(r):
                        if r.request.url.startswith('https://gallery.test/'):return r.fulfill(body=document,content_type='text/html')
                        if r.request.url.endswith('/good.png'):return r.fulfill(body=PNG,content_type='image/png')
                        return r.fulfill(status=404,body='')
                    page.route('**/*',route)
                    page.goto('https://gallery.test/?theme='+theme)
                    page.wait_for_selector('.preview img.ready')
                    assert page.locator('.image-card').count()==6
                    assert page.locator('.grid>.image-card').count()==4
                    assert page.locator('.list>.image-card').count()==2
                    assert page.locator('.placeholder').nth(0).is_hidden()
                    assert '暂不可用' in page.locator('.placeholder').nth(1).inner_text()
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    assert page.locator('h1').inner_text()==payload['requested_query']
                    boxes=page.locator('.grid .preview').evaluate_all('(nodes)=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))')
                    assert boxes[0]['x']==0 and abs(boxes[1]['x']+boxes[1]['width']-width)<1
                    assert boxes[0]['y']==boxes[1]['y'] and boxes[2]['y']==boxes[3]['y']
                    assert boxes[2]['y']>boxes[0]['y']
                    assert all(x['height']==(176 if width<=600 else 300) for x in boxes)
                    assert page.locator('.preview img').first.evaluate('(n)=>getComputedStyle(n).objectFit')=='cover'
                    page.locator('.preview').first.click()
                    page.wait_for_selector('dialog img:not([hidden])')
                    page.keyboard.press('Escape');assert not page.locator('dialog').is_visible()
                    page.locator('.preview').nth(1).click()
                    page.wait_for_function("document.querySelector('#resource-status').textContent.includes('失败')")
                    assert page.locator('dialog img').is_hidden()
                    page.locator('.close').click()
                    assert page.locator('.refine, footer, [data-refinement]').count()==0
                    assert not errors,errors
                    page.close()
            browser.close()
    print('PASS: 320/390/1280px light/dark, 4-grid/2-list, edge alignment, fixed cover crops, previews, failures, metadata escaping and no footer/refinement controls')

if __name__=='__main__':main()
