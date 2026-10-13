import importlib.util
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERIC_DIR = ROOT / "app/skills/generic-chart"


def load_main_module():
    spec = importlib.util.spec_from_file_location("aime_main_component_migration", ROOT / "app/main.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_generic_chart_owns_migrated_renderers_and_schemas() -> None:
    for stem in ("treemap", "waterfall", "double_ring_pie"):
        assert (GENERIC_DIR / "scripts" / f"{stem}.py").is_file()
        assert (GENERIC_DIR / "schemas" / f"{stem}.schema.json").is_file()


def test_runtime_no_longer_scans_component_library_or_exposes_ui_components() -> None:
    module = load_main_module()
    script_dirs = {path.resolve() for path in module.SKILL_SCRIPT_DIRS}
    registered = set(module.ALLOWED_COMPONENTS_BY_FILE)

    assert all("component-library" not in str(path) for path in script_dirs)
    assert {"treemap.py", "waterfall.py", "double_ring_pie.py"} <= registered
    assert {"tab.py", "segmented_tab.py", "field.py"}.isdisjoint(registered)
    for script in ("treemap.py", "waterfall.py", "double_ring_pie.py"):
        assert module.script_path_for_filename(script).parent == GENERIC_DIR / "scripts"


def test_migrated_renderers_publish_valid_schema() -> None:
    for stem in ("treemap", "waterfall", "double_ring_pie"):
        result = subprocess.run(
            [sys.executable, str(GENERIC_DIR / "scripts" / f"{stem}.py"), "--schema"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        runtime_schema = json.loads(result.stdout)
        file_schema = json.loads((GENERIC_DIR / "schemas" / f"{stem}.schema.json").read_text(encoding="utf-8"))
        assert runtime_schema["type"] == file_schema["type"]


def test_waterfall_accepts_schema_documented_top_level_items(tmp_path: Path) -> None:
    payload_path = tmp_path / "waterfall.json"
    output_path = tmp_path / "waterfall.html"
    payload_path.write_text(
        json.dumps(
            {
                "type": "waterfall",
                "title": "利润拆解",
                "items": [
                    {"label": "收入", "value": 100, "type": "total"},
                    {"label": "成本", "value": -40, "type": "delta"},
                    {"label": "利润", "value": 60, "type": "total"},
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    result = subprocess.run(
        [sys.executable, str(GENERIC_DIR / "scripts/waterfall.py"), "--payload", str(payload_path), "--output", str(output_path)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    html = output_path.read_text(encoding="utf-8")
    assert "利润拆解" in html
    assert "收入" in html
