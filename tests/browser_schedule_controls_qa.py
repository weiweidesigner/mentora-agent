"""Check enabled switch colors using the real stylesheet in both themes."""
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def main():
    html=(ROOT/'app/static/index.html').read_text()
    assert 'dayScheduleModeHelp' not in html
    assert '市场当地时间 · 结束时刻不触发' not in html
    css=(ROOT/'app/static/styles.css').read_text()
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        for width in (390,1280):
            for theme in ('light','dark'):
                page=browser.new_page(viewport=dict(width=width,height=800))
                page.set_content('<html data-theme="'+theme+'"><head><style>'+css+'</style></head><body><label class="taskSettingRow"><span>重复执行任务</span><input class="taskSwitch" type="checkbox" checked></label></body></html>')
                switch=page.locator('.taskSwitch')
                checked=switch.evaluate('el=>getComputedStyle(el).backgroundColor')
                assert checked=='rgb(156, 138, 255)',(width,theme,checked)
                switch.uncheck()
                assert switch.evaluate('el=>getComputedStyle(el).backgroundColor')!=checked
                switch.check()
                assert switch.is_checked()
                print(json.dumps(dict(width=width,theme=theme,enabledPurple=True,disabledNeutral=True)))
                page.close()
        browser.close()

if __name__=='__main__':main()
