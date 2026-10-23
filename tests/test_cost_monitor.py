from app.cost_monitor import CostMonitor


def test_summary_exposes_reasoning_and_conversation_usage(tmp_path, monkeypatch):
    for name in ('DEEPSEEK_API_KEY', 'AICHART_STREAMVIZ_API_KEY', 'VISION_API_KEY', 'MOONSHOT_API_KEY'):
        monkeypatch.delenv(name, raising=False)
    monitor = CostMonitor(tmp_path)
    monitor.record(
        provider='deepseek', service='Mentora 对话', model='deepseek-flash', operation='DeepSeek Harness 推理',
        input_tokens=200, cached_input_tokens=80, output_tokens=60, reasoning_tokens=25,
        conversation_id='conversation-1', conversation_title='分析今日市场',
    )
    summary = monitor.summary(7)
    deepseek = next(item for item in summary['providers'] if item['provider'] == 'deepseek')
    assert deepseek['reasoningTokens'] == 25
    assert summary['reasoningTokens'] == 25
    assert summary['conversations'][0] == {
        'id': summary['conversations'][0]['id'],
        'conversationId': 'conversation-1', 'title': '分析今日市场',
        'provider': 'deepseek', 'model': 'deepseek-flash', 'status': 'success',
        'inputTokens': 200, 'cachedInputTokens': 80, 'outputTokens': 60,
        'reasoningTokens': 25, 'costCny': summary['conversations'][0]['costCny'],
        'created': summary['conversations'][0]['created'],
    }
