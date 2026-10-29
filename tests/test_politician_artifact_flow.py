from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

def test_saved_politician_reports_expand_without_changing_other_scroll_areas():
 with sync_playwright() as p:
  browser=p.chromium.launch();page=browser.new_page()
  page.set_content('<main class="multi-politician-events"><section class="signal-list" style="max-height:460px;overflow:auto"><div style="height:900px">Saved chart</div></section></main><div id="other" class="signal-list" style="max-height:80px;overflow:auto"><div style="height:200px">Other widget</div></div>')
  page.add_script_tag(content=(ROOT/'app/static/artifact-presentation.js').read_text())
  assert page.locator('main .signal-list').evaluate('e=>e.clientHeight===900&&e.scrollHeight===900&&getComputedStyle(e).overflowY==="visible"')
  assert page.locator('#other').evaluate('e=>e.clientHeight===80&&getComputedStyle(e).overflowY==="auto"')
  browser.close()

def test_saved_event_charts_drop_old_mobile_height_without_compressing_cards():
 import html
 child='<style>.chart-stage{height:344px!important;min-height:344px!important}.event-label-box{padding:6px 8px;font-size:11px}</style><main class="group-line-component"><div class="chart-stage"><div class="event-label-box">2026-01-30<br>事件日</div></div></main><script>window.resizeCount=0;addEventListener("resize",()=>resizeCount++)</script>'
 with sync_playwright() as p:
  browser=p.chromium.launch();page=browser.new_page()
  page.set_content('<main class="multi-politician-events"><iframe class="native-price-chart" srcdoc="'+html.escape(child,quote=True)+'"></iframe></main><iframe class="other" srcdoc="'+html.escape(child,quote=True)+'"></iframe>')
  page.add_script_tag(content=(ROOT/'app/static/artifact-presentation.js').read_text())
  frame=page.frames[1];frame.wait_for_function('document.querySelector(".chart-stage").clientHeight===200 && resizeCount>0')
  assert frame.locator('.event-label-box').evaluate('e=>({padding:getComputedStyle(e).padding,font:getComputedStyle(e).fontSize})')=={'padding':'6px 8px','font':'11px'}
  assert page.frames[2].locator('.chart-stage').evaluate('e=>e.clientHeight')==344
  browser.close()
