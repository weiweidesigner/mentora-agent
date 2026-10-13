from __future__ import annotations

import json
import os
import subprocess
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable


SECRET_KEY_HINTS = ("KEY", "TOKEN", "SECRET", "PASSWORD", "COOKIE", "AUTH")


@dataclass(frozen=True)
class ResourceRequest:
    """Resource intent for a skill execution.

    The local implementation cannot enforce CPU/memory limits yet; the fields
    are deliberately part of the contract so Docker/K8s/microVM executors can
    enforce the same request later without changing planner/runtime call sites.
    """

    cpu: float = 1.0
    memory_mb: int = 1024
    timeout_seconds: float = 120.0


@dataclass(frozen=True)
class SandboxPolicy:
    """Security/runtime policy attached to an execution sandbox."""

    runtime: str = "local-subprocess"
    network: str = "inherited"
    filesystem: str = "workspace-scoped"
    permissions: str = "unprivileged"


@dataclass(frozen=True)
class WorkspaceLayout:
    """Per-run workspace locations.

    For the current app, generated artifacts remain in outputs/generated for UI
    compatibility. The run workspace gives us a durable place for logs, inputs,
    temporary files, and future container volume mounts.
    """

    root: Path
    work: Path
    output: Path
    logs: Path

    def ensure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.work.mkdir(parents=True, exist_ok=True)
        self.output.mkdir(parents=True, exist_ok=True)
        self.logs.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class AgentRun:
    run_id: str
    question: str
    workspace: WorkspaceLayout
    created_at: float = field(default_factory=time.time)
    status: str = "running"


@dataclass(frozen=True)
class SkillExecutionRequest:
    run_id: str
    tool_name: str
    command: list[str]
    cwd: Path
    env: dict[str, str]
    resources: ResourceRequest
    policy: SandboxPolicy = field(default_factory=SandboxPolicy)


@dataclass(frozen=True)
class SkillExecutionResult:
    returncode: int
    stdout: str
    stderr: str
    timed_out: bool
    duration_seconds: float
    sandbox_id: str


class AgentRuntime:
    """Small runtime boundary around skill execution.

    Today this executes locally with subprocess. It intentionally mirrors a
    container-oriented runtime contract: create a run, allocate a workspace,
    execute commands under a sandbox policy, persist event logs, and return
    stdout/stderr/artifacts to the orchestrator.
    """

    def __init__(
        self,
        *,
        project_root: Path,
        runs_dir: Path,
        default_policy: SandboxPolicy | None = None,
        event_sink: Callable[[AgentRun, str, dict[str, Any]], None] | None = None,
    ) -> None:
        self.project_root = project_root.resolve()
        self.runs_dir = runs_dir.resolve()
        self.default_policy = default_policy or SandboxPolicy()
        self.event_sink = event_sink
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def create_run(self, question: str, *, run_id: str | None = None) -> AgentRun:
        safe_run_id = run_id or f"run-{int(time.time())}-{uuid.uuid4().hex[:8]}"
        workspace = WorkspaceLayout(
            root=self.runs_dir / safe_run_id,
            work=self.runs_dir / safe_run_id / "work",
            output=self.runs_dir / safe_run_id / "output",
            logs=self.runs_dir / safe_run_id / "logs",
        )
        workspace.ensure()
        run = AgentRun(run_id=safe_run_id, question=question, workspace=workspace)
        self._append_event(run, "run.created", {"question": question})
        return run

    def execute(self, run: AgentRun, request: SkillExecutionRequest) -> SkillExecutionResult:
        sandbox_id = f"{request.policy.runtime}:{uuid.uuid4().hex[:12]}"
        started = time.time()
        self._append_event(
            run,
            "tool.started",
            {
                "tool": request.tool_name,
                "cwd": str(request.cwd),
                "command": redact_command(request.command),
                "resources": asdict(request.resources),
                "policy": asdict(request.policy),
                "sandboxId": sandbox_id,
            },
        )
        try:
            completed = subprocess.run(
                request.command,
                cwd=str(request.cwd),
                text=True,
                capture_output=True,
                timeout=request.resources.timeout_seconds,
                env=request.env,
            )
            result = SkillExecutionResult(
                returncode=completed.returncode,
                stdout=completed.stdout,
                stderr=completed.stderr,
                timed_out=False,
                duration_seconds=time.time() - started,
                sandbox_id=sandbox_id,
            )
        except subprocess.TimeoutExpired as exc:
            result = SkillExecutionResult(
                returncode=124,
                stdout=str(exc.stdout or ""),
                stderr=str(exc.stderr or ""),
                timed_out=True,
                duration_seconds=time.time() - started,
                sandbox_id=sandbox_id,
            )
        self._append_event(
            run,
            "tool.finished",
            {
                "tool": request.tool_name,
                "returncode": result.returncode,
                "timedOut": result.timed_out,
                "durationSeconds": round(result.duration_seconds, 3),
                "stdoutChars": len(result.stdout),
                "stderrChars": len(result.stderr),
                "sandboxId": result.sandbox_id,
            },
        )
        return result

    def append_event(self, run: AgentRun, event_type: str, payload: dict[str, Any]) -> None:
        """Persist a sanitized orchestration event alongside tool executions."""
        self._append_event(run, event_type, payload)

    def read_events(self, run_id: str) -> list[dict[str, Any]]:
        """Read one run's durable public event history."""
        safe_run_id = Path(str(run_id or "")).name
        if not safe_run_id or safe_run_id != str(run_id or ""):
            return []
        path = self.runs_dir / safe_run_id / "logs" / "events.jsonl"
        if not path.exists():
            return []
        events: list[dict[str, Any]] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(item, dict):
                events.append(item)
        return events

    def _append_event(self, run: AgentRun, event_type: str, payload: dict[str, Any]) -> None:
        record = {
            "ts": time.time(),
            "runId": run.run_id,
            "type": event_type,
            "payload": payload,
        }
        path = run.workspace.logs / "events.jsonl"
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        if self.event_sink is not None:
            try:
                self.event_sink(run, event_type, payload)
            except Exception:
                # Session mirroring is observability only and must never break a
                # chart request when Studio is stopped, locked, or unavailable.
                pass


def redact_command(command: list[str]) -> list[str]:
    redacted: list[str] = []
    skip_next = False
    secret_options = {"--api-key", "--token", "--password", "--secret", "--cookie", "--authorization"}
    for index, item in enumerate(command):
        value = str(item)
        if skip_next:
            redacted.append("[REDACTED]")
            skip_next = False
            continue
        lower = value.lower()
        if lower in secret_options:
            redacted.append(value)
            skip_next = True
            continue
        if any(lower.startswith(f"{option}=") for option in secret_options):
            redacted.append(value.split("=", 1)[0] + "=[REDACTED]")
            continue
        redacted.append(value)
    return redacted


def sanitized_env_status(env: dict[str, str]) -> dict[str, str]:
    return {
        key: ("set" if value else "missing")
        for key, value in env.items()
        if any(hint in key.upper() for hint in SECRET_KEY_HINTS)
    }


def local_execution_env(base_env: dict[str, str] | None = None) -> dict[str, str]:
    env = dict(base_env or os.environ)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env
