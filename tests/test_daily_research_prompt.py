import pytest

from app import presentation


@pytest.mark.parametrize('market', ['CN', 'US', 'HK'])
def test_scheduler_metadata_does_not_override_research_question(monkeypatch, market):
    seen = []

    def stream(payload, owner):
        seen.append(payload)
        yield 'final', {'question': 'context', 'interpretation': '研究结果', 'selectedSkill': {}}

    monkeypatch.setattr(presentation, 'durable_chat_events', stream)
    question = '结合最新美股盘前行情，对美股全市场进行盘前机会扫描。'
    result = presentation.run_daily_research({
        'market': market, 'stage': 'post', 'assetType': 'index',
        'symbols': '600000.SH', 'question': question, '_owner': 'test-owner',
        'time': '19:30', 'timezone': 'Asia/Shanghai',
    }, 'prompt-test')
    prompt = seen[0].question
    assert prompt.endswith(question)
    for injected in ['当前市场：', '市场当地时间：', '任务阶段：', '标的类型：',
                     '用户指定标的：', '600000.SH', '19:30', 'Asia/Shanghai']:
        assert injected not in prompt
    assert '注明数据截至时间' in prompt
    assert result['question'] == question


def test_explicit_question_placeholders_remain_supported(monkeypatch):
    seen = []

    def stream(payload, owner):
        seen.append(payload.question)
        yield 'final', {'question': '', 'interpretation': '研究结果', 'selectedSkill': {}}

    monkeypatch.setattr(presentation, 'durable_chat_events', stream)
    result = presentation.run_daily_research({
        'market': 'US', 'symbols': 'AAPL', '_owner': 'test-owner',
        'question': '分析{{date}}的{{market}} {{symbols}}',
    }, 'placeholder-test')
    assert '{{' not in seen[0]
    assert result['question'].endswith('的美股 AAPL')
