"""Offline layout regression: values/units stay on one line beside wrapped labels."""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    presentation = (ROOT / 'app/static/artifact-presentation.js').read_text()
    layout = presentation.split('/* Keep numeric values/units intact', 1)[1]
    layout = layout[layout.index('(() => {'):layout.index('/* Generic chart typography')]
    app = (ROOT / 'app/static/app.js').read_text()
    portal = app[app.index('let reportTooltipPortal = null;'):app.index('function createArtifactFallbackFrame(')]
    with sync_playwright() as runtime:
        browser = runtime.chromium.launch(headless=True)
        for width in (390, 1440):
            for mode in ('flex', 'grid'):
                page = browser.new_page(viewport=dict(width=width, height=700))
                page.set_content('<iframe style="width:320px;height:500px;border:0"></iframe>')
                frame = page.frames[1]
                frame.set_content('''<style>
                    *{box-sizing:border-box}body{margin:0;font:14px/1.5 sans-serif}
                    .tooltip{width:280px;padding:14px;background:#3b3b3b;color:white}
                    .tip-row{display:flex;align-items:center;gap:18px;margin-top:6px}
                    .tip-label{display:inline-flex;align-items:center;gap:7px}
                    .tip-dot{width:8px;height:8px;flex-shrink:0;background:#2863f4;border-radius:50%}
                    .tip-value{font-weight:bold;line-height:1.5}
                    </style><aside class="tooltip"><div>2020年</div>
                    <div class="tip-row"><span class="tip-label"><span class="tip-dot"></span>每股现金分红（元/股，含税）</span><span class="tip-value">1.20 元</span></div>
                    <div class="tip-row"><span class="tip-label"><span class="tip-dot"></span>股利支付率（现金分红总额÷归母净利润）</span><span class="tip-value">37.42%</span></div></aside>''')
                if mode == 'grid':
                    frame.add_style_tag(content='.tip-row{display:grid;grid-template-columns:minmax(0,1fr) auto}')
                frame.evaluate(layout)
                assert frame.locator('[data-tooltip-value-layout]').count() == 1
                # Installing twice must not duplicate the style.
                frame.evaluate(layout)
                assert frame.locator('[data-tooltip-value-layout]').count() == 1
                def verify(context, selector, lifted=False):
                    rows = context.locator(selector).evaluate('''tip=>Array.from(tip.children).slice(1).map(row=>{
                      const label=row.children[0],value=row.children[1],r=value.getBoundingClientRect(),l=label.getBoundingClientRect();
                      const range=document.createRange();range.selectNodeContents(value);
                      return {top:l.top-r.top,lines:range.getClientRects().length,wrap:getComputedStyle(value).whiteSpace,
                              overflow:row.scrollWidth>row.clientWidth+1,text:value.textContent,labelHeight:l.height,valueHeight:r.height};
                    })''')
                    for row in rows:
                        assert abs(row['top']) < 1, (width, mode, lifted, row)
                        assert row['lines'] == 1 and row['wrap'] == 'nowrap', row
                        assert not row['overflow'], row
                    assert rows[1]['labelHeight'] > rows[1]['valueHeight'], rows
                    assert [row['text'] for row in rows] == ['1.20 元', '37.42%']
                verify(frame, '.tooltip')
                page.evaluate(portal)
                page.evaluate("installReportTooltipPortal(document.querySelector('iframe'))")
                frame.locator('.tooltip').evaluate("tip=>tip.classList.add('visible')")
                page.wait_for_selector('.reportTooltipPortal', state='visible')
                verify(page, '.reportTooltipPortal', True)
                page.close()
        browser.close()
    print('PASS: flex/grid tooltips and lifted portals at mobile/desktop widths')


if __name__ == '__main__':
    main()
