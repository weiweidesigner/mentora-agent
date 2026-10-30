import json
from pathlib import Path
from types import SimpleNamespace

from app import skill_runner


def test_market_data_is_registered_and_resolves_to_its_batch_script():
    root = Path(__file__).parents[1]
    script, metadata = skill_runner._registered_script("read_market_data.py", root)
    assert script == root / "app/skills/market-data/scripts/read_market_data.py"
    assert metadata["name"] == "read_market_data"


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


def test_code_interpreter_runner_normalizes_json_file_to_payload(tmp_path, monkeypatch, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps([{
        "name": "code_interpreter", "script": "code_interpreter.py", "description": "fixture"
    }]))
    script = tmp_path / "app/skills/code-interpreter/scripts/code_interpreter.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    payload = tmp_path / "outputs/raw.json"
    payload.parent.mkdir(parents=True)
    payload.write_text("{}")
    output = tmp_path / "outputs/result.html"
    seen = []

    def fake_run(command, **_kwargs):
        seen.append(command)
        output.write_text("<html>ok</html>")
        return SimpleNamespace(returncode=0, stdout='{"result": 1}', stderr="")

    monkeypatch.setattr(skill_runner.subprocess, "run", fake_run)
    result = skill_runner.main([
        "execute", "--script", "code_interpreter.py", "--",
        "--data-json", str(payload), "--transform-code", "def transform(raw_data, question): return raw_data",
        "--output", str(output),
    ], project_root=tmp_path)

    assert result == 0
    assert "--payload" in seen[0]
    assert "--data-json" not in seen[0]
    assert json.loads(capsys.readouterr().out)["ok"] is True


def test_code_interpreter_runner_normalizes_json_output_to_payload_output(tmp_path, monkeypatch, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps([{
        "name": "code_interpreter", "script": "code_interpreter.py", "description": "fixture"
    }]))
    script = tmp_path / "app/skills/code-interpreter/scripts/code_interpreter.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    payload = tmp_path / "outputs/raw.json"
    payload.parent.mkdir(parents=True)
    payload.write_text("{}")
    requested_output = tmp_path / "outputs/result.json"
    seen = []

    def fake_run(command, **_kwargs):
        seen.append(command)
        html_output = Path(command[command.index("--output") + 1])
        json_output = Path(command[command.index("--payload-output") + 1])
        html_output.write_text("<html>ok</html>")
        json_output.write_text('{"result": {"count": 1}}')
        return SimpleNamespace(returncode=0, stdout='{"result": 1}', stderr="")

    monkeypatch.setattr(skill_runner.subprocess, "run", fake_run)
    result = skill_runner.main([
        "execute", "--script", "code_interpreter.py", "--", "--payload", str(payload),
        "--transform-code", "def transform(raw_data, question): return raw_data",
        "--output", str(requested_output),
    ], project_root=tmp_path)

    assert result == 0
    assert seen[0][seen[0].index("--output") + 1].endswith("result.html")
    assert seen[0][seen[0].index("--payload-output") + 1] == str(requested_output)
    receipt = json.loads(capsys.readouterr().out)
    assert {Path(item["path"]).suffix for item in receipt["artifacts"]} == {".html", ".json"}


def test_code_interpreter_rejects_implicit_auxiliary_model_before_subprocess(tmp_path, monkeypatch, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps([{
        "name": "code_interpreter", "script": "code_interpreter.py", "description": "fixture"
    }]))
    script = tmp_path / "app/skills/code-interpreter/scripts/code_interpreter.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    payload = tmp_path / "outputs/raw.json"
    payload.parent.mkdir(parents=True)
    payload.write_text("{}")

    def unexpected_run(*_args, **_kwargs):
        raise AssertionError("subprocess must not run without an explicit transform")

    monkeypatch.setattr(skill_runner.subprocess, "run", unexpected_run)
    result = skill_runner.main([
        "execute", "--script", "code_interpreter.py", "--", "--payload", str(payload),
    ], project_root=tmp_path)

    assert result == 2
    receipt = json.loads(capsys.readouterr().out)
    assert receipt["ok"] is False
    assert "--transform-file" in receipt["error"]
    assert "auxiliary model" in receipt["error"]


def test_large_json_observation_is_compacted_when_saved_to_an_artifact(tmp_path, monkeypatch, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps([{
        "name": "snapshot", "script": "snapshot.py", "description": "fixture"
    }]))
    script = tmp_path / "app/skills/data/scripts/snapshot.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    output = tmp_path / "outputs/snapshot.json"
    rows = [{"symbol": f"S{i}", "value": i} for i in range(2000)]

    def fake_run(_command, **_kwargs):
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({"data": {"total": len(rows), "item": rows}}))
        return SimpleNamespace(
            returncode=0,
            stdout=json.dumps({"data": {"total": len(rows), "item": rows}}),
            stderr="",
        )

    monkeypatch.setattr(skill_runner.subprocess, "run", fake_run)
    result = skill_runner.main([
        "execute", "--script", "snapshot.py", "--", "--output", str(output),
    ], project_root=tmp_path)

    assert result == 0
    receipt = json.loads(capsys.readouterr().out)
    assert receipt["observation"]["compacted"] is True
    assert receipt["observation"]["summary"]["data"]["item"]["count"] == 2000
    assert receipt["observation"]["fullOutputPath"] == str(output)
    assert "downstream tools" in receipt["observation"]["handoff"]


def test_large_json_without_output_is_spooled_for_file_handoff(tmp_path, monkeypatch, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps([{
        "name": "snapshot", "script": "snapshot.py", "description": "fixture"
    }]))
    script = tmp_path / "app/skills/data/scripts/snapshot.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    rows = [{"symbol": f"S{i}", "value": i} for i in range(2000)]

    monkeypatch.setattr(
        skill_runner.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(
            returncode=0, stdout=json.dumps({"rows": rows}), stderr="",
        ),
    )
    result = skill_runner.main(["execute", "--script", "snapshot.py"], project_root=tmp_path)

    assert result == 0
    receipt = json.loads(capsys.readouterr().out)
    reference = Path(receipt["observation"]["fullOutputPath"])
    assert reference.is_file()
    assert reference.parent == tmp_path / "outputs" / "tool-results"
    assert len(json.loads(reference.read_text())["rows"]) == 2000


def test_code_interpreter_compaction_prefers_payload_output_over_html_receipt(tmp_path, monkeypatch, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps([{
        "name": "code_interpreter", "script": "code_interpreter.py", "description": "fixture"
    }]))
    script = tmp_path / "app/skills/code-interpreter/scripts/code_interpreter.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    payload = tmp_path / "outputs/raw.json"
    payload.parent.mkdir(parents=True)
    payload.write_text("{}")
    html = tmp_path / "outputs/receipt.html"
    structured = tmp_path / "outputs/result.json"
    rows = [{"symbol": f"S{i}", "value": i} for i in range(2000)]

    def fake_run(_command, **_kwargs):
        html.write_text("<html>ok</html>")
        structured.write_text(json.dumps({"result": {"rows": rows}}))
        return SimpleNamespace(returncode=0, stdout=json.dumps({"result": {"rows": rows}}), stderr="")

    monkeypatch.setattr(skill_runner.subprocess, "run", fake_run)
    result = skill_runner.main([
        "execute", "--script", "code_interpreter.py", "--", "--payload", str(payload),
        "--transform-code", "def transform(raw_data, question): return raw_data",
        "--output", str(html), "--payload-output", str(structured),
    ], project_root=tmp_path)

    assert result == 0
    receipt = json.loads(capsys.readouterr().out)
    assert receipt["observation"]["fullOutputPath"] == str(structured)


def test_large_structured_artifact_returns_result_summary_without_raw_data(tmp_path, monkeypatch, capsys):
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps([{
        "name": "code_interpreter", "script": "code_interpreter.py", "description": "fixture"
    }]))
    script = tmp_path / "app/skills/code-interpreter/scripts/code_interpreter.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    source = tmp_path / "outputs/raw.json"
    source.parent.mkdir(parents=True)
    source.write_text("{}")
    html = tmp_path / "outputs/receipt.html"
    structured = tmp_path / "outputs/result.json"

    def fake_run(_command, **_kwargs):
        html.write_text("<html>ok</html>")
        structured.write_text(json.dumps({
            "rawData": [{"row": index, "payload": "x" * 100} for index in range(1000)],
            "transformCode": "large internal implementation",
            "result": {
                "sampleCount": 31,
                "horizons": [
                    {"months": 1, "median": 2.17},
                    {"months": 3, "median": 5.7},
                    {"months": 6, "median": 11.29},
                    {"months": 12, "median": 15.33},
                ],
            },
        }))
        return SimpleNamespace(returncode=0, stdout='{"ok":true}', stderr="")

    monkeypatch.setattr(skill_runner.subprocess, "run", fake_run)
    result = skill_runner.main([
        "execute", "--script", "code_interpreter.py", "--", "--payload", str(source),
        "--transform-code", "def transform(raw_data, question): return raw_data",
        "--output", str(html), "--payload-output", str(structured),
    ], project_root=tmp_path)

    assert result == 0
    receipt = json.loads(capsys.readouterr().out)
    assert receipt["dataHandoffs"] == [{
        "path": str(structured),
        "bytes": structured.stat().st_size,
        "instruction": (
            "Use this summary for reasoning and pass path to downstream tools. "
            "Do not reopen or print the complete artifact unless a required field is missing."
        ),
        "summary": {
            "sampleCount": 31,
            "horizons": [
                {"months": 1, "median": 2.17},
                {"months": 3, "median": 5.7},
                {"months": 6, "median": 11.29},
                {"months": 12, "median": 15.33},
            ],
        },
    }]
    assert "rawData" not in json.dumps(receipt["dataHandoffs"])


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
    assert receipt["capabilityDescription"] == "fixture"
    assert "skillInstructions" not in receipt


def test_long_contract_preserves_asset_guidance_and_hands_off_full_help(tmp_path, monkeypatch, capsys):
    script = tmp_path / "app/skills/sample/scripts/sample.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    agent_contract = {"identity": "Use the requested native asset; do not substitute a proxy.",
                      "example": "--market 89 --code 861077"}
    schema = script.parent.parent / "schemas/sample.schema.json"
    schema.parent.mkdir()
    schema.write_text(json.dumps({"agentContract": agent_contract, "details": "schema" * 3000}))
    cli_help = "usage: sample --market MARKET --code CODE\n" + "help " * 4000
    monkeypatch.setattr(skill_runner, "_registered_script", lambda *a: (script, {"name": "sample", "description": "Canonical component metadata"}))
    monkeypatch.setattr(skill_runner.subprocess, "run", lambda *a, **k: SimpleNamespace(returncode=0, stdout=cli_help, stderr=""))
    assert skill_runner.main(["contract", "--script", "sample.py"], project_root=tmp_path) == 0
    encoded = capsys.readouterr().out
    assert len(encoded) < 4000
    receipt = json.loads(encoded)
    assert receipt["agentContract"] == agent_contract
    assert receipt["capabilityDescription"] == "Canonical component metadata"
    assert receipt["cliOptions"] == ["--market", "--code"]
    full = json.loads(Path(receipt["fullOutputPath"]).read_text())
    assert full["schema"]["agentContract"] == agent_contract
    assert full["cliHelp"] == cli_help.strip()


def test_kline_execute_summarizes_the_same_artifact_and_price_bases(tmp_path, monkeypatch, capsys):
    script = tmp_path / "app/skills/sample/scripts/kline.py"
    script.parent.mkdir(parents=True)
    script.write_text("# fixture")
    monkeypatch.setattr(skill_runner, "_registered_script", lambda *a: (script, {"name": "kline"}))
    rows = [{"time": "2026-10-06", "open": 201, "high": 203.25, "low": 200, "close": 202, "volume": 100},
            {"time": "2026-10-29", "open": 190, "high": 191, "low": 188, "close": 188.74, "volume": 25}]
    config = {"code": "861077", "market": "89", "dataType": "1d", "sources": {"1d": "ainvest"}, "ma": [2]}
    def render(command, **kwargs):
        output = tmp_path / command[command.index("--output") + 1]
        output.write_text("const config = " + json.dumps(config) + ";\nconst dataByPeriod = " + json.dumps({"1d": rows}) + ";")
        return SimpleNamespace(returncode=0, stdout='{"ok":true}', stderr="")
    monkeypatch.setattr(skill_runner.subprocess, "run", render)
    assert skill_runner.main(["execute", "--script", "kline.py", "--", "--output", "outputs/generated/kline.html"], project_root=tmp_path) == 0
    summary = json.loads(capsys.readouterr().out)["analysisSummary"]
    assert summary["identity"]["market"] == "89"
    assert summary["rangeStart"] == "2026-10-06"
    assert summary["latestTradingDay"] == "2026-10-29"
    assert summary["session"]["volume"] == 25
    assert summary["peaks"]["intrabarHigh"]["value"] == 203.25
    assert summary["peaks"]["highestClose"]["value"] == 202
    assert round(summary["peaks"]["changePctFromHighestClose"], 2) == -6.56
    assert round(summary["peaks"]["changePctFromIntrabarHigh"], 2) == -7.14
    assert summary["movingAverages"] == {"ma2": 195.37}

def test_kline_authored_marks_require_real_jev_handoff_before_render(tmp_path,monkeypatch,capsys):
    script=tmp_path/'app/skills/business-chart-recall/scripts/kline.py';script.parent.mkdir(parents=True);script.write_text('# fixture')
    monkeypatch.setattr(skill_runner,'_registered_script',lambda *a:(script,{'name':'kline'}))
    monkeypatch.setattr(skill_runner.subprocess,'run',lambda *a,**k: (_ for _ in ()).throw(AssertionError('Unreviewed drawings must not render')))
    props=tmp_path/'manual.json';props.write_text(json.dumps({'annotations':[{'type':'polyline','points':[{'time':1,'price':2},{'time':2,'price':3}]}]}))
    status=skill_runner.main(['execute','--script','kline.py','--','--props-json',str(props),'--output','outputs/chart.html'],project_root=tmp_path)
    assert status==2
    assert 'JEV' in json.loads(capsys.readouterr().out)['error']

def test_jev_kline_receipt_is_bound_to_current_period_and_marks(tmp_path):
    path=tmp_path/'selected.json'
    value={'component':{'props':{'dataType':'1d','annotations':[{'type':'polyline','period':'1d','source':'jev-kline-plan'}]}},'jevAnnotationPlan':{'modelSelected':True,'selection':'laya','provider':'local-laya','model':'local-model','period':'1d'}}
    path.write_text(json.dumps(value))
    assert skill_runner._kline_annotation_receipt(['--payload',str(path)],tmp_path)['modelSelected']
    value['component']['props']['dataType']='1w';path.write_text(json.dumps(value))
    import pytest
    with pytest.raises(ValueError,match='JEV'):skill_runner._kline_annotation_receipt(['--payload',str(path)],tmp_path)
    value['component']['props']['dataType']='1d';value['component']['props']['annotations'][0]['source']='model';path.write_text(json.dumps(value))
    with pytest.raises(ValueError,match='JEV'):skill_runner._kline_annotation_receipt(['--payload',str(path)],tmp_path)

def test_plain_kline_without_annotations_does_not_require_selection(tmp_path):
    assert skill_runner._kline_annotation_receipt(['--symbol','AAPL'],tmp_path) is None
