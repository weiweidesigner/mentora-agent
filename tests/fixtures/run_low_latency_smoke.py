"""Read-only live smoke through the same HTTP entry point as the UI.

Never submits trades. Persists complete event traces for latency/quality audit.
"""
from concurrent.futures import ThreadPoolExecutor
import argparse
import json
from pathlib import Path
import time
import uuid

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "outputs/guard-verification"
OUT.mkdir(parents=True, exist_ok=True)
QUESTIONS = [
    ("us-catalysts-html", "美股盘前催化剂，给我生成一个html。仅研究，不下单。"),
    ("treasury-research", "查一下最近可核实的美债收益率曲线，解释短端和长端差异及主要风险。仅研究，不下单。"),
    ("plain-explanation", "用简短文字解释债券久期与凸性有什么区别，以及利率上升时各自意味着什么。不需要最新行情，不下单。"),
    ("concept-html", "生成一份简短HTML科普，解释久期和凸性的区别，用一个明确标注为教学假设的算例说明。不需要最新行情或新闻，不下单。"),
]


def run(case):
    name, question = case
    session = requests.Session()
    started = time.monotonic()
    response = session.post("http://127.0.0.1:8000/api/chat/runs", json={
        "question": question, "agent": "mentora", "reasoningFramework": "deepseek",
        "reasoningEffort": "low", "inferenceModel": "deepseek-flash",
        "sessionId": "low-smoke-" + uuid.uuid4().hex, "requestId": uuid.uuid4().hex,
        "themeMode": "dark",
    }, timeout=20)
    response.raise_for_status()
    run_id = response.json()["runId"]
    events, event, data = [], "", []
    first_content = None
    with session.get(f"http://127.0.0.1:8000/api/chat/runs/{run_id}/events", stream=True, timeout=(10, 180)) as stream:
        stream.raise_for_status()
        for raw in stream.iter_lines(decode_unicode=True):
            if raw.startswith("event:"):
                event = raw[6:].strip()
            elif raw.startswith("data:"):
                data.append(raw[5:].strip())
            elif not raw and data:
                payload = json.loads("\n".join(data)); data = []
                elapsed = round(time.monotonic() - started, 3)
                events.append({"seconds": elapsed, "event": event, "data": payload})
                if event in {"interpretation_delta", "text_delta", "module", "final"} and first_content is None:
                    first_content = elapsed
                if event in {"final", "error"}:
                    break
    (OUT / f"smoke-{name}.json").write_text(json.dumps(events, ensure_ascii=False, indent=2))
    final = next((e["data"] for e in events if e["event"] == "final"), {})
    artifacts = final.get("reportArtifacts", [])
    result = {"case": name, "seconds": round(time.monotonic()-started, 3), "firstContentSeconds": first_content,
              "terminal": events[-1]["event"] if events else "none", "artifacts": artifacts,
              "interpretation": final.get("interpretation", ""), "runId": run_id}
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return result


parser=argparse.ArgumentParser()
parser.add_argument('--case', choices=[name for name,_ in QUESTIONS])
args=parser.parse_args()
selected=[case for case in QUESTIONS if not args.case or case[0]==args.case]
with ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(run, selected))
(OUT / f"smoke-summary-{args.case or 'all'}.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
