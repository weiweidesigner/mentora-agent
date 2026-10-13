from __future__ import annotations

import json

from app.local_glm_adapter import _sse, parse_tool_call, promote_response


TOOLS = [{
    "type": "function",
    "name": "ping",
    "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
}]


def test_parser_promotes_only_complete_advertised_calls() -> None:
    assert parse_tool_call('{"name":"ping","arguments":{}}', TOOLS) == ("ping", {})
    assert parse_tool_call('```json\n{"name":"ping","arguments":{}}\n```', TOOLS) == ("ping", {})
    assert parse_tool_call('<tool_call>ping</tool_call>', TOOLS) == ("ping", {})
    assert parse_tool_call('I might call {"name":"ping","arguments":{}}', TOOLS) is None
    assert parse_tool_call('{"name":"delete_file","arguments":{}}', TOOLS) is None
    assert parse_tool_call('{"name":"ping","arguments":{"x":1}}', TOOLS) is None
    assert parse_tool_call('<tool_call>ping<arg_key>x</arg_key></tool_call>', TOOLS) is None


def test_promoted_response_preserves_reasoning_and_emits_standard_events() -> None:
    original = {
        "id": "resp_test", "object": "response", "status": "completed", "output": [
            {"id": "rs_1", "type": "reasoning", "summary": []},
            {"id": "msg_1", "type": "message", "content": [
                {"type": "output_text", "text": '{"name":"ping","arguments":{}}'},
            ]},
        ],
    }
    converted = promote_response(original, TOOLS)
    assert original["output"][1]["type"] == "message"
    assert converted["output"][0]["type"] == "reasoning"
    call = converted["output"][1]
    assert call["type"] == "function_call"
    assert call["name"] == "ping"
    assert json.loads(call["arguments"]) == {}
    events = "".join(_sse(converted))
    assert "event: response.output_item.done" in events
    assert "event: response.completed" in events
    assert '"type": "function_call"' in events


def test_plain_answer_is_not_promoted() -> None:
    original = {"output": [{"type": "message", "content": [
        {"type": "output_text", "text": "No tool needed."},
    ]}]}
    assert promote_response(original, TOOLS) is original
