from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_generic_components_are_only_repository_references():
    manifest = json.loads((ROOT / "data-vis-charts.lock.json").read_text())
    checkout = ROOT / manifest["checkout"]
    link = ROOT / "app/skills/generic-chart"
    assert link.is_symlink()
    assert link.resolve() == (checkout / "app/skills/generic-chart").resolve()
    assert subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True).strip() == manifest["revision"]
    assert not any(path.is_symlink() for path in (link / "scripts").glob("*.py"))
    business = json.loads((ROOT / "business-charts.lock.json").read_text())
    assert not any(name.startswith("app/skills/generic-chart") for name in business["links"])


def test_linked_generic_skill_still_routes_and_reads_selected_schema():
    from app import main

    assert main.skill_name_for_script("bar_chart.py") == "generic-chart"
    assert main.skill_name_for_script_filename("dynamic_line.py") == "generic-chart"
    assert main.script_tool_category("bar_chart.py") == "generic_chart"
    assert main.skill_category_for_script_path(main.SKILLS_DIR / "generic-chart/scripts/bar_chart.py") == "generic_chart"
    plan = [{"skill": "generic-chart", "read_next": ["generic-chart/schemas/bar_chart.schema.json"]}]
    context = main.planning_schema_context(["generic-chart"], plan)
    assert "## generic-chart/schemas/bar_chart.schema.json" in context
    assert "semanticChannels" in context
    assert plan[0]["read_next"] == ["generic-chart/schemas/bar_chart.schema.json"]
