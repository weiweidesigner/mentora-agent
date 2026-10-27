"""Real-browser theme/direction regressions, using only offline fixture data."""
import importlib.util
from pathlib import Path

from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sv_renderer',ROOT/'app/skills/streamviz/scripts/render_streamviz.py')
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)

def main():
    payload=dict(financialMarket='CN',title='离线主题测试',metrics=[dict(label='上涨',value='+1.70%'),dict(label='下跌',value='-2.48%'),dict(label='平盘',value='0%'),dict(label='参与率',value='80.0%')],blocks=[dict(type='rankings',title='强势行业（行业内个股涨跌幅中位数）',items=[dict(label='电机',value='+1.70%',detail='80.0%上涨 · 25只'),dict(label='航空装备',value='-2.48%',detail='0%上涨 · 47只')]),dict(type='rankings',title='美股',financialMarket='US',items=[dict(label='US',value='+2%')]),dict(type='table',title='变化列',columns=['价格','涨跌幅'],financialColumns=['涨跌幅'],rows=[{'价格':100,'涨跌幅':-2}])])
    page_html=renderer.render(payload)
    # Old output has only plain strong values. Its data is not rewritten.
    legacy='<section class="sv-section"><h2>强势行业（涨跌幅中位数）</h2><article class="sv-rank"><strong>+1.70%</strong></article><article class="sv-rank"><strong>-2.48%</strong></article></section><section class="sv-section"><h2>普通占比排名</h2><article class="sv-rank"><strong>80%</strong></article></section>'
    page_html=page_html.replace('</main>',legacy+'</main>')
    with sync_playwright() as runtime:
        browser=runtime.chromium.launch(headless=True)
        for width in (320,390,1280):
            page=browser.new_page(viewport=dict(width=width,height=1000));errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.set_content(page_html)
            for theme in ('light','dark','light'):
                page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
                values=page.evaluate("""()=>{
                  const color=s=>getComputedStyle(document.querySelector(s)).color;
                  const strong=[...document.querySelectorAll('.sv-rank>strong')];
                  const style=getComputedStyle(strong[0].parentElement);
                  return {up:color('.sv-metric [data-sv-direction="up"]'),down:color('.sv-metric [data-sv-direction="down"]'),flat:color('.sv-metric [data-sv-direction="flat"]'),ordinary:color('.sv-metric:nth-child(4)>strong'),us:color('[data-financial-market="US"] [data-sv-direction="up"]'),background:style.backgroundColor,border:style.borderColor,radius:style.borderRadius,legacy:strong.slice(-3).map(n=>({color:getComputedStyle(n).color,direction:n.dataset.svDirection||'',text:n.textContent})),overflow:document.documentElement.scrollWidth>innerWidth};
                }""")
                assert not values['overflow'],(width,values)
                assert values['up']!=values['down'] and values['flat']!=values['up']
                assert values['ordinary'] not in (values['up'],values['down'])
                assert values['us']==values['down']
                assert [x['direction'] for x in values['legacy']]==['up','down','']
                assert [x['text'] for x in values['legacy']]==['+1.70%','-2.48%','80%']
                if theme=='dark':
                    assert values['up']=='rgb(238, 119, 125)' and values['down']=='rgb(100, 183, 157)'
                    assert values['background']=='rgb(24, 24, 24)' and values['border']=='rgb(52, 52, 52)' and values['radius']=='8px'
                assert not errors,errors
            page.close()
        # Exercise the built production bundle and its opaque-origin sandbox;
        # platform normalization has its own !important legacy text rules.
        page=browser.new_page(viewport=dict(width=1280,height=1000))
        def route(request):
            if '/static/vendor/streamviz/' in request.request.url:
                return request.fulfill(path=str(ROOT/'app/static/vendor/streamviz'/request.request.url.rsplit('/',1)[-1]))
            return request.fulfill(body='<html data-theme="dark"><body><div id="widget"></div><script type="module" src="/static/vendor/streamviz/streamviz.js"></script></body></html>',content_type='text/html')
        page.route('https://streamviz.test/**',route);page.goto('https://streamviz.test/')
        page.wait_for_function('!!window.AimeStreamViz')
        widget='<div class="sv"><section class="sv-section"><h2>强势行业（涨跌幅中位数）</h2><article class="sv-rank"><div>电机</div><strong>+1.70%</strong></article><article class="sv-rank"><strong>-2.48%</strong></article></section></div>'
        page.evaluate('(code)=>AimeStreamViz.mount(document.querySelector("#widget"),{code,final:true,title:"主题测试"})',widget)
        frame=page.frame_locator('iframe').first
        frame.locator('[data-sv-direction="up"]').wait_for()
        assert frame.locator('[data-sv-direction="up"]').evaluate('(node)=>getComputedStyle(node).color')=='rgb(238, 119, 125)'
        assert frame.locator('[data-sv-direction="down"]').evaluate('(node)=>getComputedStyle(node).color')=='rgb(100, 183, 157)'
        assert frame.locator('.sv-rank').first.evaluate('(node)=>getComputedStyle(node).backgroundColor')=='rgb(24, 24, 24)'
        page.evaluate('document.documentElement.dataset.theme="light";window.dispatchEvent(new Event("aime:theme-change"))')
        expect(frame.locator('[data-sv-direction="up"]')).to_have_css('color','rgb(196, 50, 68)')
        page.close()
        browser.close()
    print('PASS: 320/390/1280px, theme toggles, neutral night, CN/US direction, legacy repairs and ordinary percentages')

if __name__=='__main__':main()
