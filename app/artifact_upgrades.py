"""Upgrade saved presentation layouts from their embedded data, without refetching."""
from __future__ import annotations

import importlib.util
import json
import re
from functools import lru_cache
from html.parser import HTMLParser
from pathlib import Path


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


def upgrade_legacy_intraday(artifact: str, theme: str) -> str:
    """Re-render legacy multi-intraday srcdocs with exactly their saved OHLCV rows."""
    if 'class="multi-intraday"' not in artifact or 'data-intraday-layout="2"' in artifact:
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
        for child in parser.frames:
            config = _constant(child, "config")
            if config.get("annotations"):
                return artifact
            rows = _constant(child, "dataByPeriod")["1m"]
            if not isinstance(rows, list) or not rows:
                return artifact
            zone = str(config.get("timeZone") or zone)
            dates = {native._row_date(row.get("time"), zone) for row in rows}
            if len(dates) != 1 or not all(dates):
                return artifact
            indicators = config.get("subIndicators") or []
            name = re.sub(r"\s*·\s*\d{4}-\d{2}-\d{2}.*$", "", str(config.get("name") or config["code"]))
            cards.append({"symbol": config["code"], "name": name, "date": dates.pop(),
                          "data": rows, "source": (config.get("sources") or {}).get("1m", "saved"),
                          "reliableVolume": "VOL" in indicators})
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
