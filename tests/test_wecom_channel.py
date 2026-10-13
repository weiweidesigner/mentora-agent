import base64
import hashlib
from pathlib import Path

import pytest

from app.wecom_channel import (
    WeComChannelError,
    image_payload,
    trim_utf8,
    validate_webhook_url,
)


def test_validate_webhook_url_accepts_official_group_robot_endpoint() -> None:
    value = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key"
    assert validate_webhook_url(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "",
        "http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test",
        "https://example.com/cgi-bin/webhook/send?key=test",
        "https://qyapi.weixin.qq.com/cgi-bin/webhook/send",
    ],
)
def test_validate_webhook_url_rejects_unsafe_or_incomplete_urls(value: str) -> None:
    with pytest.raises(WeComChannelError):
        validate_webhook_url(value)


def test_trim_utf8_preserves_byte_limit_for_chinese() -> None:
    result = trim_utf8("企业微信消息" * 20, 40)
    assert len(result.encode("utf-8")) <= 40
    assert result.endswith("…")


def test_image_payload_contains_required_base64_and_md5(tmp_path: Path) -> None:
    content = b"test-image-content"
    path = tmp_path / "chart.jpg"
    path.write_bytes(content)

    payload = image_payload(path)

    assert payload["msgtype"] == "image"
    assert payload["image"]["base64"] == base64.b64encode(content).decode("ascii")
    assert payload["image"]["md5"] == hashlib.md5(content).hexdigest()
