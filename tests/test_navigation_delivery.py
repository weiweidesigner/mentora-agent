import json
import sys
from types import SimpleNamespace

import pytest

from app.navigation_delivery import (
    canonical_navigation_answer, delivered_navigation, settle_navigation_answer,
)
from app.public_stream import PublicStream

CARDS = [
    {'title': 'Aime 自动化任务', 'icon': 'assistant', 'url': 'https://www.ainvest.com/aime/automation/'},
    {'title': '通知偏好', 'icon': 'account', 'url': 'https://www.ainvest.com/setting/?tab=notification'},
    {'title': '自选与组合', 'icon': 'page', 'url': 'https://www.ainvest.com/watchlist/'},
]


def answer_for(cards):
    return '先安排复盘，再使用相关入口。\n\n' + '\n\n'.join(
        '```json\n' + json.dumps(card, ensure_ascii=False, separators=(',', ':')) + '\n```'
        for card in cards
    ) + '\n\n请在页面上配置任务。'


@pytest.mark.parametrize('count', [1, 2, 3])
def test_multiple_selected_cards_are_delivered_without_reformatting(count):
    answer = answer_for(CARDS[:count])
    assert delivered_navigation(answer, CARDS)
    assert canonical_navigation_answer(answer, CARDS) == answer


def test_unknown_or_ambiguous_selected_card_is_rejected():
    assert not delivered_navigation(answer_for([CARDS[0], {**CARDS[1], 'url': 'https://example.com/'}]), CARDS)
    assert not delivered_navigation(answer_for(CARDS[:1]), [CARDS[0], {**CARDS[0], 'title': '冲突'}])
    assert not delivered_navigation('没有合适的入口。', CARDS)


def test_canonical_fields_update_same_block_without_discarding_other_prose():
    stream = PublicStream()
    stream._text('intro', '复盘建议。', 'final')
    draft = answer_for([{**CARDS[0], 'title': '模型改写标题'}, CARDS[1]])
    stream._text('cards', draft, 'final')
    answer, events = settle_navigation_answer(stream, draft, CARDS)
    assert delivered_navigation(answer, CARDS)
    assert '模型改写标题' not in answer
    assert len(events) == 1
    assert events[0][1]['blockId'] == 'assistant:0:text:cards'
    assert events[0][1]['replace'] is True
    assert not events[0][1].get('discard')
    assert stream.public_blocks['assistant:0:text:intro'] == '复盘建议。'
    assert stream.finish(answer) == []
    assert stream.transcript(answer).count('https://www.ainvest.com/aime/automation/') == 1


@pytest.mark.parametrize('count,rename', [(1, False), (3, False), (3, True)])
def test_harness_finishes_once_without_retraction_or_retry(tmp_path, monkeypatch, count, rename):
    from app.reasoning_frameworks import LocalAgentFrameworks
    monkeypatch.setenv('DSH_HOME', str(tmp_path / 'dsh'))
    cards = [dict(card) for card in CARDS[:count]]
    if rename:
        cards[0]['title'] = '模型改写标题'
    answer = answer_for(cards)
    calls = []

    class Harness:
        def __init__(self, **kwargs): pass
        def close(self): pass
        def run(self, prompt, *, session_id, on_notification):
            calls.append(prompt)
            for kind, data in [
                ('assistant/chunk', {'channel': 'final', 'chunk': {'type': 'text-delta', 'index': 0, 'text': answer}}),
                ('assistant/message', {'message': {'channel': 'final', 'content': [{'type': 'text', 'text': answer}]}}),
            ]:
                on_notification(SimpleNamespace(method='session.event', payload={
                    'sessionId': session_id, 'event': {'type': kind, 'data': data},
                }))
            return SimpleNamespace(session_id=session_id, final_response=answer, events=[], notifications=[])

    monkeypatch.setitem(sys.modules, 'deepseek_harness', SimpleNamespace(DeepSeekHarness=Harness))
    generated = tmp_path / 'outputs/generated'
    generated.mkdir(parents=True)
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    events = list(client._stream_deepseek('复盘建议', [], 'navigation-test', '', [], _navigation_cards=CARDS))
    assert len(calls) == 1
    assert not any(data.get('discard') for kind, data in events if kind == 'answer_text')
    final = [data for kind, data in events if kind == 'final']
    assert len(final) == 1
    for card in cards:
        assert final[0]['interpretation'].count(card['url']) == 1
    assert '模型改写标题' not in final[0]['interpretation']
