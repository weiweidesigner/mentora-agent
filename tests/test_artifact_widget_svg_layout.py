"""Native plot SVG rules must never reposition the adjacent dashboard action icon."""
import html
from pathlib import Path
import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parents[1]

@pytest.mark.parametrize('runtime',['artifact-widget-control.js','artifact-presentation.js','app.js'])
def test_title_action_keeps_icon_in_flow_despite_legacy_plot_css(runtime):
    script = (ROOT/'app/static'/runtime).read_text()
    if runtime == 'app.js':
        script = script[script.index('const addToWidgetIcon'):script.index('function createArtifactFallbackFrame')]
        body = '<section id="chart"><h2>债券收益率与期限分布</h2></section>'
        boot = "document.body.append(withArtifactWidgetControl(document.querySelector('#chart'),{url:'/generated/test.html'}));"
    else:
        body = '<h2>债券收益率与期限分布</h2>'
        boot = ''
    legacy = '<style>body{margin:0;font:13px sans-serif}h2{font-size:18px;margin:0 0 14px}svg{position:absolute;inset:0;width:100%;height:100%}</style>'
    child = legacy+body+'<script>'+script+'</script><script>'+boot+'</script>'
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for width in (390,1200):
            page.set_viewport_size({'width':width,'height':700})
            page.set_content('<iframe class="reportDocumentFrame" style="width:100%;height:550px;border:0" srcdoc="'+html.escape(child,quote=True)+'"></iframe>')
            frame = page.frame_locator('iframe')
            action = frame.locator('h2 button')
            action.wait_for()
            result = action.evaluate('''b=>{const icon=b.querySelector('svg'),i=icon.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(b.parentElement.firstChild);const t=Array.from(r.getClientRects()).at(-1);return {width:i.width,height:i.height,gap:i.left-t.right,overlap:i.left<t.right&&i.right>t.left&&i.top<t.bottom&&i.bottom>t.top,position:getComputedStyle(icon).position}}''')
            assert result['width']==18 and result['height']==18,result
            assert result['position']=='static' and not result['overlap'],result
            assert result['gap']>=5,result
        browser.close()
