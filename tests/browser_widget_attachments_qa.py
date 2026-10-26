"""Offline real-browser QA for the home-style Widget image composer."""
import base64
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'app/static/index.html').read_text(),flags=re.S)
html=html.replace('</body>','<script src="/static/widgets.js"></script></body>')
catalog=json.loads((ROOT/'app/static/widget-catalog.json').read_text())
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGz8AAAAASUVORK5CYII=')
def route(r):
    path=urlparse(r.request.url).path
    if path=='/':return r.fulfill(body=html,content_type='text/html')
    if 'catalog' in path:return r.fulfill(json=catalog)
    if path.startswith('/api/'):return r.fulfill(json={})
    file=ROOT/'app'/path.lstrip('/')
    return r.fulfill(path=str(file)) if file.is_file() else r.fulfill(status=404,body='')
with sync_playwright() as runtime:
    browser=runtime.chromium.launch()
    for width in (390,1280):
        for theme in ('light','dark'):
            page=browser.new_page(viewport=dict(width=width,height=900));page.route('http://widget-attachments.test/**',route)
            page.add_init_script("localStorage.setItem('mentora-widget-boards-v1',JSON.stringify({defaultsVersion:1,activeId:'b',openIds:['b'],boards:[{id:'b',title:'测试看板',cards:[],chat:[]}]}));")
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto('http://widget-attachments.test/?tab=widgets')
            page.evaluate('(theme)=>{document.documentElement.dataset.theme=theme;const control=document.querySelector("#reasoningStrengthControl").cloneNode(true);document.querySelector("#widgetGenerate").before(control);}',theme)
            page.locator('#widgetImageInput').set_input_files(dict(name='image.png',mimeType='image/png',buffer=png))
            page.locator('#widgetAttachmentPreview img').wait_for(state='visible')
            assert page.locator('#widgetGenerate').is_enabled()
            for text in ('参考图片生成看板','参考图片生成看板\n保留颜色与指标'):
                page.locator('#widgetPrompt').fill(text)
                boxes=[page.locator(s).bounding_box() for s in ('#widgetAttachButton','#widgetPrompt','.widgetComposerBox .reasoningStrengthControl','#widgetGenerate')]
                for box in boxes:assert box['x']>=0 and box['x']+box['width']<=width,boxes
                for i,a in enumerate(boxes):
                    for b in boxes[i+1:]:assert a['x']+a['width']<=b['x']+.1 or b['x']+b['width']<=a['x']+.1 or a['y']+a['height']<=b['y']+.1 or b['y']+b['height']<=a['y']+.1,boxes
            page.locator('#widgetAttachmentPreview .attachmentRemove').click()
            assert page.locator('#widgetAttachmentPreview').is_hidden()
            assert not errors,errors
            print(json.dumps(dict(width=width,theme=theme,upload=True,preview=True,remove=True,noOverlap=True)))
            page.close()
    browser.close()
