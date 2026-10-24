import html
from app.artifact_upgrades import upgrade_native_kline_pine


def fixture():
    return '''<html><div id="kline-canvas"></div><script>
const canvas = document.getElementById('kline-canvas');
  const tooltip = document.getElementById('kline-tooltip');
  const dataByPeriod = {"1d":[{"close":12.34}]};
    const priceScale = scale(minP, maxP, main.y + 16, main.h - 20);
    lastRenderState = { layout, all, slice, main, xOf, priceScale };
</script></html>'''


def test_legacy_upgrade_is_idempotent_and_preserves_market_data():
    updated = upgrade_native_kline_pine(fixture())
    assert "root.dataset.pineBridge = '1'" in updated
    assert 'const dataByPeriod = {"1d":[{"close":12.34}]};' in updated
    assert upgrade_native_kline_pine(updated) == updated


def test_upgrade_nested_srcdoc_and_ignore_unknown_renderers():
    nested = '<iframe srcdoc="'+html.escape(fixture(), quote=True)+'"></iframe>'
    assert 'pineBridge' in upgrade_native_kline_pine(nested)
    incomplete = fixture().replace('    lastRenderState = { layout, all, slice, main, xOf, priceScale };', '')
    assert upgrade_native_kline_pine(incomplete) == incomplete
    assert upgrade_native_kline_pine('<p>Other chart</p>') == '<p>Other chart</p>'
