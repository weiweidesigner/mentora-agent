"""Real pointer regression: bubble -> gap -> copy/edit stays interactive."""
from pathlib import Path
import pytest
from playwright.sync_api import sync_playwright


@pytest.mark.parametrize('width,task_thread', [(1280, False), (1280, True), (390, False)])
@pytest.mark.parametrize('theme', ['light', 'dark'])
def test_user_action_hover_bridge(width, task_thread, theme):
    css = (Path(__file__).parents[1] / 'app/static/styles.css').read_text()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': width, 'height': 720})
        page.set_content(f'''<html data-theme="{theme}"><style>{css}</style>
          <div class="{'taskThread' if task_thread else 'conversation'}" style="padding:100px 32px">
          <article class="message user"><div class="userMessageWrap">
            <div class="bubble userBubble">复盘本周 A 股市场</div>
            <div class="userActions"><button class="userActionButton" id="copy">复制</button>
            <button class="userActionButton" id="edit">编辑</button></div>
          </div></article><article class="message assistant">回答内容</article></div>
          <script>window.clicked=[];document.querySelectorAll('button').forEach(b=>b.onclick=()=>clicked.push(b.id))</script></html>''')
        bubble = page.locator('.userBubble').bounding_box()
        for name in ('copy', 'edit'):
            page.mouse.move(bubble['x'] + bubble['width']/2, bubble['y'] + bubble['height']/2)
            page.wait_for_timeout(200)
            button = page.locator('#' + name).bounding_box()
            if width > 760:
                gap_x = button['x'] + button['width']/2
                gap_y = bubble['y'] + bubble['height'] + 2
            else:
                gap_x = bubble['x'] - 2
                gap_y = min(bubble['y'] + bubble['height'] - 2, max(bubble['y'] + 2, button['y'] + button['height']/2))
            page.mouse.move(gap_x, gap_y, steps=10)
            page.wait_for_timeout(250)
            assert page.locator('.userActions').evaluate('(el)=>getComputedStyle(el).pointerEvents') == 'auto'
            page.mouse.move(button['x'] + button['width']/2, button['y'] + button['height']/2, steps=10)
            page.wait_for_timeout(200)
            page.mouse.click(button['x'] + button['width']/2, button['y'] + button['height']/2)
        assert page.evaluate('clicked') == ['copy', 'edit']
        browser.close()
