from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from app.agent_runtime import AgentRun


DEFAULT_STUDIO_DB = Path.cwd() / "outputs/studio/appdata/autogen.db"


class StudioSessionMirror:
    """Mirror Aime AgentChat public events into AutoGen Studio's history DB."""

    def __init__(self, db_path: Path | None = None) -> None:
        configured = os.getenv("AUTOGEN_STUDIO_DB_PATH", "").strip()
        self.db_path = (db_path or (Path(configured).expanduser() if configured else DEFAULT_STUDIO_DB)).resolve()
        self.enabled = os.getenv("AUTOGEN_STUDIO_SESSION_SYNC", "1").strip().lower() not in {"0", "false", "off"}
        self.user_id = os.getenv("AUTOGEN_STUDIO_USER_ID", "guestuser@gmail.com").strip() or "guestuser@gmail.com"
        self.team_id = int(os.getenv("AUTOGEN_STUDIO_TEAM_ID", "1"))
        self.session_name = os.getenv("AUTOGEN_STUDIO_SESSION_NAME", "Veya · AgentChat").strip()
        self._lock = threading.RLock()
        self._run_ids: dict[str, int] = {}
        self._started_at: dict[str, float] = {}

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=5.0)
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=5000")
        return connection

    @staticmethod
    def _json(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    def _session_id(self, connection: sqlite3.Connection) -> int:
        row = connection.execute(
            "SELECT id FROM session WHERE user_id=? AND team_id=? AND name=? ORDER BY id DESC LIMIT 1",
            (self.user_id, self.team_id, self.session_name),
        ).fetchone()
        if row:
            return int(row[0])
        now = time.strftime("%Y-%m-%d %H:%M:%S")
        cursor = connection.execute(
            "INSERT INTO session(created_at,updated_at,user_id,version,team_id,name) VALUES(?,?,?,?,?,?)",
            (now, now, self.user_id, "0.0.1", self.team_id, self.session_name),
        )
        return int(cursor.lastrowid)

    def _existing_run_id(self, connection: sqlite3.Connection, external_run_id: str) -> int | None:
        cached = self._run_ids.get(external_run_id)
        if cached is not None:
            return cached
        row = connection.execute(
            "SELECT id FROM run WHERE json_extract(task, '$.metadata.aime_run_id')=? ORDER BY id DESC LIMIT 1",
            (external_run_id,),
        ).fetchone()
        if row:
            self._run_ids[external_run_id] = int(row[0])
            return int(row[0])
        return None

    def _create_run(self, connection: sqlite3.Connection, run: AgentRun, ts: float | None = None) -> int:
        existing = self._existing_run_id(connection, run.run_id)
        if existing is not None:
            return existing
        session_id = self._session_id(connection)
        created_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts or run.created_at))
        task = {
            "source": "user",
            "content": [
                {
                    "source": "user",
                    "models_usage": None,
                    "metadata": {"engine": "AutoGen AgentChat", "aime_run_id": run.run_id},
                    "content": run.question,
                    "type": "TextMessage",
                }
            ],
            "message_type": "text",
            "metadata": {"engine": "AutoGen AgentChat", "aime_run_id": run.run_id},
        }
        cursor = connection.execute(
            "INSERT INTO run(created_at,updated_at,session_id,status,task,team_result,error_message,version,messages,user_id) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            (
                created_at,
                created_at,
                session_id,
                "ACTIVE",
                self._json(task),
                self._json({}),
                None,
                "0.0.1",
                self._json([]),
                self.user_id,
            ),
        )
        studio_run_id = int(cursor.lastrowid)
        self._run_ids[run.run_id] = studio_run_id
        self._started_at[run.run_id] = ts or run.created_at
        connection.execute("UPDATE session SET updated_at=? WHERE id=?", (created_at, session_id))
        return studio_run_id

    def _message_config(self, event_type: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        if event_type == "run.created":
            return None
        if event_type == "tool.started":
            call_id = str(payload.get("sandboxId") or f"tool-{time.time_ns()}")
            arguments = {
                "command": payload.get("command") or [],
                "cwd": payload.get("cwd") or "",
                "policy": payload.get("policy") or {},
            }
            return {
                "source": "aime_chart_orchestrator",
                "models_usage": None,
                "metadata": {"engine": "AutoGen AgentChat"},
                "content": [
                    {
                        "id": call_id,
                        "arguments": self._json(arguments),
                        "name": str(payload.get("tool") or "skill"),
                    }
                ],
                "type": "ToolCallRequestEvent",
            }
        if event_type == "tool.finished":
            call_id = str(payload.get("sandboxId") or f"tool-{time.time_ns()}")
            summary = {
                "returncode": payload.get("returncode"),
                "timedOut": payload.get("timedOut"),
                "durationSeconds": payload.get("durationSeconds"),
                "stdoutChars": payload.get("stdoutChars"),
                "stderrChars": payload.get("stderrChars"),
            }
            return {
                "source": "aime_chart_orchestrator",
                "models_usage": None,
                "metadata": {"engine": "AutoGen AgentChat"},
                "content": [
                    {
                        "content": self._json(summary),
                        "name": str(payload.get("tool") or "skill"),
                        "call_id": call_id,
                        "is_error": bool(payload.get("timedOut")) or int(payload.get("returncode") or 0) != 0,
                    }
                ],
                "type": "ToolCallExecutionEvent",
            }
        if event_type == "agentchat.event":
            details: list[str] = [str(payload.get("message") or "AgentChat event")]
            trace = payload.get("trace")
            if isinstance(trace, list) and trace:
                details.append("Trace: " + " → ".join(str(item) for item in trace))
            contracts = payload.get("contracts")
            if isinstance(contracts, list) and contracts:
                details.append("Contracts: " + ", ".join(str(item) for item in contracts))
            return {
                "source": str(payload.get("agent") or "aime_chart_agent"),
                "models_usage": None,
                "metadata": {
                    "engine": "AutoGen AgentChat",
                    "phase": payload.get("phase"),
                    "status": payload.get("status"),
                    "aime_run_id": payload.get("runId"),
                },
                "content": "\n".join(details),
                "type": "TextMessage",
            }
        return None

    def _finish_run(
        self,
        connection: sqlite3.Connection,
        run: AgentRun,
        studio_run_id: int,
        payload: dict[str, Any],
        ts: float,
    ) -> None:
        status = "COMPLETE" if str(payload.get("status")) == "completed" else "ERROR"
        rows = connection.execute(
            "SELECT config FROM message WHERE run_id=? ORDER BY id ASC", (studio_run_id,)
        ).fetchall()
        summaries: list[dict[str, Any]] = [
            {"source": "user", "models_usage": None, "metadata": {"engine": "AutoGen AgentChat"}}
        ]
        for (raw_config,) in rows:
            try:
                config = json.loads(raw_config) if isinstance(raw_config, str) else raw_config
            except (TypeError, json.JSONDecodeError):
                continue
            if isinstance(config, dict):
                summaries.append(
                    {
                        "source": config.get("source") or "aime_chart_agent",
                        "models_usage": config.get("models_usage"),
                        "metadata": config.get("metadata") or {},
                    }
                )
        stop_reason = str(payload.get("message") or ("Veya AgentChat run completed" if status == "COMPLETE" else "Veya AgentChat run failed"))
        duration = max(0.0, ts - self._started_at.get(run.run_id, run.created_at))
        team_result = {
            "task_result": {"messages": summaries, "stop_reason": stop_reason},
            "usage": "",
            "duration": duration,
        }
        updated_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))
        connection.execute(
            "UPDATE run SET updated_at=?,status=?,team_result=?,error_message=? WHERE id=?",
            (
                updated_at,
                status,
                self._json(team_result),
                None if status == "COMPLETE" else stop_reason,
                studio_run_id,
            ),
        )

    def consume(self, run: AgentRun, event_type: str, payload: dict[str, Any], *, ts: float | None = None) -> None:
        if not self.enabled or not self.db_path.is_file() or run.question.startswith("ad-hoc:"):
            return
        event_ts = ts or time.time()
        with self._lock, self._connect() as connection:
            studio_run_id = self._create_run(connection, run, event_ts)
            config = self._message_config(event_type, payload)
            if config is not None:
                session_id = self._session_id(connection)
                created_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(event_ts))
                connection.execute(
                    "INSERT INTO message(created_at,updated_at,user_id,version,config,session_id,run_id,message_meta) "
                    "VALUES(?,?,?,?,?,?,?,?)",
                    (
                        created_at,
                        created_at,
                        None,
                        "0.0.1",
                        self._json(config),
                        session_id,
                        studio_run_id,
                        self._json({}),
                    ),
                )
            if event_type == "agentchat.event" and str(payload.get("phase")) == "run" and str(payload.get("status")) in {"completed", "failed"}:
                self._finish_run(connection, run, studio_run_id, payload, event_ts)

    def backfill_recent(self, runs_dir: Path, limit: int = 20) -> int:
        if not self.enabled or not self.db_path.is_file() or not runs_dir.is_dir():
            return 0
        files = sorted(runs_dir.glob("*/logs/events.jsonl"), key=lambda path: path.stat().st_mtime)[-limit:]
        imported = 0
        for path in files:
            records: list[dict[str, Any]] = []
            for line in path.read_text(encoding="utf-8").splitlines():
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, dict):
                    records.append(record)
            if not records or records[0].get("type") != "run.created":
                continue
            first_payload = records[0].get("payload") or {}
            question = str(first_payload.get("question") or "").strip()
            run_id = str(records[0].get("runId") or path.parents[1].name)
            if not question or question.startswith("ad-hoc:"):
                continue
            terminal = any(
                record.get("type") == "agentchat.event"
                and isinstance(record.get("payload"), dict)
                and record["payload"].get("phase") == "run"
                and record["payload"].get("status") in {"completed", "failed"}
                for record in records
            )
            with self._lock, self._connect() as connection:
                existing_run_id = self._existing_run_id(connection, run_id)
                if existing_run_id is not None:
                    existing_status = connection.execute(
                        "SELECT status FROM run WHERE id=?", (existing_run_id,)
                    ).fetchone()
                    if existing_status and existing_status[0] == "ACTIVE" and not terminal:
                        created_at = float(records[0].get("ts") or path.stat().st_mtime)
                        run = AgentRun(
                            run_id=run_id,
                            question=question,
                            workspace=type("Workspace", (), {"logs": path.parent})(),
                            created_at=created_at,
                        )
                        self._started_at[run_id] = created_at
                        self._finish_run(
                            connection,
                            run,
                            existing_run_id,
                            {"status": "completed", "message": "Veya 历史 AgentChat 运行已补录"},
                            float(records[-1].get("ts") or path.stat().st_mtime),
                        )
                    continue
            created_at = float(records[0].get("ts") or path.stat().st_mtime)
            run = AgentRun(
                run_id=run_id,
                question=question,
                workspace=type("Workspace", (), {"logs": path.parent})(),  # only identity is used by the mirror
                created_at=created_at,
            )
            for record in records:
                payload = record.get("payload") if isinstance(record.get("payload"), dict) else {}
                self.consume(run, str(record.get("type") or ""), payload, ts=float(record.get("ts") or created_at))
            if not terminal:
                self.consume(
                    run,
                    "agentchat.event",
                    {
                        "runId": run_id,
                        "phase": "run",
                        "status": "completed",
                        "agent": "aime_chart_orchestrator",
                        "message": "Veya 历史 AgentChat 运行已补录",
                    },
                    ts=float(records[-1].get("ts") or path.stat().st_mtime),
                )
            imported += 1
        return imported
