"""Upgrade saved presentation layouts from their embedded data, without refetching."""
from __future__ import annotations

import importlib.util
import json
import re
from functools import lru_cache
from html.parser import HTMLParser
from pathlib import Path


def compact_native_kline_layout(script: str) -> str:
    """Fit saved and newly generated K-lines without changing their data or zoom."""
    script = script.replace(
        'const configuredMainHeight = Number(config.mainChartHeight || 300);',
        'const configuredMainHeight = Math.min(340, Number(config.mainChartHeight || 300));',
    ).replace(
        'const configuredSubHeight = Number(config.subChartHeight || 72);',
        'const configuredSubHeight = Math.min(72, Number(config.subChartHeight || 72));',
    )
    # Keep room for indicator legends and value axes on both screen sizes.
    script = script.replace('isCompact ? 90 : 112', 'isCompact ? 72 : 80')
    script = script.replace('isCompact ? Math.round(width * 0.17) : 112', 'isCompact ? 72 : 80')
    script = script.replace('isCompact ? Math.round(width * 0.13) : 78', 'isCompact ? Math.round(width * 0.13) : 64')
    return script


def upgrade_native_kline_data(script: str) -> str:
    """Connect native saved/new chart closures to the host's paged data API."""
    bridge=(Path(__file__).parent/'static/kline-data-bridge.js').read_text(encoding='utf-8').rstrip()
    hook="  const tooltip = document.getElementById('kline-tooltip');"
    session_asset=Path(__file__).parent/'skills/business-chart-recall/assets/kline-session.js'
    if 'Native one-minute trading-session control, version 1.' not in script and hook in script and session_asset.is_file():
        script=script.replace(hook,hook+'\n'+session_asset.read_text(encoding='utf-8'),1)

    if 'const historyRequests = new Map();' in script:
        start=script.find('  // Runs in the native chart closure:')
        end_marker='  queueMicrotask(() => {ensureHistory(activePeriod,true);showHistoryStatus();});'
        end=script.find(end_marker,start) if start>=0 else -1
        return script[:start]+bridge+script[end+len(end_marker):] if end>=0 else script
    names=('switchPeriod','visibleSlice','maybeLoadPreviousPage')
    if any('function '+name+'(' not in script for name in names):return script
    hook="  const tooltip = document.getElementById('kline-tooltip');"
    if hook not in script:return script
    for name in names:
        script=script.replace('function '+name+'(', 'function embedded'+name[0].upper()+name[1:]+'(',1)
    script=script.replace('Math.max(8, Number(config.zoomMinBars || 20))','Math.max(1, Number(config.zoomMinBars || 20))')
    return script.replace(hook,hook+'\n'+bridge,1)


def sync_native_kline_theme(artifact: str, theme: str, depth: int = 0) -> str:
    """Refresh native presentation only, including historical encoded child charts."""
    import html
    if depth>4:return artifact
    def child(match):
        original=html.unescape(match[2])
        updated=sync_native_kline_theme(original,theme,depth+1)
        return match[0] if updated==original else match[1]+html.escape(updated,quote=True)+match[3]
    artifact=re.sub(r'(\bsrcdoc=")(.*?)(")',child,artifact,flags=re.S)
    if 'id="kline-canvas"' not in artifact or 'class="kline-component"' not in artifact:return artifact
    artifact=re.sub(r'<div class="sector-quote-summary"[^>]*>.*?</div>', '', artifact, flags=re.S)
    def update_script(match):
        script=match[0]
        if "getElementById('kline-canvas')" not in script:return script
        script=compact_native_kline_layout(script)
        # The dedicated live widget owns its one-session refresh lifecycle.
        if 'id="ashare-live-config"' not in artifact:
            script=upgrade_native_kline_data(script)
        return re.sub(r'(const config = \{[^\n]*?"themeMode"\s*:\s*)"(?:light|dark)"',lambda m:m[1]+json.dumps(theme),script,count=1)
    artifact=re.sub(r'<script\b[^>]*>.*?</script\s*>',update_script,artifact,flags=re.S|re.I)
    artifact=re.sub(r'<style data-kline-theme="dual">.*?</style>','',artifact,flags=re.S)
    css=(Path(__file__).parent/'skills/business-chart-recall/assets/kline-theme.css').read_text(encoding='utf-8')
    artifact=re.sub(r'<html\b([^>]*)>',lambda m:'<html'+re.sub(r'\sdata-theme\s*=\s*(["\']).*?\1','',m[1])+f' data-theme="{theme}">',artifact,count=1,flags=re.I)
    return re.sub(r'</head\s*>',lambda _:'<style data-kline-theme="dual">'+css+'</style></head>',artifact,count=1,flags=re.I)


class _IntradayDocument(HTMLParser):
    def __init__(self):
        super().__init__()
        self.frames: list[str] = []
        self.title: list[str] = []
        self.in_title = False
        self.language = "zh"

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html":
            self.language = attrs.get("lang") or "zh"
        if tag == "iframe" and attrs.get("srcdoc"):
            self.frames.append(attrs["srcdoc"])
        if tag == "h2" and "multi-title" in (attrs.get("class") or "").split():
            self.in_title = True

    def handle_endtag(self, tag):
        if tag == "h2":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)


@lru_cache(maxsize=1)
def _native_multi_intraday():
    script = Path(__file__).parent / "skills/business-chart-recall/scripts/multi_intraday.py"
    spec = importlib.util.spec_from_file_location("saved_multi_intraday", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _constant(document: str, name: str):
    marker = "const " + name + " = "
    start = document.index(marker) + len(marker)
    return json.JSONDecoder().raw_decode(document[start:])[0]


@lru_cache(maxsize=1)
def _native_kline():
    script = Path(__file__).parent / "skills/business-chart-recall/scripts/kline.py"
    spec = importlib.util.spec_from_file_location("saved_native_kline", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def upgrade_native_kline_runtime(artifact: str) -> str:
    """Move saved native K-lines to the current runtime using embedded OHLCV only."""
    if 'class="kline-component"' not in artifact or ('data-kline-drawings="2"' in artifact and 'data-kline-bars="2"' in artifact):
        return artifact
    try:
        config = _constant(artifact, "config")
        current = _constant(artifact, "dataByPeriod")
        lazy = _constant(artifact, "lazyPagesByPeriod") if "const lazyPagesByPeriod = " in artifact else {}
        if not isinstance(config, dict) or not isinstance(current, dict):
            return artifact
        data_by_period = {}
        for period, rows in current.items():
            if not isinstance(rows, list):
                continue
            pages = lazy.get(period, []) if isinstance(lazy, dict) else []
            older = [row for page in pages if isinstance(page, list) for row in page]
            data_by_period[str(period)] = [*older, *rows]
        if not any(data_by_period.values()):
            return artifact
        props = {**config, "availablePeriods": list(data_by_period), "prefetchPeriods": list(data_by_period)}
        payload = {
            "type": "kline",
            "title": config.get("displayTitle") or config.get("name") or config.get("code") or "K-line",
            "props": props,
            "dataByPeriod": data_by_period,
        }
        upgraded = _native_kline().render_document(payload)
        return upgraded if 'mentora:kline-config' in upgraded and 'data-kline-drawings="2"' in upgraded else artifact
    except (AttributeError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return artifact


def upgrade_legacy_intraday(artifact: str, theme: str) -> str:
    """Re-render legacy multi-intraday srcdocs with exactly their saved OHLCV rows."""
    if 'class="multi-intraday"' not in artifact or 'data-intraday-quotes="2"' in artifact:
        return artifact
    parser = _IntradayDocument()
    parser.feed(artifact)
    if not 1 <= len(parser.frames) <= 8:
        return artifact
    try:
        native = _native_multi_intraday()
        cards = []
        zone = "America/New_York"
        indicators = ["VOL"]
        previous_closes = {}
        for child in parser.frames:
            config = _constant(child, "config")
            if config.get("annotations"):
                return artifact
            interval = config.get("dataType", "1m")
            rows = _constant(child, "dataByPeriod")[interval]
            if not isinstance(rows, list) or not rows:
                return artifact
            zone = str(config.get("timeZone") or zone)
            dates = {native._row_date(row.get("time"), zone) for row in rows}
            if len(dates) != 1 or not all(dates):
                return artifact
            indicators = config.get("subIndicators") or []
            name = re.sub(r"\s*·\s*\d{4}-\d{2}-\d{2}.*$", "", str(config.get("name") or config["code"]))
            day=dates.pop()
            saved_prior=previous_closes.get(config["code"])
            prior=saved_prior[1] if saved_prior and saved_prior[0] < day else None
            metadata_match=re.search(r'<script type="application/json" id="intraday-card-meta">(.*?)</script>',child,re.S)
            if metadata_match:
                metadata=json.loads(metadata_match[1])
                prior=metadata.get("previousClose",prior)
                name=str(metadata.get("name") or name)
            cards.append({"symbol": config["code"], "name": name, "date": day,"interval":interval,
                          "data": rows,"previousClose":prior,
                          "source": (config.get("sources") or {}).get(interval, "saved"),
                          "reliableVolume": "VOL" in indicators})
            # Saved card history only establishes the following day's reference;
            # no opening-price substitute is used for the first saved day.
            from datetime import datetime
            from zoneinfo import ZoneInfo
            last_time=rows[-1]["time"]
            stamp=datetime.fromisoformat(str(last_time).replace("Z", "+00:00")) if isinstance(last_time,str) and not last_time.isdigit() else datetime.fromtimestamp(float(last_time)/(1000 if float(last_time)>1e11 else 1),ZoneInfo(zone))
            if stamp.tzinfo: stamp=stamp.astimezone(ZoneInfo(zone))
            if stamp.strftime("%H:%M")=="15:00":
                previous_closes[config["code"]]=(day,rows[-1]["close"])
        columns = re.search(r"--columns\s*:\s*([1-4])", artifact)
        mobile_columns = re.search(r'data-mobile-columns=["\x27]([1-4])["\x27]', artifact)
        payload = {"type": "multi-intraday", "title": "".join(parser.title), "cards": cards,
                   "props": {"symbols": list(dict.fromkeys(card["symbol"] for card in cards)),
                             "timezone": zone, "theme": theme, "language": parser.language,
                             "columns": int(columns.group(1)) if columns else min(3, len(cards)),
                             "mobileColumns": int(mobile_columns.group(1)) if mobile_columns else min(2, len(cards)), "subIndicators": indicators}}
        config = native._validate_payload(payload)
        return native.render_document(config["title"], native.build_cards(config), config)
    except (ValueError, KeyError, TypeError, IndexError):
        # Non-native/mixed/annotated layouts stay intact rather than lose data.
        return artifact


@lru_cache(maxsize=1)
def _native_grouped_bar():
    script = Path(__file__).parent / "skills/generic-chart/scripts/grouped_bar.py"
    spec = importlib.util.spec_from_file_location("saved_grouped_bar", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def upgrade_legacy_grouped_bar(artifact: str, theme: str) -> str:
    """Apply current axis/layout logic to native grouped bars using saved values."""
    if 'class="chart-component"' in artifact and 'config' in artifact and 'const zeroGridScaleVersion = 3;' not in artifact:
        try:
            config = _constant(artifact, 'config')
            if config.get('type') == 'grouped-bar':
                config['themeMode'] = theme
                return _native_grouped_bar().render_svg_chart(config, 'bar')
        except (ValueError, KeyError, TypeError):
            pass
    if 'class="chart-component"' not in artifact or 'data-chart-layout-version="2"' in artifact:
        return artifact
    if 'function sampledXAxisIndexes' not in artifact or 'function tooltipBounds' not in artifact:
        return artifact
    try:
        config = _constant(artifact, "config")
        if config.get("type") != "grouped-bar":
            return artifact
        config["themeMode"] = theme
        return _native_grouped_bar().render_svg_chart(config, "bar")
    except (ValueError, KeyError, TypeError):
        return artifact


def upgrade_generic_chart_typography(artifact: str) -> str:
    """Keep saved bar charts readable without changing their data or layout."""
    if 'data-cartesian-typography="3"' in artifact or 'class="chart-component"' not in artifact:
        return artifact
    try:
        chart_type = _constant(artifact, "config").get("type")
    except (ValueError, KeyError, TypeError):
        return artifact
    if chart_type not in {"bar", "grouped-bar"}:
        return artifact
    styles = '''<style data-cartesian-typography="3">
.axis-label,.x-label{font-size:13px!important}
.chart-tooltip{max-width:min(280px,calc(100vw - 24px))!important;padding:11px 14px!important;font-size:14px!important;line-height:1.55!important;row-gap:3px!important}
.chart-tooltip>strong{display:block;color:#d8d8d8;margin-bottom:4px;font-size:13px!important;font-weight:500;line-height:1.45!important}
.tooltip-row{min-height:26px!important;column-gap:16px!important}
.tooltip-label{gap:6px!important}
.tooltip-dot{width:8px!important;height:8px!important}
@media(max-width:680px){.axis-label,.x-label{font-size:12px!important}.chart-tooltip{max-width:260px!important;padding:9px 11px!important;font-size:12px!important}}
</style>'''
    return re.sub(r'</head\s*>', lambda _: styles + '</head>', artifact, count=1, flags=re.I)


@lru_cache(maxsize=1)
def _native_payout_ratio():
    script = Path(__file__).parent / "skills/business-chart-recall/scripts/payout_ratio.py"
    spec = importlib.util.spec_from_file_location("saved_payout_ratio", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@lru_cache(maxsize=4)
def _native_rating(name):
    script = Path(__file__).parent / ('skills/business-chart-recall/scripts/' + name + '.py')
    spec = importlib.util.spec_from_file_location('saved_' + name, script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def upgrade_heatmap_controls(artifact):
    """Refresh saved heatmap controls using only their embedded source payload."""
    if 'heatmap-settings-toggle' not in artifact or 'data-heatmap-menu="3"' in artifact:
        return artifact
    match = re.search(r'<script\b[^>]*\bid="component-data"[^>]*>(.*?)</script>', artifact, re.S)
    if not match:
        return artifact
    try:
        payload = json.loads(match[1])
        if payload.get('type') != 'market-heatmap':
            return artifact
        theme = re.search(r'<html\b[^>]*\bdata-theme="(light|dark)"', artifact)
        if theme:
            payload['theme'] = theme[1]
        return _native_rating('market_heatmap').render_html(payload)
    except (ValueError, KeyError, TypeError):
        return artifact


def upgrade_market_index_intraday(artifact):
    """Update saved intraday guides/tooltips without changing market observations."""
    if 'data-intraday-tooltip="2"' in artifact:
        return artifact
    match = re.search(r'<script\b[^>]*\bid="component-data"[^>]*>(.*?)</script>', artifact, re.S)
    if not match:
        return artifact
    try:
        payload = json.loads(match[1])
        if payload.get('type') != 'market-index-intraday':
            return artifact
        theme = re.search(r'<html\b[^>]*\bdata-theme="(light|dark)"', artifact)
        if theme:
            payload['theme'] = theme[1]
        return _native_rating('market_index_intraday').render_html(payload)
    except (ValueError, KeyError, TypeError):
        return artifact


def upgrade_market_breadth(artifact):
    """Refresh saved breadth geometry from its original counts, without fetching."""
    if 'data-breadth-layout="2"' in artifact and 'data-breadth-hover="off"' in artifact:
        return artifact
    match = re.search(r'<script\b[^>]*\bid="component-data"[^>]*>(.*?)</script>', artifact, re.S)
    if not match:
        return artifact
    try:
        payload = json.loads(match[1])
        if payload.get('type') != 'market-breadth':
            return artifact
        theme = re.search(r'<html\b[^>]*\bdata-theme="(light|dark)"', artifact)
        if theme:
            payload['theme'] = theme[1]
        return _native_rating('market_breadth').render_html(payload)
    except (ValueError, KeyError, TypeError):
        return artifact


def upgrade_legacy_ratings(artifact, theme):
    if 'id="radar"' not in artifact or 'data-rating-layout="2"' in artifact:
        return artifact
    try:
        payload = _constant(artifact, 'payload')
        name = {'fundamental-investment-rating':'fundamental_investment_rating', 'investment-rating':'investment_rating'}.get(payload.get('type'))
        if not name:
            return artifact
        payload['theme'] = theme
        title = re.search(r'const modelTitle\s*=\s*', artifact)
        if title:
            payload['customTitle'] = json.JSONDecoder().raw_decode(artifact[title.end():])[0]
        return _native_rating(name).render_document(payload)
    except (ValueError,KeyError,TypeError):
        return artifact


def upgrade_legacy_revenue_player(artifact, theme):
    if 'id="timeline"' not in artifact or 'data-revenue-player="2"' in artifact:
        return artifact
    try:
        payload = _constant(artifact, 'payload')
        if payload.get('type') != 'revenue-expenses':
            return artifact
        payload['theme'] = theme
        title = re.search(r'const modelTitle\s*=\s*', artifact)
        if title:
            payload['customTitle'] = json.JSONDecoder().raw_decode(artifact[title.end():])[0]
        return _native_rating('revenue_expenses').render_document(payload)
    except (ValueError,KeyError,TypeError):
        return artifact


def upgrade_legacy_shareholder_returns(artifact, theme):
    if 'data-returns-layout="2"' in artifact or 'const payload = ' not in artifact:
        return artifact
    try:
        payload = _constant(artifact, 'payload')
        if payload.get('type') != 'shareholder-returns':
            return artifact
        payload['theme'] = theme
        title = re.search(r'const modelTitle\s*=\s*', artifact)
        if title:
            payload['customTitle'] = json.JSONDecoder().raw_decode(artifact[title.end():])[0]
        return _native_rating('shareholder_returns').render_document(payload)
    except (ValueError,KeyError,TypeError):
        return artifact


def upgrade_native_chart_scroll(artifact: str) -> str:
    """Let both wheel axes reach the page, including nested saved srcdoc charts."""
    if 'id="kline-canvas"' not in artifact and 'id=&quot;kline-canvas&quot;' not in artifact:
        return artifact
    old = 'if (!e.ctrlKey && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) return;'
    new = 'if (!e.ctrlKey) return;'
    import html
    return artifact.replace(old, new).replace(html.escape(old, quote=True), html.escape(new, quote=True))


def bind_pine_sources(artifact: str, outputs: Path) -> str:
    """Recover exact saved source by SHA-256, never infer code from plot values."""
    import hashlib
    import html
    hashes=set(re.findall(r'"codeHash"\s*:\s*"([a-f0-9]{64})"',html.unescape(artifact)))
    if not hashes:return artifact
    sources={}
    base=outputs.resolve()
    for path in outputs.rglob('*.pine'):
        try:
            if base not in path.resolve().parents or path.stat().st_size>48000:continue
            code=path.read_text(encoding='utf-8').strip()
            digest=hashlib.sha256(code.encode()).hexdigest()
            if digest in hashes:sources[digest]=code
        except (OSError,UnicodeError):continue
        if hashes<=sources.keys():break
    def document(text,depth=0):
        if depth>4:return text
        text=re.sub(r'(\bsrcdoc=")(.*?)(")',lambda m:m[1]+html.escape(document(html.unescape(m[2]),depth+1),quote=True)+m[3],text,flags=re.S)
        def config(match):
            try:
                value=json.loads(match[2])
                for overlay in value.get('pineOverlays',[]):
                    if overlay.get('codeHash') in sources:overlay['sourceCode']=sources[overlay['codeHash']]
                return match[1]+json.dumps(value,ensure_ascii=False).replace('<','\\u003c')+match[3]
            except (ValueError,TypeError,AttributeError):return match[0]
        return re.sub(r'(\bconst\s+config\s*=\s*)(\{[^\n]*\})(;)',config,text)
    return document(artifact)


def upgrade_native_kline_pine(artifact: str, depth: int = 0) -> str:
    """Add the native Pine bridge to old saved charts, without touching their data.

    Only known native Canvas hooks are patched, all-or-nothing. Third-party charts
    and unmatched versions stay intact. Nested srcdocs keep their original markup.
    """
    import html
    if depth>4:return artifact
    def child(match):
        original=html.unescape(match.group(2))
        updated=upgrade_native_kline_pine(original,depth+1)
        return match.group(0) if updated==original else match.group(1)+html.escape(updated,quote=True)+match.group(3)
    artifact=re.sub(r'(\bsrcdoc=")(.*?)(")',child,artifact,flags=re.S)
    if 'id="kline-canvas"' not in artifact:return artifact
    bridge=(Path(__file__).parent/'skills/business-chart-recall/assets/kline-pine-bridge.js').read_text(encoding='utf-8')
    def script(match):
        body=match.group(0)
        if "root.dataset.pineBridge = '1'" in body or "getElementById('kline-canvas')" not in body:return body
        hooks=[("  const tooltip = document.getElementById('kline-tooltip');", "  const tooltip = document.getElementById('kline-tooltip');\n"+bridge),
               ('    const priceScale = scale(minP, maxP, main.y + 16, main.h - 20);', '    pineRange(slice.start,slice.end).forEach(value=>{minP=Math.min(minP,value);maxP=Math.max(maxP,value);});\n    const priceScale = scale(minP, maxP, main.y + 16, main.h - 20);'),
               ('    lastRenderState = { layout, all, slice, main, xOf, priceScale };', '    lastRenderState = { layout, all, slice, main, xOf, priceScale };\n    drawPineLayer(lastRenderState);')]
        if not all(old in body for old,_ in hooks):return body
        for old,new in hooks:body=body.replace(old,new,1)
        return body
    return re.sub(r'<script\b[^>]*>.*?</script\s*>',script,artifact,flags=re.S|re.I)


def upgrade_legacy_mobile_charts(artifact: str, theme: str) -> str:
    """Repair saved native layouts without changing their data or custom marks."""
    if 'class="payout-ratio"' in artifact and 'data-mobile-layout="2"' not in artifact:
        import html
        payload = re.search(r'<script id="payload" type="application/json">(.*?)</script>', artifact, re.S)
        if payload:
            try:
                values = json.loads(html.unescape(payload.group(1)))
                values['theme'] = theme
                # Older case files applied the model title outside the payload.
                heading = re.search(r'<h1\b[^>]*>(.*?)</h1>', artifact, re.S)
                model_title = re.search(r'const modelTitle\s*=\s*', artifact)
                if model_title:
                    title = json.JSONDecoder().raw_decode(artifact[model_title.end():])[0]
                    if isinstance(title, str) and title:
                        values['customTitle'] = title
                if not values.get('customTitle') and heading:
                    values['customTitle'] = html.unescape(re.sub('<[^>]+>', '', heading.group(1)))
                artifact = _native_payout_ratio().render_html(values)
            except (ValueError, TypeError, KeyError):
                pass
    artifact = upgrade_native_chart_scroll(artifact)
    artifact = upgrade_legacy_ratings(artifact, theme)
    artifact = upgrade_legacy_revenue_player(artifact, theme)
    artifact = upgrade_legacy_shareholder_returns(artifact, theme)
    artifact = artifact.replace('const yLabelReserve = width < 700 ? 72 : 46;', 'const yLabelReserve = width < 700 ? 42 : 46;')
    # Saved charts may already have layout repairs but still contain an older touch runtime.
    if 'id="genericMobileTouch"' in artifact and 'const pointerY=originY+event.clientY-placement.top;' not in artifact:
        runtime = (Path(__file__).parent / 'skills/generic-chart/runtime/mobile_interactions.html').read_text()
        artifact = re.sub(r'<style id="genericMobileTouchStyle">.*?</script>', lambda _: runtime, artifact, count=1, flags=re.S)
    if 'data-mobile-chart-repair="3"' in artifact:
        return artifact
    styles = []
    script = ''
    if 'id="fullscreenBtn"' in artifact and ('journeySvg' in artifact or 'flowchart' in artifact.lower()):
        styles.append('@media(max-width:720px){#fullscreenBtn{display:none!important}#title{right:0!important;padding-right:0!important}}')
    if 'journeySvg' in artifact:
        # Mermaid includes empty space above its first section in its viewBox.
        script = """<script>(()=>{const crop=()=>{const s=document.querySelector('#diagram svg');if(!s)return;const b=s.getBBox(),v=s.viewBox.baseVal;if(b.height>0&&v.y<b.y-4){const bottom=Math.max(v.y+v.height,b.y+b.height+4);s.setAttribute('viewBox',`${v.x} ${b.y-4} ${v.width} ${bottom-b.y+4}`);if(typeof naturalHeight!=='undefined')naturalHeight=bottom-b.y+4;if(typeof fitDiagram==='function')fitDiagram();if(typeof postChartHeight==='function')postChartHeight();}};const d=document.getElementById('diagram');if(d)new MutationObserver(crop).observe(d,{childList:true});requestAnimationFrame(crop);})();</script>"""
    if 'class="treemap-component"' in artifact:
        styles.append('@media(max-width:720px){.treemap-component{width:100%!important;margin-inline:0!important;padding-inline:0!important}}')
    if 'dynamic-bubble-v' in artifact:
        styles.append('@media(max-width:720px){#title{white-space:normal!important;overflow-wrap:anywhere;overflow:visible!important;text-overflow:clip!important}#wrap{max-height:none!important}#header{right:0!important}}')
        artifact = artifact.replace('top:small?104:128,', 'top:Math.max(small?104:128, document.getElementById("header").offsetTop+document.getElementById("header").offsetHeight+34),')
        artifact = artifact.replace('trigger:"item",backgroundColor:', 'trigger:"item",confine:true,triggerOn:matchMedia("(pointer:coarse)").matches?"none":"mousemove|click",backgroundColor:')
        artifact = artifact.replace(' const l=layout();\n applyLayoutToDom();', ' const l=layout();\n if(compact()){document.getElementById("wrap").style.height=Math.max(320,l.top+l.bottom+160)+"px";chart.resize();}\n applyLayoutToDom();')
        # Keep the case-specific leader annotation inside the rightmost bubble.
        artifact = artifact.replace("formatter:'当月波动最高',position:'bottom',distance:42", "formatter:'当月波动最高',position:'left',distance:8")
        artifact = artifact.replace("symbol: 'circle', symbolSize: 0,", "symbol: 'circle', symbolSize: 0, silent:true,tooltip:{show:false},")
        runtime = (Path(__file__).parent / 'skills/generic-chart/runtime/mobile_interactions.html').read_text()
        artifact = re.sub(r'<style id="genericMobileTouchStyle">.*?</script>', lambda _: runtime, artifact, count=1, flags=re.S)
    if styles or script:
        artifact = artifact.replace('</head>', '<style data-mobile-chart-repair="3">'+''.join(styles)+'</style></head>', 1)
        artifact = artifact.replace('</body>', script+'</body>', 1)
    return artifact


def upgrade_widget_generic_chart(artifact: str) -> str:
    """Hide an artifact heading only when its Widget card already supplies one."""
    if 'data-widget-generic-title' in artifact:
        return artifact
    generic_markers = ('const GENERIC_SERIES_LABELS', 'class="chart-component"', 'class="waterfall-component"',
                       'class="treemap-component"', 'class="pie-component"', 'dynamic-bubble-v',
                       'journeySvg', 'flowchart', 'class="kline-component"', "class='kline-component'")
    if not any(marker in artifact for marker in generic_markers):
        return artifact
    chrome = '''<script data-widget-generic-title>const p=new URLSearchParams(location.search);if(p.get('canvas')==='1'||p.get('widgetTitle')==='0')document.documentElement.dataset.widgetTitle='hidden';</script>
<style data-widget-generic-title>
html[data-widget-title="hidden"] .chart-title,
html[data-widget-title="hidden"] .waterfall-title,
html[data-widget-title="hidden"] .treemap-title,
html[data-widget-title="hidden"] .pie-title,
html[data-widget-title="hidden"] #header>#title,
html[data-widget-title="hidden"] body>#title,
html[data-widget-title="hidden"] .kline-title>strong[data-business-title],
html[data-widget-title="hidden"] .kline-title>strong:first-child{display:none!important}
html[data-widget-title="hidden"] .kline-title{min-height:0!important}
.kline-component .period-tabs:has(>.period-button:only-child){display:none!important}
html[data-widget-title="hidden"] .kline-title:not(:has(.period-button:nth-child(2),.annotation-controls)){display:none!important}
html[data-widget-title="hidden"] .chart-component>.chart-stage{height:calc(100% - 8px)!important;margin-top:0!important}
</style>'''
    return re.sub(r'</head\s*>', lambda _: chrome+'</head>', artifact, count=1, flags=re.I) if re.search(r'</head\s*>', artifact, re.I) else artifact


def upgrade_widget_tradingview(artifact: str) -> str:
    """Use one dashboard card title and omit the host's extra TradingView chrome.

    Only canvas=1 activates this styling. Provider iframe branding is untouched.
    Applies to historical generated HTML as well as new direct embeds.
    """
    if 'id="tv-config"' not in artifact:
        return artifact
    # The classic profile embeds its text in a fixed scrolling viewport. The
    # official Web Component exposes its own content height to the host instead.
    def profile_component(match):
        try:
            spec = json.loads(match.group(2))
        except (ValueError, TypeError):
            return match.group(0)
        if spec.get('widget') != 'company-profile' or spec.get('format') == 'web-component':
            return match.group(0)
        config = spec.get('config') or {}
        spec.update(format='web-component', tag='tv-company-profile', module=True,
                    script='https://widgets.tradingview-widget.com/w/en/tv-company-profile.js')
        spec['config'] = {key: config[key] for key in ('symbol', 'colorTheme', 'locale') if key in config}
        return match.group(1)+json.dumps(spec, ensure_ascii=False).replace('<', '\\u003c')+match.group(3)
    artifact = re.sub(r'(<script\b[^>]*id=[\"\']tv-config[\"\'][^>]*>)(.*?)(</script>)', profile_component, artifact, count=1, flags=re.S)
    # Host-added footer text is redundant with attribution inside the official iframe.
    if 'data-tv-host-footer' not in artifact:
        footer = '<style data-tv-host-footer>main>footer,.tradingview-widget-copyright{display:none!important}.tradingview-widget-container__widget,.tradingview-widget-container>iframe{height:100%!important}</style>'
        artifact = re.sub(r'</head\s*>', lambda _: footer+'</head>', artifact, count=1, flags=re.I)
    if 'data-widget-tv-chrome' in artifact:
        return artifact
    chrome = '''<script data-widget-tv-chrome>if(new URLSearchParams(location.search).get('canvas')==='1')document.documentElement.dataset.widgetCanvas='true';</script>
<style data-widget-tv-chrome>
html[data-widget-canvas],html[data-widget-canvas] body{height:100%;overflow:hidden}
html[data-widget-canvas] main{height:100%;display:flex;flex-direction:column;border:0!important;border-radius:0!important;background:transparent!important}
html[data-widget-canvas] main>header,html[data-widget-canvas] main>footer,html[data-widget-canvas] .tradingview-widget-copyright{display:none!important}
html[data-widget-canvas] .stage{flex:1;min-height:0;height:auto!important}
html[data-widget-canvas] #mount,html[data-widget-canvas] .tradingview-widget-container,html[data-widget-canvas] .tradingview-widget-container__widget{height:100%!important}
</style>'''
    artifact = re.sub(r'</head\s*>', lambda _: chrome+'</head>', artifact, count=1, flags=re.I)
    # Configure the hosted chart before its own bootstrap parses tv-config.
    # Reports and canvas embeds share the same page-scroll-first behavior.
    wheel = '''<script data-widget-tv-wheel>(function(){const node=document.getElementById('tv-config');try{const spec=JSON.parse(node.textContent);if(spec.widget!=='advanced-chart')return;const blocked=['mouse_wheel_scroll','vert_touch_drag_scroll'],zoom=['mouse_wheel_scale','pinch_scale','axis_pressed_mouse_move_scale'];spec.config.disabled_features=[...new Set([...(spec.config.disabled_features||[]).filter(key=>!zoom.includes(key)&&key!=='handle_scale'),...blocked])];spec.config.enabled_features=[...new Set([...(spec.config.enabled_features||[]).filter(key=>!blocked.includes(key)),...zoom])];node.textContent=JSON.stringify(spec);}catch{}})();</script>'''
    artifact = re.sub(r'(<script\b[^>]*id=[\"\']tv-config[\"\'][^>]*>.*?</script>)', lambda match: match.group(1)+wheel, artifact, count=1, flags=re.S)
    # The overview widget defaults to blue-black; use the neutral surface of
    # adjacent hosted quote widgets, including after host theme switches.
    neutral = "if(new URLSearchParams(location.search).get('canvas')==='1'&&spec.widget==='symbol-overview')cfg.backgroundColor=theme==='dark'?'#202020':'#ffffff';\n"
    return artifact.replace("const wrapper=document.createElement('div');", neutral+"const wrapper=document.createElement('div');", 1)


def upgrade_smart_money(artifact):
    """Restyle saved Smart Money without fetching or changing trade rows."""
    if 'id="smart-money-meta"' not in artifact:
        return artifact
    native = _native_rating('smart_money')
    import html
    artifact = re.sub(r'<td class="symbol">([^<]*)</td>', lambda match: '<td class="symbol">' + native.stock_cell(html.unescape(match[1])) + '</td>', artifact)
    artifact = artifact.replace("querySelectorAll('.avatar img')", "querySelectorAll('.avatar img,.stock-avatar img')")
    styles = re.search(r'<style>(.*?)</style>', native.TEMPLATE, re.S).group(1)
    artifact = re.sub(r'<style>.*?</style>', lambda _: '<style>' + styles + '</style>', artifact, count=1, flags=re.S)
    artifact = re.sub(r'<p\b[^>]*class="forecast-note"[^>]*>.*?</p>', '', artifact, flags=re.S)
    if 'data-smart-money-embed-layout' not in artifact:
        boot = "<script data-smart-money-embed-layout>document.documentElement.toggleAttribute('data-smart-money-embedded',window.parent!==window);</script>"
        artifact = artifact.replace('</body>', boot + '</body>')
    return artifact


def upgrade_politician_performance(artifact, depth=0):
    """Upgrade saved native performance tooltips while keeping the saved observations."""
    if depth > 4: return artifact
    import html
    def child(match):
        original=html.unescape(match[2]);updated=upgrade_politician_performance(original,depth+1)
        return match[0] if updated==original else match[1]+html.escape(updated,quote=True)+match[3]
    artifact=re.sub(r'(\bsrcdoc=")(.*?)(")',child,artifact,flags=re.S)
    if '<main class="politician-performance"' not in artifact or 'data-politician-layout="3"' in artifact:return artifact
    try:
        declaration=re.search(r'\bconst\s+config\s*=\s*',artifact)
        if not declaration:return artifact
        config=json.JSONDecoder().raw_decode(artifact[declaration.end():])[0];points=config['periods']['ALL']['points']
        def content(pattern):
            found=re.search(pattern,artifact,re.S)
            return html.unescape(re.sub(r'<[^>]+>','',found[1])) if found else ''
        name=content(r'<h3 class="person-name">(.*?)</h3>')
        if not name or not points:return artifact
        subtitle=content(r'<div class="person-meta">(.*?)</div>').split(' / ',1)
        image=re.search(r'<span class="avatar">.*?<img[^>]*src="([^"]+)"',artifact,re.S)
        metadata=re.search(r'<script[^>]*id="politician-performance-meta"[^>]*>(.*?)</script>',artifact,re.S)
        payload=json.loads(metadata[1]) if metadata else {}
        theme=re.search(r'data-theme="(light|dark)"',artifact);language=re.search(r'<html[^>]*lang="([^"]+)"',artifact)
        payload.update(profile={'name':name,'party':subtitle[0],'state':subtitle[1] if len(subtitle)>1 else '', 'avatarUrl':html.unescape(image[1]) if image else ''},history=points,totalReturn=config['periods']['ALL']['returnPercent']/100,period=config['period'],theme=theme[1] if theme else 'light',language=language[1] if language else 'en',title=content(r'<h2[^>]*data-business-title[^>]*>(.*?)</h2>'))
        return _native_rating('politician_performance').render_html(payload)
    except (ValueError,KeyError,TypeError):return artifact


def upgrade_politician_holdings(artifact):
    """Unpage saved holdings from their existing rows; no market-data refetch."""
    if 'id="politician-holdings-meta"' not in artifact or 'data-holdings-layout="3"' in artifact:return artifact
    try:
        native=_native_rating('politician_holdings')
        declaration=re.search(r'\bconst\s+config\s*=\s*',artifact)
        if not declaration:return artifact
        config=json.JSONDecoder().raw_decode(artifact[declaration.end():])[0]
        metadata=re.search(r'<script[^>]*id="politician-holdings-meta"[^>]*>(.*?)</script>',artifact,re.S)
        meta=json.loads(metadata[1]) if metadata else {}
        locale=re.search(r'<html[^>]*lang="([^"]+)"',artifact)
        heading=native.holdings_heading(locale[1] if locale else 'en',meta.get('fetchedAt'))
        artifact=re.sub(r'<div class="profile-name">.*?</div><div class="profile-meta">.*?</div>',lambda _:heading,artifact,count=1,flags=re.S)
        artifact=re.sub(r'<nav class="pagination".*?</nav>','',artifact,flags=re.S)
        artifact=re.sub(r'<tr\b[^>]*data-row="[^"]+"[^>]*>',lambda m:re.sub(r'\s+hidden(?:="[^"]*")?','',m[0]),artifact)
        styles=re.search(r'<style>(.*?)</style>',native.TEMPLATE,re.S)[1]
        artifact=re.sub(r'<style>.*?</style>',lambda _:'<style>'+styles+'</style>',artifact,count=1,flags=re.S)
        boot=native.TEMPLATE.split('</script><script>',1)[1].split('</script>',1)[0]
        boot=boot.replace('__CONFIG__',json.dumps(config,ensure_ascii=False).replace('<',chr(92)+'u003c'))
        artifact=re.sub(r'<script>\s*const config=.*?</script>',lambda _:'<script>'+boot+'</script>',artifact,count=1,flags=re.S)
        return artifact.replace('<main class="politician-holdings">','<main class="politician-holdings" data-holdings-layout="3">',1).replace('data-holdings-layout="2"','data-holdings-layout="3"')
    except (ValueError,KeyError,TypeError,IndexError):return artifact


def upgrade_compact_generic_pie(artifact, depth=0):
    """Trim saved generic pie whitespace/badges without touching values or geometry."""
    if depth>4:return artifact
    import html
    def child(match):
        original=html.unescape(match[2]);updated=upgrade_compact_generic_pie(original,depth+1)
        return match[0] if updated==original else match[1]+html.escape(updated,quote=True)+match[3]
    artifact=re.sub(r'(\bsrcdoc=")(.*?)(")',child,artifact,flags=re.S)
    if 'class="pie-component' not in artifact or 'data-generic-pie-compact="1"' in artifact or 'data-renderer-version="pie-spacing-v5"' in artifact:return artifact
    artifact=re.sub(r'<div\b[^>]*class="pie-badge"[^>]*>.*?</div>','',artifact,flags=re.S)
    style='<style data-generic-pie-compact="1">.pie-component{min-height:0!important;height:auto!important;padding-bottom:0!important;margin-bottom:0!important}.pie-header{grid-template-columns:minmax(0,1fr)!important}.pie-badge{display:none!important}</style>'
    return re.sub(r'</head\s*>',lambda _:style+'</head>',artifact,count=1,flags=re.I)


def upgrade_stock_heatmap(artifact):
    """Refresh saved Stock Heatmap layout without refetching financial data."""
    if 'stock-heatmap' not in artifact or 'data-stock-heatmap-runtime="5"' in artifact:
        return artifact
    match = re.search(r'<script\b[^>]*\bid="component-data"[^>]*>(.*?)</script>', artifact, re.S)
    if not match:
        return artifact
    try:
        payload = json.loads(match[1])
        if payload.get('type') != 'stock-heatmap':
            return artifact
        return _native_rating('stock_heatmap').render_html(payload)
    except (ValueError, KeyError, TypeError):
        return artifact
