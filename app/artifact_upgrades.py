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
    if 'class="multi-intraday"' not in artifact or 'data-mobile-columns=' in artifact:
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
        payload = {"type": "multi-intraday", "title": "".join(parser.title), "cards": cards,
                   "props": {"symbols": list(dict.fromkeys(card["symbol"] for card in cards)),
                             "timezone": zone, "theme": theme, "language": parser.language,
                             "columns": int(columns.group(1)) if columns else min(3, len(cards)),
                             "mobileColumns": min(2, len(cards)), "subIndicators": indicators}}
        config = native._validate_payload(payload)
        return native.render_document(config["title"], native.build_cards(config), config)
    except (ValueError, KeyError, TypeError, IndexError):
        # Non-native/mixed/annotated layouts stay intact rather than lose data.
        return artifact
