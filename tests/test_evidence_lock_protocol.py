from pathlib import Path


def test_deepseek_prompt_applies_the_evidence_lock_protocol_to_all_efforts() -> None:
    source = (Path(__file__).parents[1] / "app" / "reasoning_frameworks.py").read_text(encoding="utf-8")
    common_start = source.index('prompt += (', source.index('def _stream_deepseek('))
    low_effort_start = source.index('if selected_reasoning_effort == "low":', common_start)
    common_prompt = source[common_start:low_effort_start]

    assert "最小充分证据条件" in common_prompt
    assert "条件一旦满足即锁定研究" in common_prompt
    assert "只允许一次确定性汇总计算" in common_prompt
    assert "最多允许一条实质不同的替代路线" in common_prompt


def test_shared_prompt_applies_convergence_and_network_limits_to_every_framework() -> None:
    source = (Path(__file__).parents[1] / "app" / "reasoning_frameworks.py").read_text(encoding="utf-8")
    shared_start = source.index("def _prompt(")
    shared_end = source.index("def _", shared_start + len("def _prompt("))
    shared_prompt = source[shared_start:shared_end]

    assert "这是所有推理框架都必须遵守的收敛协议" in shared_prompt
    assert "条件满足后立即锁定研究" in shared_prompt
    assert "单来源超时不得超过 10 秒" in shared_prompt
    assert "同一批次总时限不得超过 30 秒" in shared_prompt
    assert "不得设置网络重试" in shared_prompt
