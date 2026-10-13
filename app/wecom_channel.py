from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen


WECOM_IMAGE_LIMIT_BYTES = 2 * 1024 * 1024
WECOM_MARKDOWN_LIMIT_BYTES = 4096


class WeComChannelError(RuntimeError):
    pass


def trim_utf8(value: str, max_bytes: int) -> str:
    raw = value.encode("utf-8")
    if len(raw) <= max_bytes:
        return value
    suffix = "\n…"
    budget = max(0, max_bytes - len(suffix.encode("utf-8")))
    return raw[:budget].decode("utf-8", errors="ignore").rstrip() + suffix


def configured_webhook_url() -> str:
    return os.getenv("WECOM_BOT_WEBHOOK_URL", "").strip()


def validate_webhook_url(value: str) -> str:
    parsed = urlparse(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "qyapi.weixin.qq.com"
        or parsed.path != "/cgi-bin/webhook/send"
        or not parse_qs(parsed.query).get("key")
    ):
        raise WeComChannelError("WECOM_BOT_WEBHOOK_URL 不是有效的企业微信群机器人地址")
    return value


def image_payload(path: Path) -> dict[str, Any]:
    content = path.read_bytes()
    if len(content) > WECOM_IMAGE_LIMIT_BYTES:
        raise WeComChannelError("企业微信图片不能超过 2 MB，请缩短回答或降低图片尺寸")
    return {
        "msgtype": "image",
        "image": {
            "base64": base64.b64encode(content).decode("ascii"),
            "md5": hashlib.md5(content).hexdigest(),  # nosec: required by WeCom's API contract
        },
    }


class WeComRobotClient:
    def __init__(self, webhook_url: str | None = None, *, timeout_seconds: float = 15.0) -> None:
        self.webhook_url = validate_webhook_url(webhook_url or configured_webhook_url())
        self.timeout_seconds = timeout_seconds

    def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            self.webhook_url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:  # nosec: URL is validated above
                result = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise WeComChannelError(f"企业微信请求失败：{exc}") from exc
        if not isinstance(result, dict) or int(result.get("errcode", -1)) != 0:
            detail = result.get("errmsg", "未知错误") if isinstance(result, dict) else "响应格式错误"
            raise WeComChannelError(f"企业微信拒绝消息：{detail}")
        return result

    def send_markdown(self, content: str) -> dict[str, Any]:
        content = trim_utf8(content.strip(), WECOM_MARKDOWN_LIMIT_BYTES)
        if not content:
            raise WeComChannelError("推送内容不能为空")
        return self._post({"msgtype": "markdown", "markdown": {"content": content}})

    def send_image(self, path: Path) -> dict[str, Any]:
        if not path.is_file():
            raise WeComChannelError("待推送的图片不存在")
        return self._post(image_payload(path))
