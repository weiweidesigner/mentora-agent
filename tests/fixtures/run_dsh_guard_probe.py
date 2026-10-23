"""Exercise real runtime dispatch without a model call (isolated temp files)."""
import json
import os
from pathlib import Path
import shutil
import tempfile
import time

from deepseek_harness import DeepSeekHarness

root = Path(__file__).resolve().parents[2]
probe = Path(tempfile.mkdtemp(prefix="mentora-global-low-probe-"))
guard_source = Path(os.getenv("MENTORA_GUARD_SOURCE", str(root / "app")))
for source in (guard_source / "dsh_lightweight_guard.cjs", guard_source / "dsh_lightweight.cordis.yml",
               Path(__file__).with_name("dsh_guard_probe.cjs"), Path(__file__).with_name("dsh_guard_probe.cordis.yml")):
    shutil.copyfile(source, probe / source.name)
for name, code in {
    "screener/scripts/run.py": "import sys\nfrom pathlib import Path\np=Path(__file__).parents[2]/'failure-bodies.txt';p.write_text(str(int(p.read_text())+1) if p.exists() else '1')\nprint('expected probe failure')\nsys.exit(1)\n",
    "generic-chart/scripts/render.py": "import argparse\nfrom pathlib import Path\np=argparse.ArgumentParser();p.add_argument('--output');a=p.parse_args();Path(a.output).write_text('<html>verified fixture</html>');f=Path(a.output).with_name('render-bodies.txt');f.write_text(str(int(f.read_text())+1) if f.exists() else '1');print('rendered')\n",
}.items():
    target = probe / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(code)
with DeepSeekHarness(cwd=str(root), runtime_cwd=str(probe), dsh_home=str(probe / "dsh"),
                     patches=(str(probe / "dsh_lightweight.cordis.yml"), str(probe / "dsh_guard_probe.cordis.yml")),
                     env={"MENTORA_PROJECT_ROOT": str(root), "MENTORA_GUARD_PROBE_DIR": str(probe)}) as harness:
    deadline = time.monotonic() + 40
    result_file = probe / "result.json"
    while not result_file.exists() and time.monotonic() < deadline:
        time.sleep(0.1)
    assert result_file.exists(), f"No runtime result: {probe}"
    result = json.loads(result_file.read_text())
    assert "error" not in result, result
    assert result["readBodies"] == 1, result
    assert (probe / "failure-bodies.txt").read_text() == "3", result
    assert (probe / "render-bodies.txt").read_text() == "2", result
    assert all(artifact["exists"] for artifact in result["artifacts"]), result
    assert "MENTORA_LIGHTWEIGHT:" not in json.dumps(result), result
    print(json.dumps({"ok": True, "readBodies": 1, "failedToolBodies": 3,
                      "renderBodies": 2, "path": str(probe)}))
