"""Check host routing contracts without initializing unrelated portfolio services."""
import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_table_registered_as_non_coordinate_visualizer():
    tree = ast.parse((ROOT / 'app/main.py').read_text())
    names = {'AIME_GENERIC_CHART_SCRIPTS', 'LOGIC_CHART_SCRIPTS', 'GENERIC_CHART_PAYLOAD_SCRIPTS', 'COORDINATE_GENERIC_CHART_SCRIPTS'}
    nodes = [n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets)]
    nodes += [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'search_chart_payload_is_valid']
    namespace = {'Any': object}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'chart_contract', 'exec'), namespace)
    assert 'data_table.py' in namespace['GENERIC_CHART_PAYLOAD_SCRIPTS']
    assert 'data_table.py' not in namespace['COORDINATE_GENERIC_CHART_SCRIPTS']
    valid = namespace['search_chart_payload_is_valid']
    assert valid({'columns': [{'field': 'name'}], 'dataSource': {'path': 'outputs/data/records.json'}}, 'data_table.py')
    assert valid({'columns': [{'field': 'name'}], 'rows': []}, 'data_table.py')
    assert not valid({'columns': []}, 'data_table.py')
    registry = json.loads((ROOT / 'app/module_registry.json').read_text())
    assert len([item for item in registry if item['script'] == 'data_table.py']) == 1
