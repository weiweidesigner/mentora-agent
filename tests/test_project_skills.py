from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_every_canonical_skill_has_a_codex_discovery_bridge() -> None:
    canonical = {path.parent.name for path in (PROJECT_ROOT / "app" / "skills").glob("*/SKILL.md")}
    bridges = {path.parent.name for path in (PROJECT_ROOT / ".agents" / "skills").glob("*/SKILL.md")}

    assert bridges == canonical


def test_skill_bridges_have_frontmatter_and_canonical_target() -> None:
    for path in (PROJECT_ROOT / ".agents" / "skills").glob("*/SKILL.md"):
        text = path.read_text(encoding="utf-8")
        assert text.startswith("---\nname:")
        assert "\ndescription:" in text.split("---", 2)[1]
        canonical = PROJECT_ROOT / "app" / "skills" / path.parent.name / "SKILL.md"
        assert canonical.is_file()
        assert f"app/skills/{path.parent.name}/SKILL.md" in text
