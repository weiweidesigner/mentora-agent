from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).parents[1]
GUARD = ROOT / "scripts" / "codex-command-guard"


def _guard_env() -> dict[str, str]:
    env = os.environ.copy()
    env["MENTORA_REAL_PYTHON"] = sys.executable
    env["MENTORA_CODEX_GUARD_BIN"] = str(GUARD)
    env["BASH_ENV"] = str(GUARD / "shell-env.sh")
    env["PATH"] = f"{GUARD}{os.pathsep}{env.get('PATH', '')}"
    return env


def test_codex_shell_guard_allows_local_calculation() -> None:
    result = subprocess.run(
        ["/bin/bash", "-lc", "python3 -c 'print(17*19)'"],
        cwd=ROOT,
        env=_guard_env(),
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0
    assert result.stdout.strip() == "323"


def test_codex_shell_guard_blocks_direct_network_commands() -> None:
    for command in (
        "curl https://example.com",
        "wget https://example.com",
        "python3 -c 'import urllib.request; urllib.request.urlopen(\"https://example.com\")'",
    ):
        result = subprocess.run(
            ["/bin/bash", "-lc", command],
            cwd=ROOT,
            env=_guard_env(),
            text=True,
            capture_output=True,
            check=False,
        )
        assert result.returncode == 64
        assert "disabled for Mentora reasoning" in result.stderr
