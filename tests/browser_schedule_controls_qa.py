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
                clean=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
                clean=re.sub(r'<link\b[^>]*>','',clean)
                page.set_content(clean)
                page.add_style_tag(content=css)
                page.evaluate("""() => {
                    document.documentElement.dataset.theme='"""+theme+"""';
                    window.fetch=async()=>({ok:true,json:async()=>({tasks:[],sceneTasks:[],markets:[],serverTime:'2026-10-26T01:00:00Z'})});
                }""")
                page.add_script_tag(content=(ROOT/'app/static/task-editor.js').read_text())
                page.add_script_tag(content=(ROOT/'app/static/day-tasks.js').read_text())
                page.evaluate("""() => window.MentoraTaskScheduling.edit({title:'频率设置',question:'检查任务',market:'CN',stage:'pre',cadence:'daily',time:'09:00',timezone:'Asia/Shanghai',triggerMode:'once',frequency:'interval',windowStart:'09:00',windowEnd:'18:00',intervalMinutes:120,enabled:true},data=>window.savedSchedule=data)""")
                assert page.locator('#dayFrequencyLabel').is_visible()
                assert page.locator('#dayWindowFields').is_visible()
                assert not page.locator('#dayTimeLabel').is_visible()
                assert page.locator('[name=windowIntervalAmount]').input_value()=='2'
                for selector in ('#dayFrequencyLabel','#dayWindowFields'):
                    box=page.locator(selector).bounding_box()
                    assert box['x']>=0 and box['x']+box['width']<=width,(width,selector,box)
                page.locator('[data-editor-field=frequency]').click()
                page.get_by_role('option',name='指定时间',exact=True).click()
                assert page.locator('#dayTimeLabel').is_visible()
                assert not page.locator('#dayWindowFields').is_visible()
                print(json.dumps(dict(width=width,theme=theme,absoluteFrequencyControl=True)))
                page.close()
        browser.close()

if __name__=='__main__':main()
