"""Host integration for the pinned private component repository; no renderer code."""
from __future__ import annotations

import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=8)
def repository_components(project_root: Path) -> tuple[dict, ...]:
    root = project_root.resolve()
    manifest_path = root / "business-charts.lock.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    revision = manifest["revision"]
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise RuntimeError("Business charts require a full Git commit in business-charts.lock.json")
    checkout = root / manifest["checkout"]
    if not (checkout / ".git").exists():
        raise RuntimeError("Business charts are not installed; run python scripts/sync_business_charts.py")
    result = subprocess.run(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True,
                            capture_output=True, check=True)
    if result.stdout.strip() != revision:
        raise RuntimeError("Business chart dependency does not match its pinned commit")
    dirty = subprocess.run(["git", "-C", str(checkout), "diff", "--quiet", "HEAD", "--"], capture_output=True)
    if dirty.returncode:
        raise RuntimeError("Business chart dependency contains local changes; update the repository instead")
    for destination, source in manifest["links"].items():
        link = root / destination
        expected = checkout / source
        if not link.is_symlink() or not expected.exists() or link.resolve() != expected.resolve():
            raise RuntimeError(f"Business chart dependency link is missing: {destination}; run scripts/sync_business_charts.py")
    components = json.loads((checkout / "components.json").read_text(encoding="utf-8"))
    if not isinstance(components, list) or not components:
        raise RuntimeError("The component repository must provide a non-empty components.json")
    return tuple(components)


def load_registry_data(registry_path: Path) -> list[dict]:
    """Resolve host catalog references against the repository's own metadata."""
    raw = json.loads(registry_path.read_text(encoding="utf-8"))
    root = registry_path.parent.parent
    if not (root / "business-charts.lock.json").is_file():
        return raw  # Standalone/test projects can supply their own local catalog.
    canonical = {item["script"]: item for item in repository_components(root)}
    result = []
    for item in raw:
        if not isinstance(item, dict):
            result.append(item)
            continue
        if item.get("source") == "business-charts-repository":
            if item.get("script") not in canonical:
                raise RuntimeError(f"Component is absent from the pinned repository: {item.get('script')}")
            result.append(dict(canonical[item["script"]]))
        else:
            result.append(item)
    return result
