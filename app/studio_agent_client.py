from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlparse

import requests
from websockets.sync.client import connect


class StudioAgentError(RuntimeError):
    pass


class StudioAgentClient:
    """Thin transport/response adapter for an AutoGen Studio team.

    This class deliberately contains no routing, chart-selection, prompt, or
    execution policy. Those decisions belong to the Studio team configuration.
    """

    def __init__(self, *, generated_dir: Path, project_root: Path) -> None:
        self.http_base = os.getenv("AUTOGEN_STUDIO_URL", "http://127.0.0.1:8080").rstrip("/")
        self.ws_base = re.sub(r"^http", "ws", self.http_base, count=1)
        self.user_id = os.getenv("AUTOGEN_STUDIO_USER_ID", "guestuser@gmail.com").strip() or "guestuser@gmail.com"
        self.team_id = int(os.getenv("AUTOGEN_STUDIO_TEAM_ID", "1"))
        self.session_name = os.getenv("AUTOGEN_STUDIO_SESSION_NAME", "Veya · AgentChat").strip()
        self.generated_dir = generated_dir.resolve()
        self.project_root = project_root.resolve()
        self.studio_artifact_root = Path(
            os.getenv(
                "AUTOGEN_STUDIO_ARTIFACT_ROOT",
                str(self.project_root / "outputs/studio/artifacts"),
            )
        ).expanduser().resolve()

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        try:
            response = requests.request(
                method,
                f"{self.http_base}/api{path}",
                params={"user_id": self.user_id} if method.upper() in {"GET", "PUT", "DELETE"} else None,
                json=payload,
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise StudioAgentError(f"AutoGen Studio API 不可用：{exc}") from exc
        if not isinstance(data, dict) or not data.get("status"):
            raise StudioAgentError(str(data.get("message") if isinstance(data, dict) else "Studio API 返回异常"))
        return data.get("data")

    def _team_component(self) -> dict[str, Any]:
        data = self._request("GET", f"/teams/{self.team_id}")
        if not isinstance(data, dict) or not isinstance(data.get("component"), dict):
            raise StudioAgentError("RoundRobin Team 配置不存在")
        return data["component"]

    def _session_identity(self, session_key: str, title: str = "") -> tuple[str, str]:
        key = str(session_key or "").strip()
        if not key:
            return self.session_name, ""
        marker = hashlib.sha256(key.encode("utf-8")).hexdigest()[:10]
        display = re.sub(r"[\r\n\t]+", " ", str(title or "New Chat")).strip() or "New Chat"
        return f"Veya · {display[:48]} · {marker}", marker

    def ensure_session(self, session_key: str = "", title: str = "") -> dict[str, Any]:
        desired_name, marker = self._session_identity(session_key, title)
        sessions = self._request("GET", "/sessions/")
        for session in sessions if isinstance(sessions, list) else []:
            if (
                isinstance(session, dict)
                and int(session.get("team_id") or 0) == self.team_id
                and (
                    str(session.get("name") or "") == desired_name
                    or (marker and str(session.get("name") or "").endswith(f"· {marker}"))
                )
            ):
                return session
        created = self._request(
            "POST",
            "/sessions/",
            {"user_id": self.user_id, "team_id": self.team_id, "name": desired_name},
        )
        if isinstance(created, dict):
            return created
        raise StudioAgentError("无法创建 AutoGen Studio Session")

    def delete_session(self, studio_session_id: int) -> None:
        self._request("DELETE", f"/sessions/{int(studio_session_id)}")

    def rename_session(self, studio_session_id: int, session_key: str, title: str) -> dict[str, Any]:
        current = self._request("GET", f"/sessions/{int(studio_session_id)}")
        if not isinstance(current, dict):
            raise StudioAgentError("AutoGen Studio Session 不存在")
        desired_name, _marker = self._session_identity(session_key, title)
        # Studio's generic upsert treats the serialized timestamps from GET as
        # insert metadata on some SQLite/SQLModel versions. Send only the stable
        # identity and editable fields so the existing row is updated cleanly.
        updated = {
            "id": int(studio_session_id),
            "name": desired_name,
            "user_id": self.user_id,
            "team_id": int(current.get("team_id") or self.team_id),
        }
        result = self._request("PUT", f"/sessions/{int(studio_session_id)}", updated)
        return result if isinstance(result, dict) else updated

    def _create_run(self, session_id: int) -> int:
        data = self._request(
            "POST",
            "/runs/",
            {"session_id": int(session_id), "user_id": self.user_id},
        )
        if not isinstance(data, dict) or not data.get("run_id"):
            raise StudioAgentError("无法创建 AutoGen Studio Run")
        return int(data["run_id"])

    def _save_images(self, run_id: int, images: list[Any]) -> list[Path]:
        output_dir = self.project_root / "outputs" / "studio-inputs" / f"run-{run_id}"
        paths: list[Path] = []
        for index, image in enumerate(images[:6], start=1):
            data_url = str(getattr(image, "dataUrl", "") or "")
            match = re.match(r"^data:([^;,]+);base64,(.+)$", data_url, flags=re.S)
            if not match:
                continue
            mime, encoded = match.groups()
            suffix = {"image/jpeg": ".jpg", "image/webp": ".webp"}.get(mime.lower(), ".png")
            raw_name = Path(str(getattr(image, "name", "") or f"image-{index}{suffix}")).name
            safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(raw_name).stem) or f"image-{index}"
            output_dir.mkdir(parents=True, exist_ok=True)
            path = output_dir / f"{safe_stem}{suffix}"
            try:
                path.write_bytes(base64.b64decode(encoded, validate=True))
            except (ValueError, OSError):
                continue
            paths.append(path.resolve())
        return paths

    @staticmethod
    def _tool_items(data: dict[str, Any]) -> list[dict[str, Any]]:
        content = data.get("content")
        return [item for item in content if isinstance(item, dict)] if isinstance(content, list) else []

    @staticmethod
    def _json_objects(value: Any) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        if isinstance(value, dict):
            found.append(value)
            for nested in value.values():
                found.extend(StudioAgentClient._json_objects(nested))
        elif isinstance(value, list):
            for nested in value:
                found.extend(StudioAgentClient._json_objects(nested))
        elif isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith(("{", "[")):
                try:
                    found.extend(StudioAgentClient._json_objects(json.loads(stripped)))
                except json.JSONDecodeError:
                    pass
        return found

    @staticmethod
    def _looks_like_internal_draft(value: str) -> bool:
        text = str(value or "").strip().lower()
        if not text:
            return False
        markers = (
            "let me reconsider",
            "let me refine",
            "let me compute",
            "let me write",
            "let me include",
            "let me draft",
            "i realize i should",
            "actually, let me",
            "i'm unsure",
            "placeholder line",
            "data caliber:",
            "manually transcribing",
            "hand-transcription",
            "tool outputs",
            "safe_python is stateless",
            "i've been avoiding",
            "payload_json of render_generic_chart",
            "需遵循规则",
            "为保险我",
            "结束标记",
            "不适用 aime_chart",
            "最终答案末尾",
            "工具调用相关",
            "本节是视频请求",
            "我应该输出",
            "我应当在最终",
        )
        return sum(marker in text for marker in markers) >= 2

    def _copy_artifact(self, raw_path: str, run_id: int) -> str:
        source = Path(raw_path).expanduser().resolve()
        if not source.is_file() or self.studio_artifact_root not in source.parents:
            return ""
        self.generated_dir.mkdir(parents=True, exist_ok=True)
        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", source.name)
        destination = self.generated_dir / f"studio-{run_id}-{safe_name}"
        shutil.copy2(source, destination)
        return f"/generated/{destination.name}"

    @staticmethod
    def _clean_answer(value: str) -> str:
        text = re.sub(r"\b(?:TERMINATE|AIME_FINAL_9F7D)\b", "", str(value or ""), flags=re.I).strip()
        final_headings = list(re.finditer(
            r"(?i)#{1,6}\s*(?:核心结论|分析结论|结论|市场要闻|市場要聞|视频结果|视频推荐|检索到的[^\n#]*视频[^\n#]*|Core Conclusion|Key Findings|Market Brief|Video Results)\s*(?=\r?\n|$)",
            text,
        ))
        if final_headings:
            text = text[final_headings[-1].start():].strip()
        draft_line = re.compile(
            r"(?i)^\s*(?:let me\b|i(?:'m| am) unsure\b|i'll\b|actually\b|then section\b|"
            r"placeholder line\b|data caliber\s*:|for each chart\b|now market cap\b|write final\b|"
            r"让我(?:给出|组织|整理|生成|回答)|让我们(?:组织|整理)|按照\s*\d+(?:\.\d+)?\s*格式|"
            r"最终正文不应|不要输出过程说明|第一(?:个)?非空字符应为|我理解这条规则).*$"
        )
        text = "\n".join(line for line in text.splitlines() if not draft_line.match(line))
        # Remove empty duplicate metadata headings and operational prose that is
        # useful in an activity log but not in the user-facing investment view.
        text = re.sub(
            r"(?mi)^#{1,6}\s*数据说明\s*\n(?:\s*\n)*(?=#{1,6}\s*数据口径\s*$)",
            "",
            text,
        )
        text = re.sub(r"(?:见下方图表|图表如下)\s*[：:]?", "", text)
        process_markers = (
            "数据已成功从", "已完成当日", "已完成图表", "完成图表", "本次会话",
            "自动化取数", "图表渲染均", "见下方图表", "并非样例", "并非编造",
            "遗漏结束标记", "没有加结束标记", "请确认我上面的说明即最终回答",
            "让我组织回答", "让我给出面向用户", "按照11.2格式", "最终正文不应出现",
            "不要输出过程说明", "第一非空字符应为", "我理解这条规则",
        )
        paragraphs = re.split(r"(\n\s*\n)", text)
        text = "".join(
            part for part in paragraphs
            if not (part.strip() and any(marker in part for marker in process_markers))
        )
        chart_markers = list(re.finditer(r"(?m)^\s*\[\[AIME_CHART:[^\]\n]+\]\]\s*$", text))
        data_heading = re.search(r"(?m)^#{1,6}\s*数据口径\s*$", text)
        if len(chart_markers) == 1 and data_heading and chart_markers[0].start() > data_heading.start():
            marker = chart_markers[0].group(0).strip()
            text = text[: chart_markers[0].start()] + text[chart_markers[0].end() :]
            data_heading = re.search(r"(?m)^#{1,6}\s*数据口径\s*$", text)
            if data_heading:
                text = text[: data_heading.start()].rstrip() + f"\n\n{marker}\n\n" + text[data_heading.start() :].lstrip()
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        heading = re.search(r"(?m)^#{1,6}\s+", text)
        if heading and heading.start() > 0:
            preamble = text[: heading.start()].lower()
            if any(marker in preamble for marker in (
                "let me", "rendered successfully", "final analysis", "已完成处理", "图表已渲染",
                "渲染成功", "整理最终", "组织最终", "最终报告",
            )):
                text = text[heading.start():].strip()
        return text

    @staticmethod
    def _ticker(question: str, summaries: list[dict[str, Any]]) -> str:
        for item in summaries:
            code = str(item.get("code") or item.get("symbol") or "").strip().upper()
            if re.fullmatch(r"[A-Z][A-Z0-9.-]{0,9}", code):
                return code
        candidates = re.findall(r"(?<![A-Za-z0-9])([A-Z]{1,6})(?![A-Za-z0-9])", question)
        ignored = {"K", "AI", "HTML", "JSON", "CSV", "USD"}
        return next((item for item in candidates if item not in ignored), "")

    def stream(
        self,
        question: str,
        images: list[Any],
        *,
        studio_session_id: int | None = None,
        session_key: str = "",
        session_title: str = "",
    ) -> Iterator[tuple[str, dict[str, Any]]]:
        team_component = self._team_component()
        if studio_session_id is None:
            studio_session = self.ensure_session(session_key, session_title or question)
            studio_session_id = int(studio_session["id"])
        run_id = self._create_run(studio_session_id)
        image_paths = self._save_images(run_id, images)
        task = question
        if image_paths:
            task += "\n\n用户上传图片已保存到以下本机路径，请调用 analyze_aichart_multimodal 处理：\n"
            task += "\n".join(str(path) for path in image_paths)

        yield "status", {"message": "已连接 AutoGen Studio RoundRobin Team", "phase": "studio-connect", "lang": "zh-CN"}
        yield "agent_event", {
            "engine": "AutoGen Studio",
            "agent": "RoundRobin Team",
            "phase": "run",
            "status": "started",
            "runId": f"studio-{run_id}",
            "studioSessionId": studio_session_id,
            "message": f"Studio Run #{run_id} 开始处理用户请求",
            "lang": "zh-CN",
        }

        answers: list[str] = []
        artifact_paths: list[str] = []
        chart_artifact_paths: list[str] = []
        payload_paths: list[str] = []
        summaries: list[dict[str, Any]] = []
        advisor_texts: list[str] = []
        tool_names: list[str] = []
        tool_index = 0
        result_payload: dict[str, Any] | None = None

        try:
            with connect(f"{self.ws_base}/api/ws/runs/{run_id}", open_timeout=15, close_timeout=3) as socket:
                connected = json.loads(socket.recv(timeout=15))
                if connected.get("status") != "connected":
                    raise StudioAgentError("AutoGen Studio WebSocket 连接失败")
                socket.send(
                    json.dumps(
                        {"type": "start", "task": task, "team_config": team_component, "files": []},
                        ensure_ascii=False,
                    )
                )
                deadline = time.monotonic() + 420
                while time.monotonic() < deadline:
                    try:
                        raw = socket.recv(timeout=max(1, min(30, deadline - time.monotonic())))
                    except TimeoutError:
                        socket.send(json.dumps({"type": "ping"}))
                        continue
                    message = json.loads(raw)
                    message_type = str(message.get("type") or "")
                    if message_type == "message":
                        data = message.get("data") if isinstance(message.get("data"), dict) else {}
                        data_type = str(data.get("type") or "")
                        source = str(data.get("source") or "assistant_agent")
                        if data_type == "ToolCallRequestEvent":
                            for item in self._tool_items(data):
                                tool_index += 1
                                name = str(item.get("name") or "Studio Tool")
                                tool_names.append(name)
                                yield "tool_step", {
                                    "index": tool_index,
                                    "total": tool_index,
                                    "tool": name,
                                    "script": name,
                                    "code": "STUDIO",
                                    "lang": "zh-CN",
                                    "params": [str(item.get("arguments") or "")],
                                    "observation": "AutoGen Studio 正在调用工具",
                                    "phase": "started",
                                    "callId": str(item.get("id") or item.get("call_id") or item.get("callId") or f"studio-tool-{tool_index}"),
                                }
                        elif data_type == "ToolCallExecutionEvent":
                            for item in self._tool_items(data):
                                tool_index += 1
                                name = str(item.get("name") or "Studio Tool")
                                content = str(item.get("content") or "")
                                objects = self._json_objects(content)
                                summaries.extend(objects)
                                for obj in objects:
                                    output = str(obj.get("output") or "")
                                    html_output = str(obj.get("html") or "")
                                    payload_path = str(obj.get("payload") or "")
                                    advisor_text = str(obj.get("advisor_text") or "").strip()
                                    if output.lower().endswith(".html"):
                                        artifact_paths.append(output)
                                        if name in {"render_business_chart", "render_generic_chart"}:
                                            chart_artifact_paths.append(output)
                                    if html_output.lower().endswith(".html"):
                                        artifact_paths.append(html_output)
                                        if name in {"render_business_chart", "render_generic_chart"}:
                                            chart_artifact_paths.append(html_output)
                                    if payload_path.lower().endswith(".json"):
                                        payload_paths.append(payload_path)
                                    if name == "generate_investment_advisor_text" and advisor_text:
                                        advisor_texts.append(advisor_text)
                                yield "tool_step", {
                                    "index": tool_index,
                                    "total": tool_index,
                                    "tool": name,
                                    "script": name,
                                    "code": "STUDIO",
                                    "lang": "zh-CN",
                                    "params": [],
                                    "observation": content[:5000],
                                    "phase": "completed",
                                    "callId": str(item.get("id") or item.get("call_id") or item.get("callId") or f"studio-tool-{tool_index}"),
                                }
                        elif data_type in {"TextMessage", "StopMessage", "HandoffMessage"}:
                            content = data.get("content")
                            cleaned = self._clean_answer(content) if isinstance(content, str) else ""
                            if (
                                source not in {"user", "llm_call_event"}
                                and cleaned != "AutoGen Studio 已完成处理。"
                                and not self._looks_like_internal_draft(cleaned)
                            ):
                                answers.append(cleaned)
                    elif message_type == "result":
                        result_payload = message.get("data") if isinstance(message.get("data"), dict) else {}
                        break
                    elif message_type == "completion" and message.get("status") == "error":
                        data = message.get("data") if isinstance(message.get("data"), dict) else {}
                        reason = str((data.get("task_result") or {}).get("stop_reason") or "Studio 执行失败")
                        raise StudioAgentError(reason)
                    elif message_type == "error":
                        raise StudioAgentError(str(message.get("error") or "Studio 执行失败"))
                else:
                    raise StudioAgentError("AutoGen Studio 执行超时")
        except StudioAgentError:
            raise
        except Exception as exc:
            raise StudioAgentError(f"AutoGen Studio WebSocket 调用失败：{exc}") from exc

        if result_payload:
            task_result = result_payload.get("task_result") if isinstance(result_payload.get("task_result"), dict) else {}
            for item in task_result.get("messages") or []:
                if not isinstance(item, dict) or not isinstance(item.get("content"), str):
                    continue
                source = str(item.get("source") or "")
                cleaned = self._clean_answer(item["content"])
                if (
                    source not in {"user", "llm_call_event"}
                    and cleaned != "AutoGen Studio 已完成处理。"
                    and not self._looks_like_internal_draft(cleaned)
                ):
                    answers.append(cleaned)

        # Search tools may emit an HTML debug/report file for their own UI. It
        # is not a chart and must not be embedded in the user-facing answer;
        # doing so duplicates the final narrative and exposes raw Markdown.
        preferred_artifacts = chart_artifact_paths
        unique_artifacts = list(dict.fromkeys(preferred_artifacts))
        report_artifacts = [
            {"path": path, "url": self._copy_artifact(path, run_id)}
            for path in unique_artifacts
        ]
        report_artifacts = [item for item in report_artifacts if item["url"]]
        html_url = report_artifacts[0]["url"] if report_artifacts else ""
        payload_url = self._copy_artifact(payload_paths[-1], run_id) if payload_paths else ""
        interpretation = self._clean_answer(advisor_texts[-1] if advisor_texts else (answers[-1] if answers else ""))
        if not interpretation:
            interpretation = "本次处理未生成可展示的最终结论。请重试；系统不会将中间规划文本作为最终答案展示。"
        label = "AutoGen Studio"
        if "render_business_chart" in tool_names:
            label = "业务图表"
        elif "render_generic_chart" in tool_names:
            label = "通用图表"
        elif "fetch_yahoo_data" in tool_names:
            label = "Yahoo 数据"
        elif "analyze_aichart_multimodal" in tool_names:
            label = "多模态图表分析"
        elif "search_ainvest_videos" in tool_names:
            label = "AInvest 视频"
        elif "kimi_search" in tool_names:
            label = "Kimi 搜索"

        sources: list[dict[str, Any]] = []
        videos: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        seen_videos: set[str] = set()
        for summary in summaries:
            video_items = summary.get("videos")
            if isinstance(video_items, list):
                for item in video_items:
                    if not isinstance(item, dict):
                        continue
                    page_url = str(item.get("url") or "").strip()
                    video_url = str(item.get("videoUrl") or item.get("video_url") or "").strip()
                    identity = video_url or page_url
                    if not identity or identity in seen_videos:
                        continue
                    seen_videos.add(identity)
                    videos.append(
                        {
                            "title": str(item.get("title") or "AInvest Video"),
                            "summary": str(item.get("summary") or item.get("content_text") or "")[:500],
                            "publishedAt": str(item.get("publishedAt") or item.get("published_at") or ""),
                            "publishedDate": str(item.get("publishedDate") or item.get("published_date") or ""),
                            "url": page_url,
                            "videoUrl": video_url,
                            "coverUrl": str(item.get("coverUrl") or item.get("image") or "").strip(),
                            "durationSeconds": int(item.get("durationSeconds") or item.get("video_time_seconds") or 0),
                            "siteName": (
                                "AInvest Videos"
                                if str(item.get("source") or "").lower().startswith("category:")
                                else str(item.get("source") or "AInvest Videos")
                            ),
                        }
                    )
            articles = summary.get("articles")
            if not isinstance(articles, list):
                continue
            for article in articles:
                if not isinstance(article, dict):
                    continue
                url = str(article.get("url") or "").strip()
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                site_name = str(article.get("siteName") or article.get("source") or "").strip()
                if not site_name:
                    site_name = urlparse(url).netloc.removeprefix("www.") or "AInvest"
                raw_summary = str(article.get("summary") or article.get("content_text") or "")
                source_summary = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", raw_summary)
                source_summary = re.sub(r"https?://\S+", "", source_summary)
                source_summary = re.sub(r"[*_`#]+", "", source_summary)
                source_summary = re.sub(r"\s+", " ", source_summary).strip()[:220]
                sources.append(
                    {
                        "title": str(article.get("title") or article.get("source") or url),
                        "url": url,
                        "siteName": site_name,
                        "summary": source_summary,
                        "iconUrl": str(article.get("iconUrl") or article.get("icon_url") or "").strip(),
                    }
                )

        yield "agent_event", {
            "engine": "AutoGen Studio",
            "agent": "RoundRobin Team",
            "phase": "run",
            "status": "completed",
            "runId": f"studio-{run_id}",
            "message": f"Studio Run #{run_id} 已完成",
            "lang": "zh-CN",
        }
        yield "final", {
            "question": question,
            "code": self._ticker(question, summaries),
            "selectedSkill": {
                "key": ",".join(dict.fromkeys(tool_names)) or "autogen-studio",
                "label": label,
                "script": " + ".join(dict.fromkeys(tool_names)),
                "reason": "由 AutoGen Studio RoundRobin Team 自主规划并执行。",
            },
            "htmlUrl": html_url,
            "reportUrl": html_url,
            "reportArtifacts": report_artifacts,
            "payloadUrl": payload_url or None,
            "interpretation": interpretation,
            "status": ["AutoGen Studio 已完成规划、工具执行和回答生成"],
            "agentRunId": f"studio-{run_id}",
            "studioSessionId": studio_session_id,
            "sources": sources,
            "videos": videos,
            "actionLinks": [],
            "lang": "zh-CN",
        }
