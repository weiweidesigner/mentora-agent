#!/usr/bin/env python3
"""Install/check the pinned private business-chart repository and its native links."""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(directory: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(directory), *args], text=True, capture_output=True,
                            check=True, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
    return result.stdout.strip()


def safe_path(root: Path, relative: str) -> Path:
    value = Path(relative)
    if value.is_absolute() or ".." in value.parts:
        raise ValueError(f"Dependency paths must stay inside the project: {relative}")
    return root / value


def sync(root: Path, *, migrate: bool = False, check: bool = False, update: bool = False,
         manifest_name: str = "business-charts.lock.json") -> dict:
    manifest = json.loads(safe_path(root, manifest_name).read_text())
    revision = manifest["revision"]
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("A full Git commit is required; branch names cannot pin this dependency")
    checkout = safe_path(root, manifest["checkout"])
    if not checkout.exists():
        if check:
            raise RuntimeError("Run python scripts/sync_business_charts.py first")
        checkout.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix=".business-charts-", dir=checkout.parent))
        try:
            git(staging, "init", "--quiet")
            git(staging, "remote", "add", "origin", manifest["repository"])
            git(staging, "fetch", "--quiet", "--depth=1", "origin", revision)
            git(staging, "checkout", "--quiet", "--detach", "FETCH_HEAD")
            if git(staging, "rev-parse", "HEAD") != revision:
                raise RuntimeError("Fetched Git commit does not match the lock file")
            staging.rename(checkout)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    if git(checkout, "remote", "get-url", "origin") != manifest["repository"]:
        raise RuntimeError("Dependency remote does not match the lock file")
    if git(checkout, "status", "--porcelain", "--untracked-files=no"):
        raise RuntimeError("Repository dependency has local edits; commit upstream rather than overriding installed code")
    if git(checkout, "rev-parse", "HEAD") != revision:
        if not update or check:
            raise RuntimeError("Lock changed; run python scripts/sync_business_charts.py --update and restart the app")
        git(checkout, "fetch", "--quiet", "--depth=1", "origin", revision)
        git(checkout, "checkout", "--quiet", "--detach", "FETCH_HEAD")
        if git(checkout, "rev-parse", "HEAD") != revision:
            raise RuntimeError("Updated checkout does not match its pinned commit")
    links = [(safe_path(root, dst), safe_path(checkout, src)) for dst, src in manifest["links"].items()]
    for destination, source in links:
        if not source.exists():
            raise RuntimeError(f"Missing repository component: {source.relative_to(checkout)}")
        if destination.is_symlink():
            if destination.resolve() != source.resolve():
                raise RuntimeError(f"Unexpected dependency link: {destination.relative_to(root)}")
        elif destination.exists() and not migrate:
            raise RuntimeError(f"Local implementation remains at {destination.relative_to(root)}; use --migrate once")
        elif check:
            raise RuntimeError(f"Dependency link is not installed: {destination.relative_to(root)}")
    backup = None
    if not check:
        # Preserve a recovery copy during the one-time migration; delete it only after host verification.
        for destination, source in links:
            if destination.is_symlink():
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                if backup is None:
                    backup = Path(tempfile.mkdtemp(prefix="us-trading-charts-migration-"))
                old = backup / destination.relative_to(root)
                old.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(destination), str(old))
            temporary = destination.with_name("." + destination.name + ".repository-link")
            temporary.symlink_to(os.path.relpath(source, destination.parent), target_is_directory=source.is_dir())
            temporary.replace(destination)
    return {"repository": manifest["repository"], "revision": revision, "checkout": str(checkout),
            "links": len(links), "recoveryCopy": str(backup) if backup else None}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--migrate", action="store_true", help="Replace existing local implementations once")
    parser.add_argument("--check", action="store_true", help="Validate the installed commit and links offline")
    parser.add_argument("--update", action="store_true", help="Install a newly pinned commit in a clean dependency checkout")
    args = parser.parse_args()
    try:
        print(json.dumps(sync(ROOT, migrate=args.migrate, check=args.check, update=args.update), ensure_ascii=False))
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f"business-chart dependency: {exc}\n")


if __name__ == "__main__":
    main()
