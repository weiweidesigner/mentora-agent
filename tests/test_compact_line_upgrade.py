from app.artifact_upgrades import upgrade_compact_generic_line


def test_line_upgrade_is_scoped_and_idempotent():
    html = '''<section class="group-line-component"></section><script>
function postChartHeight() { const minHeight = stageHeight + 56; }
window.addEventListener('resize', () => { render(); postChartHeight(); });
</script>'''
    upgraded = upgrade_compact_generic_line(html)
    assert 'data-compact-line-height="1"' in upgraded
    assert 'stageHeight + 56' not in upgraded
    assert 'root.dataset.embedHeight = String(height)' in upgraded
    assert 'const legendVisible' in upgraded and "!root.classList.contains('has-event-marks')" in upgraded
    assert upgrade_compact_generic_line(upgraded) == upgraded
    unrelated = html.replace('group-line-component', 'kline-component')
    assert upgrade_compact_generic_line(unrelated) == unrelated
