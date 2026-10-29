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
