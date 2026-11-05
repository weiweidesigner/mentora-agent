"""Check mind-map controls and native/dialog fullscreen without account data."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

root=Path(__file__).parents[1]
output=root/'outputs/nebula-controls-qa'
output.mkdir(parents=True,exist_ok=True)
css=(root/'app/static/character.css').read_text()
source=(root/'app/static/memory-sphere.js').read_text()
checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch()
 for width,theme in [(1280,'light'),(1280,'dark'),(390,'light'),(390,'dark')]:
  page=browser.new_page(viewport={'width':width,'height':900})
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.set_content('<style>:root{--bg:#fafafa;--ink:#202124;--muted:#707780;--line:#dedee4;--soft-2:#eeeeef}body{margin:0;background:var(--bg);color:var(--ink)}.fixture{width:min(420px,calc(100vw - 40px));margin:32px auto}.chWordCloud{display:grid;place-items:center}</style><main id="characterWorkspace" class="characterWorkspace"><section class="fixture"><div id="cloud" class="chWordCloud"></div></section></main>')
  page.add_style_tag(content=css)
  if theme=='dark':page.add_style_tag(content=':root{--bg:#171719;--ink:#eee;--muted:#aaa;--line:#444;--soft-2:#28282c}')
  page.evaluate(source)
  page.evaluate("window.fixture=MentoraMemorySphere(document.getElementById('cloud'));fixture.setFacts(Array.from({length:20},(_,i)=>({id:String(i),label:'记忆'+i,text:'对应记忆内容'+i,weight:3})))")
  page.locator('.chMemorySphere').focus()
  first=page.locator('.chMemoryWord').first
  transform=first.evaluate('(element)=>element.style.transform')
  page.wait_for_timeout(250)
  assert first.evaluate('(element)=>element.style.transform')!=transform
  page.locator('.chMemorySphere').dispatch_event('pointerenter')
  transform=first.evaluate('(element)=>element.style.transform')
  page.wait_for_timeout(250)
  assert first.evaluate('(element)=>element.style.transform')!=transform
  expand=page.locator('.chNebulaExpand')
  before=expand.bounding_box();host=page.locator('#cloud').bounding_box()
  assert abs(before['x']+before['width']-(host['x']+host['width']-(12 if width<640 else 14)))<1
  assert abs(before['y']-(host['y']+(9 if width<640 else 18)))<1
  assert before['width']==24 and before['height']==24
  tools=page.locator('.chNebulaZoom');assert tools.is_hidden()
  page.screenshot(path=str(output/f'{theme}-{width}-inline.png'))
  expand.click()
  page.wait_for_function("!!document.fullscreenElement")
  close=page.locator('.chNebulaClose');box=close.bounding_box()
  inset=18
  assert abs(box['x']+box['width']-(width-inset))<1
  assert abs(box['y']-14)<1
  assert tools.is_visible()
  zoom=tools.bounding_box()
  assert abs(zoom['x']+zoom['width']-(width-12))<1 and abs(zoom['y']+zoom['height']-888)<1
  tools.locator('[data-nebula-zoom=in]').click()
  tools.locator('[data-nebula-zoom=out]').click()
  assert page.locator('.chMemorySphere').evaluate('(el)=>el.style.transform')=='scale(1)'
  assert close.locator('svg').count()==1 and close.inner_text()==''
  page.screenshot(path=str(output/f'{theme}-{width}-fullscreen.png'))
  close.click()
  page.wait_for_function("!document.fullscreenElement && !document.querySelector('.chNebulaDialog').open")
  assert page.locator('#cloud .chMemorySphere').count()==1
  assert expand.get_attribute('aria-expanded')=='false'
  assert tools.is_hidden()
  expand.click();page.wait_for_function('!!document.fullscreenElement')
  page.evaluate('document.exitFullscreen()')
  page.wait_for_function("!document.querySelector('.chNebulaDialog').open")
  page.evaluate("() => { document.querySelector('.chNebulaFullSurface').requestFullscreen=()=>Promise.reject(new Error('unsupported')); }")
  expand.click();page.wait_for_function("document.querySelector('.chNebulaDialog').open")
  page.keyboard.press('Escape');page.wait_for_function("!document.querySelector('.chNebulaDialog').open")
  assert not errors,errors
  checks.append({'width':width,'theme':theme,'native_fullscreen':True,'exit_button':True,'browser_exit_restores':True,'fallback_escape':True,'top_right_fullscreen':True,'bottom_right_zoom':True,'continuous_animation':True,'page_errors':errors})
  page.close()
 browser.close()
(output/'checks.json').write_text(json.dumps(checks,indent=2))
print(json.dumps(checks))
