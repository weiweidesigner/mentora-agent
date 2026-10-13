import json
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values
import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_visual_skills_are_pinned_repository_links():
    for name in ['chart-markup', 'vision-chart-analyst', 'flux-image']:
        manifest = json.loads((ROOT / f'{name}.lock.json').read_text())
        checkout = ROOT / manifest['checkout']
        link = ROOT / f'app/skills/{name}'
        assert link.is_symlink()
        assert link.resolve() == (checkout / f'app/skills/{name}').resolve()
        assert subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], text=True).strip() == manifest['revision']
        subprocess.run([sys.executable, str(ROOT / f'scripts/sync_{name.replace("-", "_")}.py'), '--check'], check=True, capture_output=True)


def test_repository_links_preserve_skill_classification():
    from app import main
    for script, skill in [('chart_markup.py', 'chart-markup'), ('vision_chart_analyst.py', 'vision-chart-analyst'), ('generate_image.py', 'flux-image')]:
        path = main.SKILLS_DIR / skill / 'scripts' / script
        assert path.is_file()
        assert main.relative_skill_file(path) == f'{skill}/scripts/{script}'
    assert main.skill_name_for_script_filename('vision_chart_analyst.py') == 'vision-chart-analyst'


def test_vision_secret_remains_local_and_not_in_dependency_files():
    config = dotenv_values(ROOT / '.env')
    key = config.get('VISION_API_KEY')
    if not key:
        pytest.skip("Local credentials are intentionally absent from public checkouts")
    assert '.env' in (ROOT / '.gitignore').read_text().splitlines()
    checkout = ROOT / '.dependencies/vision-chart-analyst'
    files = subprocess.check_output(['git', '-C', str(checkout), 'ls-files'], text=True).splitlines()
    assert '.env' not in files
    assert '.env.example' in files
    contains_secret = any(key in (checkout / name).read_text() for name in files)
    assert not contains_secret
    assert not dotenv_values(checkout / '.env.example').get('VISION_API_KEY')
