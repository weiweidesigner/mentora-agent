from types import SimpleNamespace
import sys

import pytest

from app.reasoning_frameworks import LocalAgentFrameworks


@pytest.mark.parametrize('effort', ['low', 'high'])
@pytest.mark.parametrize('images', [[], [{'name': 'reference.png'}]])
@pytest.mark.parametrize('question', [
    '复盘今天A股，重点由你根据数据决定。',
    'Compare US and Chinese markets, then investigate a discrepancy.',
    '分析现金流和公告，按我的要求生成HTML报告。',
    '帮我检查这份自定义数据，并根据结果决定下一步。',
])
def test_every_request_keeps_the_general_agent_loop(tmp_path, monkeypatch, effort, images, question):
    monkeypatch.setenv('AICHART_BOUNDED_RESEARCH', '1')  # Legacy server configuration must be harmless.
    def forbidden(*args, **kwargs): pytest.fail('fixed market workflow must never run')
    monkeypatch.setitem(sys.modules, 'app.fast_market_review', SimpleNamespace(plan_evidence=forbidden, FastMarketReview=forbidden))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / 'generated')
    monkeypatch.setattr(client, '_jev_visualization_plan', forbidden)
    captured = []
    events = [('progress', {'text': '根据现有证据继续核验'}),
              ('tool_step', {'tool': 'model-selected-tool', 'phase': 'completed'}),
              ('answer_text', {'text': '模型的阶段结论', 'replace': True}),
              ('final', {'interpretation': '模型自行决定的完整结果'})]
    def general(*args, **kwargs):
        captured.append((args, kwargs))
        yield from events
    monkeypatch.setattr(client, '_stream_deepseek', general)
    history = [{'role': 'user', 'text': '保留我的范围和交付要求'}]
    result = list(client.stream('deepseek', question, images, session_key='general-test',
                               engine_session_id='engine-test', history=history,
                               reasoning_effort=effort, visualization_theme='dark'))
    assert result == events
    args, options = captured[0]
    assert args[:5] == (question, images, 'general-test', 'engine-test', history)
    assert options['reasoning_effort'] == effort


@pytest.mark.parametrize('framework', ['deepseek', 'codex'])
@pytest.mark.parametrize('question', ['画苹果的 K 线图', '分析上传图片并生成市场仪表盘', 'Plot my custom data'])
def test_visual_requests_start_runtime_before_any_visual_preselection(tmp_path, monkeypatch, framework, question):
    def forbidden(*args, **kwargs):
        pytest.fail('visual selection must not run ahead of the general agent')
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / 'generated')
    monkeypatch.setattr(client, '_jev_visualization_plan', forbidden)
    monkeypatch.setattr(client, '_visualization_candidates', forbidden)
    images = [{'name': 'reference.png'}]
    history = [{'role': 'user', 'text': '由你选择合适的可视化'}]
    captured = []
    def runtime(*args, **kwargs):
        captured.append((args, kwargs))
        yield 'status', {'phase': 'runtime-connect'}
        yield 'tool_step', {'tool': 'model-selected-chart-skill', 'phase': 'completed'}
        yield 'final', {'interpretation': 'actual runtime answer'}
    monkeypatch.setattr(client, f'_stream_{framework}', runtime)
    events = client.stream(framework, question, images, session_key='visual-start',
                           history=history, visualization_theme='dark')
    assert next(events) == ('status', {'phase': 'runtime-connect'})
    args, options = captured[0]
    assert args[:5] == (question, images, 'visual-start', '', history)
    assert '深色' in options['visualization_guidance']
    rest = list(events)
    assert rest[0][1]['tool'] == 'model-selected-chart-skill'
    assert rest[-1] == ('final', {'interpretation': 'actual runtime answer'})


def test_prompt_keeps_model_decisions_and_does_not_override_skill_validation(tmp_path, monkeypatch):
    monkeypatch.setenv('DSH_HOME', str(tmp_path / 'dsh'))
    captured = []
    class Harness:
        def __init__(self, **kwargs): pass
        def run(self, prompt, *, session_id, on_notification):
            captured.append(prompt)
            return SimpleNamespace(session_id=session_id, final_response='done', events=[], notifications=[])
        def close(self): pass
    monkeypatch.setitem(sys.modules, 'deepseek_harness', SimpleNamespace(DeepSeekHarness=Harness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / 'generated')
    list(client.stream('deepseek', '检查数据', [], session_key='prompt', reasoning_effort='low'))
    assert '由你决定研究范围、工具、步骤' in captured[0]
    assert '覆盖项目及 Skill 中默认的完整研究' not in captured[0]
    assert '600–1000' not in captured[0]
    assert '不得用它检查本轮生成' not in captured[0]
    client.close()


@pytest.mark.parametrize('failed', [False, True])
def test_native_tool_events_display_results_only_after_the_tool_returns(tmp_path, monkeypatch, failed):
    monkeypatch.setenv('DSH_HOME', str(tmp_path / 'dsh'))
    class Harness:
        def __init__(self, **kwargs): pass
        def run(self, prompt, *, session_id, on_notification):
            for kind, data in [
                ('tool/call', {'turn': 1, 'step': 39, 'callId': 'native-call', 'name': 'bash',
                               'arguments': '{"command":"cat SKILL.md"}'}),
                ('tool/result', {'message': {'role': 'tool', 'toolCallId': 'native-call',
                                            'source': {'kind': 'tool'}, 'isError': failed,
                                            'content': [{'type': 'text', 'text': 'Actual returned text'},
                                                        {'type': 'image', 'data': 'not output text'}]}}),
            ]:
                on_notification(SimpleNamespace(method='session.event', payload={
                    'sessionId': session_id, 'event': {'type': kind, 'data': data}}))
            return SimpleNamespace(session_id=session_id, final_response='done', events=[], notifications=[])
        def close(self): pass
    monkeypatch.setitem(sys.modules, 'deepseek_harness', SimpleNamespace(DeepSeekHarness=Harness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / 'generated')
    events = list(client.stream('deepseek', '检查运行事件', [], session_key='native-event'))
    tools = [data for kind, data in events if kind == 'tool_step']
    assert tools[0]['phase'] == 'started' and tools[0]['observation'] == ''
    assert tools[1]['phase'] == ('failed' if failed else 'completed')
    assert tools[1]['observation'] == 'Actual returned text'
    assert tools[1]['callId'] == 'native-call' and tools[1]['tool'] == 'bash'
    client.close()
