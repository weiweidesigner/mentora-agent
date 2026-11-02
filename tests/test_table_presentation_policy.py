"""Exercise the actual table renderer through the typed execution/contract boundary."""
import json
from pathlib import Path

from app import skill_runner
from app.capability_index import CapabilityIndex
from app.reasoning_frameworks import LocalAgentFrameworks

ROOT = Path(__file__).resolve().parents[1]


def project(tmp_path):
    skill = tmp_path / 'app/skills/generic-chart'
    skill.parent.mkdir(parents=True)
    skill.symlink_to((ROOT / 'app/skills/generic-chart').resolve(), target_is_directory=True)
    metadata = next(item for item in json.loads((ROOT / 'app/module_registry.json').read_text()) if item['script'] == 'data_table.py')
    (tmp_path / 'app/module_registry.json').write_text(json.dumps([metadata]))
    data = tmp_path / 'outputs/data'
    data.mkdir(parents=True)
    (data / 'source.json').write_text(json.dumps({'records': [{'name': f'row {i}', 'value': i} for i in range(101)]}))
    (data / 'config.json').write_text(json.dumps({'dataSource': {'path': 'outputs/data/source.json', 'recordsPath': ['records']},
        'columns': [{'field': 'name', 'label': '名称'}, {'field': 'value', 'label': '数值', 'type': 'number'}]}))
    return data


def test_verified_native_table_receipt_declares_exact_scope_and_nonduplication(tmp_path, capsys):
    project(tmp_path)
    assert skill_runner.main(['execute', '--script', 'data_table.py', '--', '--payload', 'outputs/data/config.json', '--output', 'outputs/generated/table.html'], project_root=tmp_path) == 0
    receipt = json.loads(capsys.readouterr().out)
    presentation = receipt['presentation']
    assert receipt['ok'] and receipt['artifacts'][0]['verified']
    assert presentation['kind'] == 'table' and presentation['status'] == 'rendered'
    assert presentation['coveredFields'] == ['name', 'value']
    assert presentation['scope']['rowCount'] == 101
    assert presentation['scope']['sourceCoverage'] == 'all-input-records-only'
    assert presentation['scope']['fileSource']['recordCount'] == 101
    assert presentation['scope']['fileSource']['sha256'] == receipt['observation']['fileSource']['sha256']
    assert Path(presentation['artifact']).is_file()
    assert 'Do not repeat' in presentation['markdownPolicy']
    assert 'explicit user request' in presentation['markdownPolicy']
    # A contract or a failed renderer cannot assert that a table has been displayed.
    assert skill_runner.main(['execute', '--script', 'data_table.py', '--', '--data-json', '{"rows":[{}],"columns":[{"field":"absent"}]}', '--output', 'outputs/generated/failed.html'], project_root=tmp_path) != 0
    failure = json.loads(capsys.readouterr().out)
    assert failure['ok'] is False and 'presentation' not in failure


def test_contract_exposes_table_file_mapping_and_policy_inline(tmp_path, capsys):
    project(tmp_path)
    assert skill_runner.main(['contract', '--script', 'data_table.py'], project_root=tmp_path) == 0
    receipt = json.loads(capsys.readouterr().out)
    assert receipt['presentation']['kind'] == 'table'
    assert receipt['agentContract']['payloadShape']['dataSource']['recordsPath'] == ['records']
    assert 'status' not in receipt['presentation']


def test_natural_table_query_recalls_table_as_a_candidate():
    index = CapabilityIndex(ROOT)
    for question in ['今天涨得比较好的ETF有哪些？用表格展示给我', '把筛选结果用表格呈现', 'Show these records as a table']:
        shortlist = index.shortlist(question)
        assert 'data_table.py' in {item['script'] for item in shortlist.modules}
        assert '候选集，不是写死路由' in shortlist.render()
        assert 'Markdown/纯文本' in shortlist.render()


def test_shared_prompt_keeps_markdown_override_and_scope_limits(tmp_path):
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / 'generated')
    try:
        for framework in ['deepseek', 'codex']:
            question = '请直接输出 Markdown 表格，不使用交互组件'
            prompt = client._prompt(framework, question, [], [])
            assert question in prompt
            assert '用户明确要求 Markdown/纯文本表时遵循用户' in prompt
            assert '少量文字概念、方案对照可用 Markdown' in prompt
            assert '完整输入文件不等于上游分页已取全' in prompt
            assert '待生成或失败回执不算展示成功' in prompt
    finally:
        client.close()
