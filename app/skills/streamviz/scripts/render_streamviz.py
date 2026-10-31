#!/usr/bin/env python3
"""Render an evidence-backed StreamViz payload into standalone, safe HTML."""

from __future__ import annotations

import argparse
import html
import json
import math
import re
from pathlib import Path
from typing import Any


VALID_TONES = {"success", "warning", "danger", "neutral"}
VALID_LAYOUTS = {"dashboard", "comparison", "timeline", "brief", "flow"}


def text(value: Any) -> str:
    return html.escape(str('' if value is None else value).strip())


def market_attr(value: Any) -> str:
    return f' data-financial-market="{value}"' if value in ('CN','HK','US') else ''


def value_html(item: dict[str, Any], market: Any = None, *, declared_change: bool = False) -> str:
    """Bind verified direction, not generic success or every positive metric."""
    value=item.get('value');direction=''
    raw=str(value if value is not None else '').strip().replace('−','-').replace('％','%')
    change=item.get('change')
    financial=declared_change or bool(market_attr(item.get('financialMarket') or market)) or item.get('direction') in ('up','down','flat')
    if financial:
        if isinstance(change,(float,int)) and not isinstance(change,bool) and math.isfinite(change):
            direction='up' if change>0 else 'down' if change<0 else 'flat'
        elif re.fullmatch(r'[+\-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?',raw) and (declared_change or raw[:1] in '+-' or raw.rstrip('%').replace('.','').strip('0')==''):
            number=float(raw.rstrip('%').replace(',',''))
            direction='up' if number>0 else 'down' if number<0 else 'flat'
        elif item.get('direction') in ('up','down','flat'):direction=item['direction']
    attrs=market_attr(item.get('financialMarket'))
    if direction:attrs+=f' data-sv-direction="{direction}"'
    return f'<span{attrs}>{text(value)}</span>' if attrs else text(value)


def records(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def render_blocks(blocks: list[dict[str, Any]], market: Any = None) -> str:
    return "".join(iter_blocks(blocks,market))


def iter_blocks(blocks: list[dict[str, Any]], market: Any = None):
    """Render optional evidence blocks; no block has any implied data."""
    for block in blocks:
        kind = str(block.get("type") or "").lower()
        title = text(block.get("title"))
        block_market=block.get('financialMarket') or market
        attrs=market_attr(block_market)
        if kind == "chart":
            from app.chart_composition import load_charts, chart_frame
            charts = load_charts([block.get('artifact')], Path(__file__).resolve().parents[4]/'outputs/generated')
            yield f'<section class="sv-section"><h2>{title or "图表"}</h2>'+chart_frame(charts[0])+'</section>'
        elif kind == "table":
            columns = [str(column) for column in block.get("columns", []) if text(column)]
            financial_columns=block.get('financialColumns') if isinstance(block.get('financialColumns'),list) else []
            rows = block.get("rows") if isinstance(block.get("rows"), list) else []
            if not columns or not rows:
                continue
            body = "".join(
                "<tr>" + "".join('<td>'+ (value_html({'value':row.get(column)},block_market,declared_change=True) if column in financial_columns else text(row.get(column)))+'</td>' for column in columns) + "</tr>"
                for row in rows if isinstance(row, dict)
            )
            if body:
                yield (
                    f'<section class="sv-section sv-table"{attrs}><h2>{title or "明细"}</h2><div class="sv-table-wrap"><table><thead><tr>'
                    + "".join(f"<th>{text(column)}</th>" for column in columns)
                    + f"</tr></thead><tbody>{body}</tbody></table></div></section>"
                )
        elif kind == "rankings":
            items = records(block.get("items"))
            cards = "".join(
                f'<article class="sv-rank"><span>{index + 1:02d}</span><div><b>{text(item.get("label"))}</b><small>{text(item.get("detail"))}</small></div><strong>{value_html(item,block_market)}</strong></article>'
                for index, item in enumerate(items) if text(item.get("label"))
            )
            if cards:
                yield (f'<section class="sv-section"{attrs}><h2>{title or "排序"}</h2><div class="sv-rankings">{cards}</div></section>')
        elif kind == "timeline":
            items = records(block.get("items"))
            events = "".join(
                f'<article class="sv-event"><time>{text(item.get("time"))}</time><div><b>{text(item.get("label"))}</b><p>{text(item.get("detail"))}</p></div></article>'
                for item in items if text(item.get("label"))
            )
            if events:
                yield (f'<section class="sv-section"><h2>{title or "事件时间线"}</h2><div class="sv-timeline">{events}</div></section>')
        elif kind == "narrative":
            paragraphs = [text(item) for item in block.get("paragraphs", []) if text(item)]
            if paragraphs:
                yield (f'<section class="sv-section sv-narrative"><h2>{title or "分析"}</h2>' + "".join(f"<p>{paragraph}</p>" for paragraph in paragraphs) + "</section>")


def render(payload: dict[str, Any]) -> str:
    return "".join(render_parts(payload))


def render_parts(payload: dict[str, Any]):
    theme_css = (Path(__file__).resolve().parents[1] / "assets/artifact-theme.css").read_text(encoding="utf-8")
    geometry_js = (Path(__file__).resolve().parents[1] / 'assets/chart-geometry.js').read_text(encoding='utf-8')
    financial_js = (Path(__file__).resolve().parents[1] / 'assets/financial-semantics.js').read_text(encoding='utf-8')
    theme_style = f'<style data-streamviz-theme="dual">{theme_css}</style><script data-sv-chart-geometry>{geometry_js}</script><script data-sv-financial-semantics>{financial_js}</script>'
    market=payload.get('financialMarket');market_attrs=market_attr(market)
    artifact_html = str(payload.get("html") or "").strip()
    if artifact_html:
        from app.chart_composition import load_charts, compose
        charts = load_charts(payload.get('chart_artifacts'), Path(__file__).resolve().parents[4]/'outputs/generated')
        artifact_html = compose(artifact_html, charts)
        # This is intentionally an escape hatch for evidence-backed custom
        # visual language (SVG, Canvas, bespoke layouts).  StreamViz keeps it
        # sandboxed in its iframe; the skill prompt remains responsible for
        # ensuring that labels and values came from upstream evidence.
        yield (
            '<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<style>html,body{margin:0;background:transparent}*{box-sizing:border-box}</style>'
            f'{theme_style}</head><body><main data-aime-streamviz-root="true"{market_attrs}>'
        )
        yield artifact_html
        yield '</main></body></html>'
        return
    layout = str(payload.get("layout") or "dashboard").lower()
    layout = layout if layout in VALID_LAYOUTS else "dashboard"
    title = text(payload.get("title")) or "数据看板"
    eyebrow = text(payload.get("eyebrow"))
    summary = text(payload.get("summary"))
    note = text(payload.get("note"))
    statuses = records(payload.get("status"))
    metrics = records(payload.get("metrics"))
    flow = payload.get("flow") if isinstance(payload.get("flow"), dict) else {}
    nodes = records(flow.get("nodes"))
    node_ids = {str(node.get("id")) for node in nodes if node.get("id")}
    edges = [edge for edge in records(flow.get("edges")) if str(edge.get("from")) in node_ids and str(edge.get("to")) in node_ids]

    status_html = "".join(
        f'<span class="sv-chip sv-chip--{tone}">{text(item.get("label"))}</span>'
        for item in statuses
        if text(item.get("label"))
        for tone in [str(item.get("tone") or "neutral").lower() if str(item.get("tone") or "neutral").lower() in VALID_TONES else "neutral"]
    )
    metrics_html = "".join(
        '<article class="sv-metric">'
        f'<p>{text(item.get("label"))}</p><strong>{value_html(item,market)}</strong>'
        f'<small>{text(item.get("detail"))}</small></article>'
        for item in metrics if text(item.get("label")) and text(item.get("value"))
    )
    node_map = {str(node.get("id")): node for node in nodes if node.get("id")}
    flow_html = ""
    if nodes:
        relation_html = "".join(
            '<div class="sv-relation">'
            f'<div class="sv-node"><b>{text(node_map[str(edge.get("from"))].get("label"))}</b><span>{text(node_map[str(edge.get("from"))].get("detail"))}</span></div>'
            f'<span class="sv-arrow" aria-label="{text(edge.get("label")) or "关系"}">→</span>'
            f'<div class="sv-node"><b>{text(node_map[str(edge.get("to"))].get("label"))}</b><span>{text(node_map[str(edge.get("to"))].get("detail"))}</span></div>'
            f'<em>{text(edge.get("label"))}</em></div>'
            for edge in edges
        )
        unlinked = [node for node in nodes if str(node.get("id")) not in {str(edge.get("from")) for edge in edges} | {str(edge.get("to")) for edge in edges}]
        relation_html += "".join(
            f'<div class="sv-node sv-node--standalone"><b>{text(node.get("label"))}</b><span>{text(node.get("detail"))}</span></div>'
            for node in unlinked
        )
        flow_html = f'<section class="sv-section"><h2>{text(flow.get("title")) or "关系与驱动"}</h2><div class="sv-flow">{relation_html}</div></section>'

    yield f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{{box-sizing:border-box}}body{{margin:0;background:transparent;color:var(--sv-text-primary);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}}.sv{{padding:4px 0;max-width:100%}}.sv-head{{display:flex;gap:18px;align-items:start;justify-content:space-between;padding-bottom:0;border-bottom:0}}.sv-kicker,.sv-metric p,.sv-node span,.sv-metric small,.sv-note{{color:var(--sv-text-secondary);font-size:13px;margin:0}}h1{{margin:4px 0 0;font-size:25px;line-height:1.25}}.sv-summary{{margin:8px 0 0;line-height:1.65;color:var(--sv-text-secondary)}}.sv-chips{{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}}.sv-chip{{padding:6px 10px;border:1px solid;border-radius:999px;font-size:13px;white-space:nowrap}}.sv-chip--success{{color:var(--sv-text-success,var(--sv-status-success));background:var(--sv-bg-success);border-color:var(--sv-border-success,var(--sv-border-subtle))}}.sv-chip--warning{{color:var(--sv-text-warning,var(--sv-warning));background:var(--sv-bg-warning);border-color:var(--sv-border-warning,var(--sv-border-subtle))}}.sv-chip--danger{{color:var(--sv-text-danger,var(--sv-status-danger));background:var(--sv-bg-danger);border-color:var(--sv-border-danger,var(--sv-border-subtle))}}.sv-chip--neutral{{color:var(--sv-text-secondary);background:var(--sv-surface-secondary);border-color:var(--sv-border-subtle)}}.sv-metrics{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;padding:16px 0;border-bottom:0}}.sv--brief .sv-metrics{{grid-template-columns:1fr}}.sv--comparison .sv-metrics{{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}}.sv-metric{{min-width:0;padding:12px;border:0;border-radius:0;background:transparent}}.sv-metric strong{{display:block;margin:8px 0 5px;font-size:27px;line-height:1.1}}.sv-section{{padding-top:20px}}h2{{font-size:16px;margin:0 0 8px;color:var(--sv-text-secondary)}}.sv-flow{{display:grid;gap:12px}}.sv-relation{{display:grid;grid-template-columns:minmax(140px,1fr) 40px minmax(140px,1fr);align-items:center;gap:10px;position:relative}}.sv-node{{min-width:0;padding:15px 16px;border:1px solid var(--sv-border-subtle);border-radius:14px;background:var(--sv-surface-primary)}}.sv-node b{{display:block;font-size:16px;color:var(--sv-text-primary);overflow-wrap:anywhere}}.sv-node span{{display:block;margin-top:6px;line-height:1.45;overflow-wrap:anywhere}}.sv-arrow{{color:var(--sv-text-secondary);font-size:28px;line-height:1;text-align:center}}.sv-relation em{{grid-column:2;font-size:11px;font-style:normal;text-align:center;color:var(--sv-text-muted);white-space:nowrap}}.sv-node--standalone{{display:inline-block;margin-right:12px;vertical-align:top;min-width:180px}}.sv-table-wrap{{overflow:auto;border:1px solid var(--sv-border-subtle);border-radius:14px}}table{{border-collapse:collapse;width:100%;min-width:480px;font-size:14px}}th,td{{padding:12px 14px;text-align:left;border-bottom:1px solid var(--sv-border-subtle)}}th{{background:var(--sv-surface-primary);color:var(--sv-text-secondary);font-weight:600}}tr:last-child td{{border-bottom:0}}.sv-rankings{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}}.sv-rank{{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:10px;align-items:center;padding:13px 14px;border:1px solid var(--sv-border-subtle);border-radius:12px}}.sv-rank>span{{color:var(--sv-text-muted);font-size:12px}}.sv-rank b,.sv-event b{{display:block;color:var(--sv-text-primary)}}.sv-rank small,.sv-event p{{display:block;margin:4px 0 0;color:var(--sv-text-secondary);font-size:13px}}.sv-rank strong{{color:var(--sv-text-primary)}}.sv-timeline{{border-left:1px solid var(--sv-border-subtle);margin-left:7px;padding-left:20px;display:grid;gap:18px}}.sv-event{{position:relative;display:grid;grid-template-columns:90px minmax(0,1fr);gap:12px}}.sv-event:before{{content:"";position:absolute;left:-20.5px;transform:translateX(-50%);top:5px;width:10px;height:10px;border-radius:50%;background:var(--sv-chart-series-1)}}.sv-event time{{color:var(--sv-text-secondary);font-size:13px}}.sv-narrative{{max-width:780px}}.sv-narrative p{{line-height:1.75;color:var(--sv-text-secondary)}}.sv-note{{margin:18px 0 0;padding-top:14px;border-top:1px solid var(--sv-border-subtle);line-height:1.6}}@media(max-width:580px){{.sv-head{{display:block}}.sv-chips{{justify-content:flex-start;margin-top:12px}}.sv-relation{{grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr)}}.sv-arrow{{font-size:22px}}.sv-event{{grid-template-columns:1fr}}}}
</style>{theme_style}</head><body><main class="sv sv--{layout}" data-aime-streamviz-root="true"{market_attrs}><header class="sv-head"><div>{f'<p class="sv-kicker">{eyebrow}</p>' if eyebrow else ''}<h1>{title}</h1>{f'<p class="sv-summary">{summary}</p>' if summary else ''}</div>{f'<div class="sv-chips">{status_html}</div>' if status_html else ''}</header>{f'<section class="sv-metrics">{metrics_html}</section>' if metrics_html else ''}'''
    if flow_html:yield flow_html
    yield from iter_blocks(records(payload.get('blocks')),market)
    if note:yield f'<p class="sv-note">{note}</p>'
    if any(block.get('type') == 'chart' for block in records(payload.get('blocks'))):
        from app.chart_composition import RESIZE
        yield RESIZE
    yield '</main></body></html>'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        parser.error(f"cannot read valid JSON input: {exc}")
    if not isinstance(payload, dict):
        parser.error("input JSON must be an object")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    import sys
    sys.path.insert(0,str(Path(__file__).resolve().parents[4]))
    from app.streamviz_files import HtmlRenderStream
    stream=HtmlRenderStream(args.output,str(payload.get('title') or '数据看板'))
    temporary=args.output.with_name(args.output.name+'.'+stream.id.split(':')[-1]+'.tmp')
    size=0;failed=True
    try:
        with temporary.open('w',encoding='utf-8') as handle:
            for part in render_parts(payload):
                handle.write(part);handle.flush();size+=len(part.encode())
                stream.append(part)
        temporary.replace(args.output)
        stream.finish();failed=False
    finally:
        stream.close(failed=failed)
        temporary.unlink(missing_ok=True)
    print(json.dumps({"ok": True, "tool": "streamviz", "output": str(args.output.resolve()), "bytes": size}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
