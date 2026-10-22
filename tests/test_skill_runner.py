import json
from pathlib import Path
from types import SimpleNamespace

from app import skill_runner


def test_kline_capability_executes_once_and_returns_verified_receipt(tmp_path, monkeypatch, capsys):
    script = tmp_path / "app/skills/business-chart-recall/scripts/kline.py"
    script.parent.mkdir(parents=True)
    script.write_text("# component")
    calls = []

    def fake_run(command, **kwargs):
        calls.append((command, kwargs))
        output = Path(command[command.index("--output") + 1])
        if not output.is_absolute():
            output = tmp_path / output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text('''<html><script>
const config = {"sources":{"5m":"ainvest"}};
const dataByPeriod = {"5m":[
{"time":1792589400000,"open":770,"high":772,"low":769,"close":771,"volume":100},
{"time":1792612500000,"open":771,"high":774,"low":770,"close":773,"volume":200}
],"1d":[{"time":"2026-10-20","close":769},{"time":"2026-10-21","close":773}]};
</script></html>''')
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(skill_runner.subprocess, "run", fake_run)
    result = skill_runner.main([
        "render", "--skill", "business-chart-recall", "--component", "kline",
        "--symbol", "SPY", "--period", "5m", "--language", "zh-CN",
        "--theme", "dark", "--output", "outputs/generated/spy.html",
    ], project_root=tmp_path)

    assert result == 0
    assert len(calls) == 1
    assert calls[0][0][calls[0][0].index("--period") + 1] == "5m"
    receipt = capsys.readouterr().out
    assert '"ok": true' in receipt and '"nonEmpty": true' in receipt
    assert '"source": "ainvest"' in receipt
    assert '"changePctVsPreviousClose": 0.5202' in receipt


def test_kline_summary_includes_deterministic_interpretation_fields():
    rows = [
        {"time": 1792589400000 + index * 300000, "open": 100 + index, "high": 102 + index,
         "low": 99 + index, "close": 101 + index, "volume": 10 + index}
        for index in range(220)
    ]
    document = (
        "const config = " + json.dumps({"sources": {"5m": "ainvest"}})
        + ";\nconst dataByPeriod = " + json.dumps({"5m": rows}) + ";"
    )

    summary = skill_runner._kline_summary(document, "5m")

    assert summary["available"] is True
    assert summary["source"] == "ainvest"
    assert summary["bars"] == 220
    assert summary["latest"]["close"] == 320
    assert set(summary["movingAverages"]) == {"ma20", "ma50", "ma200"}


def test_kline_capability_rejects_missing_artifact(tmp_path, monkeypatch, capsys):
    script = tmp_path / "app/skills/business-chart-recall/scripts/kline.py"
    script.parent.mkdir(parents=True)
    script.write_text("# component")
    monkeypatch.setattr(
        skill_runner.subprocess, "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=0, stdout="", stderr=""),
    )

    result = skill_runner.main([
        "render", "--skill", "business-chart-recall", "--component", "kline",
        "--symbol", "SPY", "--period", "5m", "--output", "outputs/generated/missing.html",
    ], project_root=tmp_path)

    assert result == 1
    assert '"ok": false' in capsys.readouterr().out


def test_generic_runner_executes_any_registered_capability_once(tmp_path, monkeypatch, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps([{
        "name": "sample", "script": "sample.py", "label": "Sample", "description": "fixture"
    }]))
    script = tmp_path / "app/skills/sample-skill/scripts/sample.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    calls = []

    def fake_run(command, **kwargs):
        calls.append(command)
        output = tmp_path / command[command.index("--output") + 1]
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("<html>ok</html>")
        return SimpleNamespace(returncode=0, stdout='{"rows": 3}', stderr="")

    monkeypatch.setattr(skill_runner.subprocess, "run", fake_run)
    result = skill_runner.main([
        "execute", "--script", "sample.py", "--", "--input", "data.json",
        "--output", "outputs/generated/sample.html",
    ], project_root=tmp_path)

    assert result == 0
    assert len(calls) == 1
    receipt = json.loads(capsys.readouterr().out)
    assert receipt["ok"] is True
    assert receipt["observation"] == {"rows": 3}
    assert receipt["artifacts"][0]["verified"] is True


def test_generic_runner_rejects_unregistered_script(tmp_path, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text("[]")
    result = skill_runner.main(["execute", "--script", "unknown.py"], project_root=tmp_path)
    assert result == 2
    assert "not allowlisted" in capsys.readouterr().out


def test_generic_chart_runner_normalizes_json_file_to_payload(tmp_path, monkeypatch, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps([{
        "name": "grouped_bar", "script": "grouped_bar.py", "label": "Grouped Bar", "description": "fixture"
    }]))
    script = tmp_path / "app/skills/generic-chart/scripts/grouped_bar.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    payload = tmp_path / "outputs/data.json"
    payload.parent.mkdir(parents=True)
    payload.write_text("{}")
    seen = []

    def fake_run(command, **kwargs):
        seen.append(command)
        output = tmp_path / command[command.index("--output") + 1]
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("<html>ok</html>")
        return SimpleNamespace(returncode=0, stdout='{"ok":true}', stderr="")

    monkeypatch.setattr(skill_runner.subprocess, "run", fake_run)
    result = skill_runner.main([
        "execute", "--script", "grouped_bar.py", "--", "--data-json", "outputs/data.json",
        "--output", "outputs/generated/chart.html",
    ], project_root=tmp_path)

    assert result == 0
    assert "--payload" in seen[0]
    assert "--data-json" not in seen[0]


def test_contract_returns_cli_and_schema_in_one_call(tmp_path, monkeypatch, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps([{
        "name": "sample", "script": "sample.py", "label": "Sample", "description": "fixture"
    }]))
    script = tmp_path / "app/skills/sample-skill/scripts/sample.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    schema = tmp_path / "app/skills/sample-skill/schemas/sample.schema.json"
    schema.parent.mkdir(parents=True)
    schema.write_text('{"type":"sample","required":["symbol"]}')
    monkeypatch.setattr(
        skill_runner.subprocess, "run",
        lambda command, **kwargs: SimpleNamespace(returncode=0, stdout="usage: sample --symbol SYMBOL", stderr=""),
    )

    result = skill_runner.main(["contract", "--script", "sample.py"], project_root=tmp_path)

    assert result == 0
    receipt = json.loads(capsys.readouterr().out)
    assert receipt["cliHelp"] == "usage: sample --symbol SYMBOL"
    assert receipt["schema"]["required"] == ["symbol"]
    assert receipt["skillInstructions"] == ""
