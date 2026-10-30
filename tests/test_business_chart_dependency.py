from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path

import pytest

from app.business_chart_dependency import load_registry_data, repository_components

ROOT = Path(__file__).resolve().parents[1]


def sync_module():
    spec = importlib.util.spec_from_file_location('sync_components', ROOT / 'scripts/sync_business_charts.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_installed_implementation_is_a_git_dependency_not_local_copies():
    manifest = json.loads((ROOT / 'business-charts.lock.json').read_text())
    checkout = ROOT / manifest['checkout']
    assert subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], text=True).strip() == manifest['revision']
    for destination, source in manifest['links'].items():
        link = ROOT / destination
        assert link.is_symlink()
        assert link.resolve() == (checkout / source).resolve()
    assert sync_module().sync(ROOT, check=True)['recoveryCopy'] is None


def test_host_catalog_has_references_and_repository_supplies_descriptions():
    raw = json.loads((ROOT / 'app/module_registry.json').read_text())
    refs = [row for row in raw if row.get('source') == 'business-charts-repository']
    assert len(refs) == len(repository_components(ROOT))
    assert {row['script'] for row in refs} == {row['script'] for row in repository_components(ROOT)}
    assert all('description' not in row for row in refs)
    loaded = load_registry_data(ROOT / 'app/module_registry.json')
    assert all(row.get('description') for row in loaded)
    canonical = {row['script']: row for row in repository_components(ROOT)}
    assert next(row for row in loaded if row['script'] == 'income_statement.py') == canonical['income_statement.py']
    from app.skill_runner import _registered_script
    _, metadata = _registered_script('kline.py', ROOT)
    assert metadata == canonical['kline.py']
    assert '861077' in metadata['description']


def make_repository(path):
    path.mkdir()
    subprocess.run(['git', '-C', str(path), 'init', '--quiet'], check=True)
    source = path / 'components/example'
    source.mkdir(parents=True)
    (source / 'renderer.py').write_text('value = 1\n')
    subprocess.run(['git', '-C', str(path), 'add', '.'], check=True)
    subprocess.run(['git', '-C', str(path), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture'], check=True)
    return subprocess.check_output(['git', '-C', str(path), 'rev-parse', 'HEAD'], text=True).strip()


def test_installer_requires_explicit_migration_and_fetches_only_locked_commit(tmp_path):
    origin = tmp_path / 'origin'
    revision = make_repository(origin)
    project = tmp_path / 'project'
    old = project / 'app/example'
    old.mkdir(parents=True)
    (old / 'renderer.py').write_text('old local implementation\n')
    manifest = {'repository': str(origin), 'revision': revision, 'checkout': '.dependencies/components', 'links': {'app/example': 'components/example'}}
    (project / 'business-charts.lock.json').write_text(json.dumps(manifest))
    module = sync_module()
    with pytest.raises(RuntimeError, match='Local implementation remains'):
        module.sync(project)
    result = module.sync(project, migrate=True)
    assert old.is_symlink()
    assert (old / 'renderer.py').read_text() == 'value = 1\n'
    backup = Path(result['recoveryCopy'])
    assert (backup / 'app/example/renderer.py').read_text() == 'old local implementation\n'
    assert module.sync(project, check=True)['revision'] == revision
    (old / 'renderer.py').write_text('local override\n')
    with pytest.raises(RuntimeError, match='local edits'):
        module.sync(project, check=True)
    import shutil
    shutil.rmtree(backup)


def test_installer_rejects_branch_pins_and_outside_project_links(tmp_path):
    module = sync_module()
    (tmp_path / 'business-charts.lock.json').write_text(json.dumps({'repository': 'unused', 'revision': 'main'}))
    with pytest.raises(ValueError, match='full Git commit'):
        module.sync(tmp_path)
    with pytest.raises(ValueError, match='inside the project'):
        module.safe_path(tmp_path, '../outside')


def test_skill_classification_uses_host_aliases_for_repository_links():
    import app.main as main
    assert main.skill_name_for_script_filename('valuation.py') == 'business-chart-recall'
    assert main.skill_name_for_script_filename('pie.py') == 'generic-chart'
    assert main.relative_skill_file(main.SKILLS_DIR / 'business-chart-recall/schemas/kline.schema.json') == 'business-chart-recall/schemas/kline.schema.json'


def test_explore_components_are_independent_registered_business_scripts():
    from app.skill_runner import _registered_script
    loaded = {item['name']: item for item in load_registry_data(ROOT / 'app/module_registry.json')}
    for name in ['market_heatmap', 'etf_holding_distribution', 'market_index_intraday', 'market_breadth', 'market_trackers', 'stock_heatmap', 'etf_heatmap', 'sector_performance', 'market_momentum', 'fear_greed']:
        item = loaded[name]
        script, _ = _registered_script(item['script'], ROOT)
        assert script.is_file()
        assert script.parent.parent.name == 'business-chart-recall'
        assert (script.parent.parent / 'schemas' / (name + '.schema.json')).is_file()
        assert item['description']
