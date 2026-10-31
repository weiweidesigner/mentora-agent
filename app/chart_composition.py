"""Compose verified chart artifacts without generating their numeric geometry."""
from __future__ import annotations
import html
import json
from pathlib import Path
import re
from app.chart_data_contract import SCRIPTS, digest


def load_charts(paths, generated):
    if paths is None:
        return []
    if not isinstance(paths, list) or not all(isinstance(p, str) for p in paths):
        raise ValueError('chart_artifacts must be an array of generated chart HTML paths')
    generated = Path(generated).resolve()
    charts = []
    for index, raw in enumerate(paths):
        path = Path(raw).expanduser()
        if not path.is_absolute():
            path = generated.parent.parent / path
        path = path.resolve()
        if not path.is_relative_to(generated) or path.suffix.lower() != '.html':
            raise ValueError('Embedded chart must be under outputs/generated/')
        proof = json.loads(path.with_suffix('.chart.json').read_text())
        if proof.get('ok') is not True or proof.get('renderer') not in SCRIPTS or proof.get('htmlSha256') != digest(path):
            raise ValueError('Chart integrity manifest missing, failed, or stale; render through skill_runner first')
        charts.append({'id': f'chart-{index+1}', 'path': path, 'proof': proof})
    return charts


def chart_brief(charts):
    if not charts:
        return ''
    return '\n\nVerified numeric chart artifacts are supplied by the host. Arrange them, never redraw their curves/bars or transcribe their data. Include each exact empty placeholder once: ' + ' '.join(
        '<div data-chart-id="'+chart['id']+'"></div>' for chart in charts)


def chart_frame(chart):
    from app.artifact_upgrades import upgrade_compact_generic_line
    code = upgrade_compact_generic_line(chart['path'].read_text())
    title = html.escape(chart['id'], quote=True)
    return '<iframe data-verified-chart="'+title+'" title="'+title+'" style="display:block;width:100%;height:360px;border:0;background:transparent" srcdoc="'+html.escape(code, quote=True)+'"></iframe>'


RESIZE = '''<script data-verified-chart-layout>(()=>{
 const frames=[...document.querySelectorAll('iframe[data-verified-chart]')];
 const theme=()=>frames.forEach(frame=>{try{frame.contentDocument.documentElement.dataset.theme=document.documentElement.dataset.theme||'light';}catch{}});
 const size=frame=>{try{const doc=frame.contentDocument,root=doc.querySelector('.group-line-component');const measured=Number(root?.dataset.embedHeight);const h=measured>80?measured:Math.ceil((doc.querySelector('.chart-component,.group-line-component,.pie-component')||doc.body).getBoundingClientRect().height);if(h>80&&Math.abs(frame.getBoundingClientRect().height-h)>2)frame.style.height=h+'px';}catch{}};
 frames.forEach(frame=>frame.addEventListener('load',()=>{theme();size(frame);if(frame.contentDocument?.body)new ResizeObserver(()=>size(frame)).observe(frame.contentDocument.body);},{once:true}));
 window.addEventListener('message',event=>{const frame=frames.find(f=>f.contentWindow===event.source),h=Number(event.data?.height);if(frame&&event.data?.type==='analysis-planner-chart-height'&&h>80&&Number.isFinite(h)&&Math.abs(frame.getBoundingClientRect().height-h)>2)frame.style.height=Math.ceil(h)+'px';});
 new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
})();</script>'''


def compose(code, charts):
    if not charts:
        return code
    for chart in charts:
        pattern = r'(<div\b[^>]*\bdata-chart-id=["\']'+re.escape(chart['id'])+r'["\'][^>]*>)\s*</div>'
        if len(re.findall(pattern, code)) != 1:
            raise ValueError('StreamViz must include exactly one empty slot for '+chart['id'])
        code = re.sub(pattern, lambda m: m[1]+chart_frame(chart)+'</div>', code, count=1)
    if re.search(r'data-chart-id=["\'](?!'+ '|'.join(re.escape(c['id'])+r'["\']' for c in charts)+r')', code):
        raise ValueError('Unknown chart slot')
    return code + RESIZE
