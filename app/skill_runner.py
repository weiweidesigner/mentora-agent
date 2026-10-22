"""Small, typed entry point for pre-resolved Mentora skill capabilities."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


PROJECT_ROOT = Path(__file__).resolve().parents[1]
KLINE_PERIODS = {"1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w", "1M", "3M"}
LANGUAGES = {"zh-CN", "zh-Hant", "en"}
THEMES = {"light", "dark"}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Execute one pre-resolved Mentora skill capability.")
    subparsers = parser.add_subparsers(dest="action", required=True)
    render = subparsers.add_parser("render", help="Fetch data and render a user-facing artifact.")
    render.add_argument("--skill", choices=["business-chart-recall"], required=True)
    render.add_argument("--component", choices=["kline"], required=True)
    render.add_argument("--symbol", required=True)
    render.add_argument("--period", choices=sorted(KLINE_PERIODS), default="1d")
    render.add_argument("--market", default="auto")
    render.add_argument("--language", choices=sorted(LANGUAGES), default="zh-CN")
    render.add_argument("--theme", choices=sorted(THEMES), default="light")
    render.add_argument("--output", required=True)
    execute = subparsers.add_parser(
        "execute",
        help="Run one allowlisted module-registry capability and return a normalized receipt.",
    )
    execute.add_argument("--script", required=True, help="Registered script basename.")
    execute.add_argument("--timeout", type=float, default=300.0)
    execute.add_argument("args", nargs=argparse.REMAINDER, help="Component arguments after --.")
    contract = subparsers.add_parser(
        "contract",
        help="Return the CLI and schema contract for one allowlisted capability.",
    )
    contract.add_argument("--script", required=True, help="Registered script basename.")
    contract.add_argument("--schema", action="store_true", help="Compatibility flag; schema is always included.")
    return parser


def _registry(project_root: Path) -> list[dict]:
    path = project_root / "app/module_registry.json"
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("module registry is unavailable") from exc
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _registered_script(script_name: str, project_root: Path) -> tuple[Path, dict]:
    # Basenames only: execution is restricted to the checked-in registry and
    # cannot be redirected to an arbitrary filesystem path.
    if Path(script_name).name != script_name or not script_name.endswith(".py"):
        raise ValueError("script must be a registered basename")
    matches = [item for item in _registry(project_root) if Path(str(item.get("script") or "")).name == script_name]
    if not matches:
        raise ValueError(f"script is not allowlisted: {script_name}")
    preferred_skills = {
        "ainvest_news_search.py": "internal-search",
        "ainvest_video_search.py": "video-search",
        "external_info_search.py": "external-search",
        "url_content_reader.py": "external-search",
    }
    candidates = list((project_root / "app/skills").glob(f"*/scripts/{script_name}"))
    preferred = preferred_skills.get(script_name)
    if preferred:
        candidates.sort(key=lambda path: path.parent.parent.name != preferred)
    for candidate in candidates:
        if candidate.is_file():
            return candidate, matches[0]
    raise FileNotFoundError(f"registered capability is unavailable: {script_name}")


def _artifact_paths(arguments: list[str], project_root: Path) -> list[Path]:
    paths: list[Path] = []
    for index, value in enumerate(arguments[:-1]):
        if value not in {"--output", "--payload-output"}:
            continue
        path = Path(arguments[index + 1]).expanduser()
        if not path.is_absolute():
            path = project_root / path
        paths.append(path.resolve())
    return paths


def _normalize_component_args(arguments: list[str], script: Path, project_root: Path) -> list[str]:
    """Repair a common file-vs-inline JSON mismatch without rerunning tools.

    Generic chart CLIs use ``--payload`` for a JSON file and ``--data-json``
    for inline JSON.  Agents correctly follow the project rule to pass large
    data by file, but can pick the inline flag from argparse help.  Normalize
    that representation at the typed boundary rather than forcing a failed
    render, source-code inspection, and retry.
    """
    normalized = list(arguments)
    if script.parent.parent.name != "generic-chart":
        return normalized
    for index, value in enumerate(normalized[:-1]):
        if value != "--data-json":
            continue
        candidate = Path(normalized[index + 1]).expanduser()
        if not candidate.is_absolute():
            candidate = project_root / candidate
        if candidate.is_file():
            normalized[index] = "--payload"
    return normalized


def _execute(args: argparse.Namespace, project_root: Path) -> int:
    started = time.monotonic()
    try:
        script, metadata = _registered_script(args.script, project_root)
        component_args = list(args.args)
        if component_args[:1] == ["--"]:
            component_args = component_args[1:]
        component_args = _normalize_component_args(component_args, script, project_root)
        artifacts = _artifact_paths(component_args, project_root)
        output_root = (project_root / "outputs").resolve()
        for artifact in artifacts:
            if artifact != output_root and output_root not in artifact.parents:
                raise ValueError("artifact paths must stay under outputs/")
            artifact.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            [sys.executable, str(script), *component_args],
            cwd=project_root,
            capture_output=True,
            text=True,
            check=False,
            timeout=max(1.0, min(float(args.timeout), 900.0)),
        )
        missing = [str(path) for path in artifacts if not path.is_file() or path.stat().st_size <= 0]
        stdout = (result.stdout or "").strip()
        try:
            observation = json.loads(stdout) if stdout else None
        except json.JSONDecodeError:
            observation = stdout[-12000:]
        ok = result.returncode == 0 and not missing
        receipt = {
            "ok": ok,
            "capability": str(metadata.get("name") or Path(args.script).stem),
            "script": args.script,
            "durationMs": round((time.monotonic() - started) * 1000),
            "exitCode": result.returncode,
            "observation": observation,
            "artifacts": [
                {"path": str(path), "bytes": path.stat().st_size, "verified": True}
                for path in artifacts if path.is_file() and path.stat().st_size > 0
            ],
        }
        if result.stderr.strip():
            receipt["stderr"] = result.stderr.strip()[-2000:]
        if missing:
            receipt["missingArtifacts"] = missing
        print(json.dumps(receipt, ensure_ascii=False))
        return 0 if ok else (result.returncode or 1)
    except subprocess.TimeoutExpired:
        print(json.dumps({
            "ok": False,
            "script": args.script,
            "durationMs": round((time.monotonic() - started) * 1000),
            "error": "capability execution timed out",
        }, ensure_ascii=False))
        return 124
    except (OSError, ValueError) as exc:
        print(json.dumps({"ok": False, "script": args.script, "error": str(exc)}, ensure_ascii=False))
        return 2


def _contract(args: argparse.Namespace, project_root: Path) -> int:
    try:
        script, metadata = _registered_script(args.script, project_root)
        result = subprocess.run(
            [sys.executable, str(script), "--help"],
            cwd=project_root,
            capture_output=True,
            text=True,
            check=False,
            timeout=20,
        )
        skill = script.parent.parent.name
        skill_path = script.parent.parent / "SKILL.md"
        try:
            skill_instructions = skill_path.read_text(encoding="utf-8")
        except OSError:
            skill_instructions = ""
        schema_path = project_root / "app/skills" / skill / "schemas" / f"{script.stem}.schema.json"
        schema: Any = None
        if schema_path.is_file():
            try:
                schema = json.loads(schema_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                schema = None
        cli_help = (result.stdout or result.stderr or "").strip()[-12000:]
        conventions = []
        if skill == "generic-chart" and "--payload" in cli_help and "--data-json" in cli_help:
            conventions.append("JSON 文件路径传 --payload；--data-json 只传内联 JSON，不传文件路径。")
        print(json.dumps({
            "ok": result.returncode == 0,
            "capability": str(metadata.get("name") or script.stem),
            "script": args.script,
            "skill": skill,
            "skillPath": str(skill_path.resolve()) if skill_path.is_file() else None,
            "skillInstructions": skill_instructions,
            "cliHelp": cli_help,
            "argumentConventions": conventions,
            "schemaPath": str(schema_path.resolve()) if schema_path.is_file() else None,
            "schema": schema,
        }, ensure_ascii=False))
        return 0 if result.returncode == 0 else result.returncode
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({"ok": False, "script": args.script, "error": str(exc)}, ensure_ascii=False))
        return 2


def _component_command(args: argparse.Namespace, project_root: Path) -> list[str]:
    if args.skill != "business-chart-recall" or args.component != "kline":
        raise ValueError("unsupported skill capability")
    script = project_root / "app/skills/business-chart-recall/scripts/kline.py"
    if not script.is_file():
        raise FileNotFoundError("business-chart-recall kline component is unavailable")
    return [
        sys.executable,
        str(script),
        "--symbol", args.symbol,
        "--period", args.period,
        "--market", args.market,
        "--language", args.language,
        "--theme", args.theme,
        "--output", str(Path(args.output).expanduser()),
    ]


def _const_json(document: str, name: str):
    marker = f"const {name} = "
    start = document.find(marker)
    if start < 0:
        return None
    try:
        return json.JSONDecoder().raw_decode(document[start + len(marker):])[0]
    except (json.JSONDecodeError, TypeError):
        return None


def _timestamp(value) -> dt.datetime | None:
    try:
        number = float(value)
        if number > 10_000_000_000:
            number /= 1000
        return dt.datetime.fromtimestamp(number, dt.UTC)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _rounded(value):
    return round(float(value), 4) if value is not None else None


def _kline_summary(document: str, period: str) -> dict:
    data_by_period = _const_json(document, "dataByPeriod")
    config = _const_json(document, "config")
    if not isinstance(data_by_period, dict):
        return {"available": False}
    rows = data_by_period.get(period)
    if not isinstance(rows, list):
        return {"available": False}
    rows = [row for row in rows if isinstance(row, dict) and row.get("close") is not None]
    if not rows:
        return {"available": False}
    closes = [float(row["close"]) for row in rows]
    latest = rows[-1]
    eastern = ZoneInfo("America/New_York")
    latest_time = _timestamp(latest.get("time"))
    session_rows = rows
    if latest_time:
        latest_date = latest_time.astimezone(eastern).date()
        filtered = [
            row for row in rows
            if (stamp := _timestamp(row.get("time"))) and stamp.astimezone(eastern).date() == latest_date
        ]
        if filtered:
            session_rows = filtered
    previous_close = None
    daily = data_by_period.get("1d")
    if isinstance(daily, list) and len(daily) >= 2:
        previous_close = daily[-2].get("close")
    if previous_close is None and len(session_rows) < len(rows):
        previous_close = rows[-len(session_rows)-1].get("close")
    volumes = [float(row.get("volume") or 0) for row in session_rows]
    total_volume = sum(volumes)
    typical_volume = sum(
        ((float(row.get("high") or row["close"]) + float(row.get("low") or row["close"]) + float(row["close"])) / 3)
        * float(row.get("volume") or 0)
        for row in session_rows
    )
    split = max(1, len(session_rows) // 2)
    start_time = _timestamp(rows[0].get("time"))
    return {
        "available": True,
        "source": (config.get("sources") or {}).get(period) if isinstance(config, dict) else None,
        "bars": len(rows),
        "rangeStart": start_time.astimezone(eastern).isoformat() if start_time else None,
        "rangeEnd": latest_time.astimezone(eastern).isoformat() if latest_time else None,
        "latestTradingDay": latest_time.astimezone(eastern).date().isoformat() if latest_time else None,
        "latest": {key: _rounded(latest.get(key)) for key in ("open", "high", "low", "close", "volume")},
        "session": {
            "bars": len(session_rows),
            "open": _rounded(session_rows[0].get("open")),
            "high": _rounded(max(float(row.get("high") or row["close"]) for row in session_rows)),
            "low": _rounded(min(float(row.get("low") or row["close"]) for row in session_rows)),
            "close": _rounded(session_rows[-1].get("close")),
            "volume": _rounded(total_volume),
            "firstHalfVolume": _rounded(sum(volumes[:split])),
            "secondHalfVolume": _rounded(sum(volumes[split:])),
            "vwap": _rounded(typical_volume / total_volume) if total_volume else None,
            "changePctVsPreviousClose": _rounded(
                (float(session_rows[-1]["close"]) / float(previous_close) - 1) * 100
            ) if previous_close else None,
        },
        "visibleRange": {
            "low": _rounded(min(float(row.get("low") or row["close"]) for row in rows)),
            "high": _rounded(max(float(row.get("high") or row["close"]) for row in rows)),
        },
        "movingAverages": {
            f"ma{window}": _rounded(sum(closes[-window:]) / window)
            for window in (20, 50, 200) if len(closes) >= window
        },
    }


def main(argv: list[str] | None = None, *, project_root: Path = PROJECT_ROOT) -> int:
    args = _parser().parse_args(argv)
    if args.action == "execute":
        return _execute(args, project_root)
    if args.action == "contract":
        return _contract(args, project_root)
    command = _component_command(args, project_root)
    result = subprocess.run(command, cwd=project_root, capture_output=True, text=True, check=False)
    output = Path(args.output).expanduser()
    if not output.is_absolute():
        output = project_root / output
    output = output.resolve()
    if result.returncode != 0 or not output.is_file() or output.stat().st_size <= 0:
        detail = (result.stderr or result.stdout or "component produced no artifact").strip()[-2000:]
        print(json.dumps({
            "ok": False,
            "skill": args.skill,
            "component": args.component,
            "error": detail,
        }, ensure_ascii=False))
        return result.returncode or 1
    print(json.dumps({
        "ok": True,
        "skill": args.skill,
        "component": args.component,
        "symbol": args.symbol,
        "period": args.period,
        "output": str(output),
        "bytes": output.stat().st_size,
        "validation": {"exists": True, "nonEmpty": True},
        "analysisSummary": _kline_summary(output.read_text(encoding="utf-8"), args.period),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
