import html
import json

from app import presentation
from app.artifact_upgrades import _constant, _IntradayDocument, _native_multi_intraday, upgrade_legacy_intraday


def legacy_document():
    cards = []
    for symbol, price in [('SPY', 770), ('QQQ', 735), ('ASML', 1710), ('BAC', 49)]:
        config = {'code': symbol, 'name': symbol + ' · 2026-10-14', 'timeZone': 'America/New_York',
                  'subIndicators': ['VOL'], 'annotations': [], 'sources': {'1m': 'saved-source'}}
        rows = [{'time': '2026-10-14T09:30:00-04:00', 'open': price, 'high': price+1,
                 'low': price-1, 'close': price+.5, 'volume': 100}]
        child = '<script>const config = '+json.dumps(config)+';\nconst dataByPeriod = '+json.dumps({'1m': rows})+';</script>'
        cards.append('<iframe srcdoc="'+html.escape(child, quote=True)+'"></iframe>')
    return '<html lang="zh-CN"><main class="multi-intraday"><h2 class="multi-title">旧版多分时报告</h2>'+''.join(cards)+'</main></html>'


def test_upgrade_uses_saved_data_and_preserves_all_four_stocks(monkeypatch):
    native = _native_multi_intraday()
    def no_fetch(*args, **kwargs):
        raise AssertionError('Opening a saved report must not fetch new prices')
    monkeypatch.setattr(native.KLINE, 'fetch_rows', no_fetch)
    old = legacy_document()
    upgraded = upgrade_legacy_intraday(old, 'dark')
    assert 'data-mobile-columns="2"' in upgraded
    assert '旧版多分时报告' in upgraded
    before, after = _IntradayDocument(), _IntradayDocument()
    before.feed(old)
    after.feed(upgraded)
    assert len(after.frames) == 4
    for a, b in zip(before.frames, after.frames):
        assert _constant(a, 'config')['code'] == _constant(b, 'config')['code']
        for original, current in zip(_constant(a, 'dataByPeriod')['1m'], _constant(b, 'dataByPeriod')['1m']):
            for field in ['open', 'high', 'low', 'close', 'volume']:
                assert current[field] == original[field]
    assert upgrade_legacy_intraday(upgraded, 'dark') == upgraded
    assert upgrade_legacy_intraday('<p>Unrelated report</p>', 'dark') == '<p>Unrelated report</p>'


def test_already_mobile_aware_reports_receive_non_overlapping_grid_without_refetch(monkeypatch):
    native = _native_multi_intraday()
    monkeypatch.setattr(native.KLINE, 'fetch_rows', lambda *a, **k: (_ for _ in ()).throw(AssertionError('must not refetch')))
    old = legacy_document().replace('class="multi-intraday"', 'class="multi-intraday" data-mobile-columns="4" style="--columns:4"')
    upgraded = upgrade_legacy_intraday(old, 'dark')
    assert 'data-intraday-layout="2"' in upgraded
    assert 'data-mobile-columns="4"' in upgraded
    assert 'grid-auto-columns:max(340px,' in upgraded
    before, after = _IntradayDocument(), _IntradayDocument()
    before.feed(old);after.feed(upgraded)
    assert len(after.frames) == len(before.frames) == 4
    for original, current in zip(before.frames, after.frames):
        for a, b in zip(_constant(original, 'dataByPeriod')['1m'], _constant(current, 'dataByPeriod')['1m']):
            assert all(a[field] == b[field] for field in ('time','open','high','low','close','volume'))
    assert upgrade_legacy_intraday(upgraded, 'dark') == upgraded


def test_share_route_upgrades_old_layout_without_overwriting_file(tmp_path, monkeypatch):
    original = legacy_document()
    path = tmp_path/'old-intraday.html'
    path.write_text(original)
    monkeypatch.setattr(presentation, 'GENERATED_DIR', tmp_path)
    response = presentation.share_streamviz_artifact(path.name, 'dark')
    assert 'data-mobile-columns="2"' in response.body.decode()
    assert path.read_text() == original


def test_old_grouped_bar_is_rebuilt_with_same_saved_values():
    from app.artifact_upgrades import _native_grouped_bar, upgrade_legacy_grouped_bar
    native = _native_grouped_bar()
    payload = {"type":"grouped-bar", "title":"Saved comparison", "props":{"xField":"name", "series":[{"field":"gap", "label":"Gap"},{"field":"now", "label":"Now"}]}, "data":[{"name":"Long category", "gap":-9.76, "now":.01}]}
    config = native.normalize_xy_series(payload, "grouped-bar", "Test", "bar")
    old = native.render_svg_chart(config, "bar").replace(' data-chart-layout-version="2"', '')
    new = upgrade_legacy_grouped_bar(old, "dark")
    assert 'data-chart-layout-version="2"' in new
    assert _constant(old, "config")["data"] == _constant(new, "config")["data"]
    assert _constant(new, "config")["themeMode"] == "dark"


def test_saved_bar_receives_readable_typography_once():
    from app.artifact_upgrades import upgrade_generic_chart_typography

    source = '<html><head><style data-cartesian-typography="2"></style></head><body><section class="chart-component"></section><script>const config = {"type":"bar"};</script></body></html>'
    upgraded = upgrade_generic_chart_typography(source)
    assert 'data-cartesian-typography="3"' in upgraded
    assert '.axis-label,.x-label{font-size:13px!important}' in upgraded
    assert 'font-size:14px!important;line-height:1.55!important' in upgraded
    assert '.tooltip-row{min-height:26px!important' in upgraded
    assert upgrade_generic_chart_typography(upgraded) == upgraded


def test_non_bar_chart_typography_is_unchanged():
    from app.artifact_upgrades import upgrade_generic_chart_typography

    source = '<html><head></head><body><section class="chart-component"></section><script>const config = {"type":"bar-line"};</script></body></html>'
    assert upgrade_generic_chart_typography(source) == source


def test_mobile_payout_upgrade_preserves_model_title_and_financial_records():
    from pathlib import Path
    from app.artifact_upgrades import upgrade_legacy_mobile_charts
    native_path = Path(__file__).parents[1] / 'app/static/cases/inspiration/business-payout_ratio/inspiration-real-business-payout_ratio-aapl-live.html'
    current = native_path.read_text()
    # The title was historically carried by the heading runtime, not the data.
    old = current.replace(' data-mobile-layout="2"', '')
    payload_pattern = r'<script id="payload" type="application/json">(.*?)</script>'
    import re
    before = json.loads(html.unescape(re.search(payload_pattern, old, re.S)[1]))
    before.pop('customTitle', None)
    old = re.sub(payload_pattern, lambda _: '<script id="payload" type="application/json">'+json.dumps(before, ensure_ascii=False)+'</script>', old, flags=re.S)
    upgraded = upgrade_legacy_mobile_charts(old, 'dark')
    after = json.loads(html.unescape(re.search(payload_pattern, upgraded, re.S)[1]))
    assert after['records'] == before['records']
    assert after['customTitle'] == '苹果分红率创13年新低：利润快增稀释派息'
    assert 'data-mobile-layout="2"' in upgraded
    assert 'data-theme="dark"' in upgraded
    assert upgrade_legacy_mobile_charts(upgraded, 'dark') == upgraded


def test_bubble_layout_upgrade_keeps_data_and_annotation_but_replaces_touch_runtime():
    from pathlib import Path
    from app.artifact_upgrades import upgrade_legacy_mobile_charts
    path = Path(__file__).parents[1] / 'app/static/cases/inspiration/analysis-dynamic_bubble/inspiration-real-analysis-dynamic_bubble.html'
    current = path.read_text()
    old = current.replace('data-mobile-chart-repair="3"', 'data-mobile-chart-repair="old"')
    upgraded = upgrade_legacy_mobile_charts(old, 'dark')
    assert upgraded.count('id="genericMobileTouch"') == 1
    assert 'new MutationObserver(conceal)' in upgraded
    assert "formatter:'当月波动最高',position:'left',distance:8" in upgraded
    assert current.split('const payload=')[1].split(';\n')[0] == upgraded.split('const payload=')[1].split(';\n')[0]


def test_saved_chart_touch_runtime_refreshes_even_after_layout_repairs():
    from app.artifact_upgrades import upgrade_legacy_mobile_charts
    old = '<html><head><style data-mobile-chart-repair="3"></style></head><body><style id="genericMobileTouchStyle"></style><script id="genericMobileTouch">oldRuntime();</script></body></html>'
    upgraded = upgrade_legacy_mobile_charts(old, 'dark')
    assert 'const pointerY=originY+event.clientY-placement.top;' in upgraded
    assert 'oldRuntime()' not in upgraded
    assert upgraded.count('id="genericMobileTouch"') == 1
    assert upgrade_legacy_mobile_charts(upgraded, 'dark') == upgraded
