"""Strict Responses adapter for the local GLM model's textual tool calls.

Ollama currently returns some GLM tool calls as assistant text.  This module
only promotes an unambiguous, schema-valid call to a Responses function_call;
it never chooses a tool on the model's behalf.
"""

from __future__ import annotations

import copy
import json
import os
import re
import uuid
import xml.etree.ElementTree as ET
from typing import Any

import requests
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from jsonschema import ValidationError, validate


router = APIRouter(prefix="/local-glm/v1")


def _declared_functions(tools: Any) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    if not isinstance(tools, list):
        return result
    for tool in tools:
        if not isinstance(tool, dict) or tool.get("type") != "function":
            continue
        name = tool.get("name")
        schema = tool.get("parameters")
        if isinstance(name, str) and isinstance(schema, dict):
            result[name] = schema
    return result


def _json_call(text: str) -> tuple[str, dict[str, Any]] | None:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*([\s\S]*?)\s*```", stripped, re.I)
    if fenced:
        stripped = fenced.group(1).strip()
    tagged = re.fullmatch(r"<tool_call>\s*([\s\S]*?)\s*</tool_call>", stripped)
    if tagged:
        stripped = tagged.group(1).strip()
    try:
        call = json.loads(stripped)
    except (ValueError, TypeError):
        return None
    if not isinstance(call, dict):
        return None
    name, arguments = call.get("name"), call.get("arguments")
    if isinstance(name, str) and isinstance(arguments, dict):
        return name, arguments
    return None


def _xml_call(text: str) -> tuple[str, dict[str, Any]] | None:
    stripped = text.strip()
    if not stripped.startswith("<tool_call>") or not stripped.endswith("</tool_call>"):
        return None
    try:
        root = ET.fromstring(stripped)
    except ET.ParseError:
        return None
    if root.tag != "tool_call":
        return None
    name = (root.text or "").strip()
    children = list(root)
    if not name or len(children) % 2:
        return None
    arguments: dict[str, Any] = {}
    for index in range(0, len(children), 2):
        key_node, value_node = children[index : index + 2]
        if key_node.tag != "arg_key" or value_node.tag != "arg_value":
            return None
        key = (key_node.text or "").strip()
        if not key or key in arguments:
            return None
        value = value_node.text or ""
        try:
            arguments[key] = json.loads(value)
        except ValueError:
            arguments[key] = value
    return name, arguments


def parse_tool_call(text: str, tools: Any) -> tuple[str, dict[str, Any]] | None:
    """Accept exactly one complete call to an advertised function."""
    declared = _declared_functions(tools)
    call = _json_call(text) or _xml_call(text)
    if call is None:
        return None
    name, arguments = call
    schema = declared.get(name)
    if schema is None:
        return None
    try:
        validate(arguments, schema)
    except (ValidationError, ValueError):
        return None
    return name, arguments


def promote_response(response: dict[str, Any], tools: Any) -> dict[str, Any]:
    """Replace a textual call with a function_call, preserving other output."""
    output = response.get("output")
    if not isinstance(output, list):
        return response
    messages = [item for item in output if isinstance(item, dict) and item.get("type") == "message"]
    if len(messages) != 1:
        return response
    content = messages[0].get("content")
    if not isinstance(content, list) or len(content) != 1:
        return response
    part = content[0]
    if not isinstance(part, dict) or part.get("type") != "output_text":
        return response
    text = part.get("text")
    if not isinstance(text, str):
        return response
    call = parse_tool_call(text, tools)
    if call is None:
        return response
    name, arguments = call
    converted = copy.deepcopy(response)
    converted["output"] = [
        item for item in output if item is not messages[0]
    ] + [{
        "id": f"fc_{uuid.uuid4().hex[:12]}",
        "type": "function_call",
        "status": "completed",
        "call_id": f"call_{uuid.uuid4().hex[:12]}",
        "name": name,
        "arguments": json.dumps(arguments, ensure_ascii=False, separators=(",", ":")),
    }]
    return converted


def _sse(response: dict[str, Any]):
    sequence = 0

    def emit(event: str, payload: dict[str, Any]) -> str:
        nonlocal sequence
        data = {"type": event, "sequence_number": sequence, **payload}
        sequence += 1
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    start = copy.deepcopy(response)
    start["status"] = "in_progress"
    start["output"] = []
    start["completed_at"] = None
    yield emit("response.created", {"response": start})
    yield emit("response.in_progress", {"response": start})
    for index, item in enumerate(response.get("output") or []):
        if not isinstance(item, dict):
            continue
        yield emit("response.output_item.added", {
            "output_index": index,
            "item": {**item, "status": "in_progress"},
        })
        yield emit("response.output_item.done", {"output_index": index, "item": item})
    yield emit("response.completed", {"response": response})


@router.get("/models")
def models() -> dict[str, Any]:
    base = os.getenv("AICHART_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    try:
        upstream = requests.get(f"{base}/v1/models", timeout=10)
        upstream.raise_for_status()
        return upstream.json()
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Ollama model list failed: {exc}") from exc


@router.post("/responses")
def responses(payload: dict[str, Any], request: Request):
    if request.client is None or request.client.host not in {"127.0.0.1", "::1"}:
        raise HTTPException(status_code=403, detail="Local GLM adapter is localhost-only")
    base = os.getenv("AICHART_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    upstream_payload = {**payload, "stream": False}
    if _declared_functions(payload.get("tools")):
        guidance = (
            "When you need a tool, return exactly one JSON object as the whole assistant "
            'message: {"name":"<advertised function name>","arguments":{...}}. '
            "No prose, Markdown, fabricated result, or unadvertised function. "
            "After a tool result, decide the next step from that actual result."
        )
        instructions = str(upstream_payload.get("instructions") or "")
        upstream_payload["instructions"] = f"{instructions}\n{guidance}".strip()
    try:
        upstream = requests.post(
            f"{base}/v1/responses", json=upstream_payload,
            timeout=float(os.getenv("AICHART_OLLAMA_TIMEOUT_SECONDS", "600")),
        )
        upstream.raise_for_status()
        result = upstream.json()
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Ollama inference failed: {exc}") from exc
    if not isinstance(result, dict):
        raise HTTPException(status_code=502, detail="Ollama returned an invalid Responses object")
    result = promote_response(result, payload.get("tools"))
    if payload.get("stream"):
        return StreamingResponse(_sse(result), media_type="text/event-stream")
    return result
