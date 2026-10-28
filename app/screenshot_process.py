"""Shared runtime for server-side image exports."""
from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

from fastapi import HTTPException

logger = logging.getLogger(__name__)
EXPORT_ERROR = "图片生成失败，请稍后重试；分享链接仍可使用。"


def chromium_launch_options() -> dict:
    # Playwright otherwise redirects Chromium shared memory to /tmp. On small
    # server disks this crashes the compositor despite ample /dev/shm capacity.
    return {"headless": True, "ignore_default_args": ["--disable-dev-shm-usage"]}


def run_screenshot(script: str, *, root: Path, output: Path) -> None:
    try:
        result = subprocess.run([sys.executable, "-c", script], cwd=str(root),
                                capture_output=True, text=True, timeout=90)
    except subprocess.TimeoutExpired as exc:
        logger.warning("Image export timed out: %s", output.name)
        raise HTTPException(status_code=503, detail=EXPORT_ERROR) from exc
    if result.returncode != 0 or not output.is_file() or output.stat().st_size == 0:
        logger.error("Image export failed (%s): %s", output.name,
                     (result.stderr or result.stdout or "missing screenshot")[-12000:])
        raise HTTPException(status_code=503, detail=EXPORT_ERROR)
