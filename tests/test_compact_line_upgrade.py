from app.artifact_upgrades import upgrade_compact_generic_line


def test_line_upgrade_is_scoped_and_idempotent():
    html = '''<section class="group-line-component"></section><script>
function postChartHeight() { const minHeight = stageHeight + 56; }
window.addEventListener('resize', () => { render(); postChartHeight(); });
</script>'''
    upgraded = upgrade_compact_generic_line(html)
    assert 'data-compact-line-height="2"' in upgraded
    assert 'stageHeight + 56' not in upgraded
    assert 'root.dataset.embedHeight = String(height)' in upgraded
    assert 'const legendVisible' in upgraded and "!root.classList.contains('has-event-marks')" in upgraded
    assert upgrade_compact_generic_line(upgraded) == upgraded
    unrelated = html.replace('group-line-component', 'kline-component')
    assert upgrade_compact_generic_line(unrelated) == unrelated


def test_settled_line_height_does_not_resize_and_dismiss_hover():
    """Reproduce render-time SVG text repair inside a real iframe."""
    import html
    from playwright.sync_api import sync_playwright
    document = '''<!doctype html><style>
    body{margin:0}.group-line-component{height:304px}.chart-stage,svg{height:278px;width:100%}
    </style><section class="group-line-component"><div style="height:26px"></div>
    <div class="chart-stage"><svg><text x="20" y="264">2026-09</text><rect class="hover-zone" x="0" y="0" width="100%" height="230" fill="transparent"/></svg></div>
    <div class="chart-legend" style="display:none"></div><div class="chart-tooltip"></div></section><script>
    const root=document.querySelector('section'),stage=document.querySelector('.chart-stage'),svg=document.querySelector('svg'),legend=document.querySelector('.chart-legend'),tooltip=document.querySelector('.chart-tooltip');
    function render(){svg.querySelector('text').setAttribute('y','270');queueMicrotask(()=>svg.querySelector('text').setAttribute('y','264'));}
    function postChartHeight() { const unused = true; }
    window.addEventListener('resize',()=>{render();postChartHeight();parent.document.querySelector('#tip').hidden=true;window.resizeCount=(window.resizeCount||0)+1;});
    document.querySelector('rect').addEventListener('mouseenter',()=>{parent.document.querySelector('#tip').hidden=false;postChartHeight();});
    document.querySelector('rect').addEventListener('mouseleave',()=>{parent.document.querySelector('#tip').hidden=true;});
    render();postChartHeight();</script>'''
    upgraded = upgrade_compact_generic_line(document)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for width in (1120, 390):
                page = browser.new_page(viewport={'width': width, 'height': 700})
                page.set_content('<span id="tip" role="tooltip" hidden>2026-09 4.2%</span><iframe style="width:100%;height:520px;border:0" srcdoc="' + html.escape(upgraded, quote=True) + '"></iframe>')
                page.wait_for_timeout(300)
                frame = page.frames[1]
                before = frame.evaluate('window.resizeCount || 0')
                frame.locator('rect').hover()
                page.wait_for_timeout(300)
                assert page.locator('#tip').is_visible()
                assert frame.evaluate('window.resizeCount || 0') == before
                page.mouse.move(0, 0)
                assert not page.locator('#tip').is_visible()
                page.close()
        finally:
            browser.close()
