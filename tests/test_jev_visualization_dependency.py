import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_visual_router_is_a_pinned_repository_reference():
    manifest = json.loads((ROOT / "jev_vis_router.lock.json").read_text())
    checkout = ROOT / manifest["checkout"]
    link = ROOT / "app/jev_visualization_router.py"
    assert link.is_symlink()
    assert link.resolve() == (checkout / "app/jev_visualization_router.py").resolve()
    assert subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True).strip() == manifest["revision"]
    subprocess.run([sys.executable, str(ROOT / "scripts/sync_jev_vis_router.py"), "--check"], check=True, capture_output=True)


def test_unused_model_router_is_removed_and_visual_imports_share_classes():
    from app import main, reasoning_frameworks
    from app.jev_visualization_router import JevVisualizationRouter

    assert not (ROOT / "app/jev_router.py").exists()
    assert not (ROOT / "tests/test_jev_router.py").exists()
    assert main.JevVisualizationRouter is JevVisualizationRouter
    assert reasoning_frameworks.JevVisualizationRouter is JevVisualizationRouter
