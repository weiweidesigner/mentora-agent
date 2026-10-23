"""Dashboard capabilities. Render-only tools are dialogue capabilities, not library tiles."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERIC_TITLES = {
    'bar_chart': '柱状图', 'line_chart': '折线图', 'group_line': '分组折线图',
    'grouped_bar': '分组柱状图', 'bar_line': '柱折组合图', 'pie': '饼图',
    'treemap': '矩形树图', 'waterfall': '瀑布图', 'double_ring_pie': '双环饼图',
    'dynamic_line': '动态折线图', 'dynamic_bar': '动态柱状图',
    'dynamic_bubble': '动态气泡图', 'mind_map': '脑图', 'flowchart': '流程图',
    'journey': '旅程图', 'timeline': '时间线',
}


def generation_catalogue() -> list[dict]:
    """The planner can compose a data source with these existing renderers.

    Only static, registered component metadata crosses this boundary: no model
    supplied scripts, paths, HTML or endpoint URLs are accepted as capabilities.
    """
    library = json.loads((ROOT / 'app/static/widget-catalog.json').read_text())
    hidden = []
    for stem, title in GENERIC_TITLES.items():
        schema = ROOT / f'app/skills/generic-chart/schemas/{stem}.schema.json'
        script = ROOT / f'app/skills/generic-chart/scripts/{stem}.py'
        if not schema.is_file() or not script.is_file():
            continue
        contract = json.loads(schema.read_text())
        hidden.append({
            'id': 'generic-' + stem, 'title': title, 'provider': 'generic',
            'skill': 'generic-chart', 'script': stem + '.py',
            'description': contract.get('purpose', title), 'inputMode': 'data',
            'requiresDataSource': True, 'libraryVisible': False,
            'width': 6, 'height': 18,
        })
    hidden.append({
        'id': 'streamviz', 'title': 'StreamVis 可视化组件', 'provider': 'streamviz',
        'skill': 'streamviz', 'script': 'render_streamviz.py', 'inputMode': 'data',
        'description': '基于已核实的数据生成交互式可视化，可用于比较、时间线、流程或自定义组件。',
        'requiresDataSource': True, 'libraryVisible': False, 'width': 12, 'height': 22,
    })
    return library + hidden
