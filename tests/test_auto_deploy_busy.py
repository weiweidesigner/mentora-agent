import runpy
import sqlite3
from pathlib import Path

active=runpy.run_path(str(Path(__file__).parents[1]/'scripts/auto_deploy.py'))['executions_active']


def test_deployment_defers_running_chat_and_workflow_but_allows_completed(tmp_path):
    chat=tmp_path/'outputs/chat-sessions/sessions.sqlite3';chat.parent.mkdir(parents=True)
    with sqlite3.connect(chat) as db:
        db.execute('CREATE TABLE chat_runs(status TEXT)');db.execute("INSERT INTO chat_runs VALUES('running')")
    assert active(tmp_path)
    with sqlite3.connect(chat) as db:db.execute("UPDATE chat_runs SET status='completed'")
    assert not active(tmp_path)
    tasks=tmp_path/'outputs/day-tasks/tasks.sqlite3';tasks.parent.mkdir(parents=True)
    with sqlite3.connect(tasks) as db:
        db.execute('CREATE TABLE workflow_trials(status TEXT)');db.execute("INSERT INTO workflow_trials VALUES('queued')")
    assert active(tmp_path)
    with sqlite3.connect(tasks) as db:db.execute("UPDATE workflow_trials SET status='success'")
    assert not active(tmp_path)
