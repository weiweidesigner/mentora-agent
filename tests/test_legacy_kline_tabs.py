import html
import re
from app.artifact_upgrades import sync_native_kline_theme, upgrade_native_kline_data


def document():
    return '''<html data-theme="dark"><head><style>.period-tabs{display:flex;gap:14px;flex:1}.period-button{font-size:16px;font-weight:760}.period-button.active{background:#5d6878}</style></head><body><div class="kline-component"><header class="kline-title"><strong>SPY</strong><nav class="period-tabs"><button class="period-button active" data-period="1d">日K</button></nav></header><canvas id="kline-canvas"></canvas></div><script>const config = {"themeMode":"dark","annotations":[{"price":781.62}]};
const canvas=document.getElementById('kline-canvas');const dataByPeriod={"1d":[{"close":778.01}]};</script></body></html>'''


def test_legacy_tabs_reuse_native_style_without_changing_data_or_scripts():
    before=document();after=sync_native_kline_theme(before,'dark')
    assert 'font:500 13px/20px' in after
    assert 'gap:2px;padding:2px;border:1px solid var(--kl-border)' in after
    assert re.findall(r'<script>.*?</script>',before,re.S)==re.findall(r'<script>.*?</script>',after,re.S)
    assert sync_native_kline_theme(after,'dark')==after
    assert sync_native_kline_theme('<p>Not a native chart</p>','dark')=='<p>Not a native chart</p>'


def test_nested_tabs_and_theme_switch_preserve_periods_and_annotations():
    nested='<html><head></head><body><iframe srcdoc="'+html.escape(document(),quote=True)+'"></iframe></body></html>'
    updated=sync_native_kline_theme(nested,'light')
    child=html.unescape(re.search(r'srcdoc="(.*?)"',updated,re.S)[1])
    assert 'font:500 13px/20px' in child
    assert 'data-theme="light"' in child
    assert '"themeMode":"light"' in child
    assert '"price":781.62' in child and '"close":778.01' in child


def test_saved_sector_quote_strip_is_removed_without_touching_data_or_tabs():
    before=document().replace('</nav>', '</nav><div class="sector-quote-summary" style="display:flex"><span>价格 12,938.27</span><span>YTD +27.08%</span></div>')
    before=before.replace('"themeMode":"dark"', '"themeMode":"dark","sectorContext":{"quote":{"price":12938.27}}')
    after=sync_native_kline_theme(before,'dark')
    assert 'sector-quote-summary' not in after and 'YTD +27.08%' not in after
    assert '"sectorContext":{"quote":{"price":12938.27}}' in after
    assert '<nav class="period-tabs">' in after
    assert sync_native_kline_theme(after,'dark')==after


def test_saved_history_bridge_is_refreshed_without_duplicating_handlers():
    old='''before();
  // Runs in the native chart closure: reuse its bars, viewport and indicator math.
  const historyRequests = new Map();
  const outdatedFooterStatus = true;
  queueMicrotask(() => {ensureHistory(activePeriod,true);showHistoryStatus();});
after();'''
    updated=upgrade_native_kline_data(old)
    assert 'historyBridgeVersion = 3' in updated and 'outdatedFooterStatus' not in updated
    assert updated.count('const historyRequests = new Map();')==1
    assert updated.startswith('before();') and updated.endswith('after();')
    assert upgrade_native_kline_data(updated)==updated


def test_saved_native_chart_gets_one_session_menu_without_regenerating_data():
    original="""<script>
  const config = {"code":"AAPL","dataType":"1m"};
  const dataByPeriod = {"1m":[{"time":100,"close":42}]};
  const tooltip = document.getElementById('kline-tooltip');
  function switchPeriod(period) {}
  function visibleSlice(list, layout) {}
  function maybeLoadPreviousPage() {}
</script>"""
    updated=upgrade_native_kline_data(original)
    assert 'Native one-minute trading-session control, version 1.' in updated
    assert 'const dataByPeriod = {"1m":[{"time":100,"close":42}]};' in updated
    twice=upgrade_native_kline_data(updated)
    assert twice.count('Native one-minute trading-session control, version 1.')==1
    assert twice.count('const historyRequests = new Map();')==1
