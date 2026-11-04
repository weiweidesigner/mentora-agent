"""Test dispatch without importing the web app or opening accounts/databases."""
import ast
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase, mock


class ChatAgentDispatchTests(TestCase):
    def dispatcher(self):
        source = Path(__file__).resolve().parents[1] / 'app/presentation.py'
        function = next(node for node in ast.parse(source.read_text()).body
                        if isinstance(node, ast.FunctionDef) and node.name == 'durable_chat_events')
        workflow = SimpleNamespace(
            research_only_request=mock.Mock(return_value=False),
            handles_question=mock.Mock(side_effect=AssertionError('Keyword routing must not bypass reasoning')),
            stream_idea=mock.Mock(return_value=iter([('status', {'agent': 'mentora-deal'})])),
        )
        general = mock.Mock(return_value=iter([('status', {'agent': 'mentora'})]))
        scope = {'PORTFOLIO': SimpleNamespace(workflow=workflow), 'framework_events': general}
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), scope)
        return scope['durable_chat_events'], workflow, general

    def test_ordinary_chat_uses_model_reasoning_for_page_and_trade_vocabulary(self):
        questions = [
            '帮我打开一个英伟达卖出call的页面',
            'Open the sell put order-entry screen for NVDA',
            '带我去取消订阅的页面',
            '我想看看买入按钮在哪里',
            '帮我买一股AAPL',
        ]
        for question in questions:
            with self.subTest(question=question):
                dispatch, workflow, general = self.dispatcher()
                payload = SimpleNamespace(question=question, agent='', history=[], reasoningEffort='low')
                self.assertEqual(list(dispatch(payload, 'test-owner'))[0][1]['agent'], 'mentora')
                general.assert_called_once_with(payload, user='test-owner')
                workflow.handles_question.assert_not_called()
                workflow.stream_idea.assert_not_called()

    def test_explicit_deal_agent_selection_is_preserved(self):
        dispatch, workflow, general = self.dispatcher()
        payload = SimpleNamespace(question='用户显式选择的交易工作流', agent='mentora-deal', history=[], reasoningEffort='low')
        self.assertEqual(list(dispatch(payload, 'test-owner'))[0][1]['agent'], 'mentora-deal')
        workflow.stream_idea.assert_called_once()
        general.assert_not_called()

    def test_explicit_general_agent_cannot_be_overridden_by_transaction_words(self):
        dispatch, workflow, general = self.dispatcher()
        payload = SimpleNamespace(question='卖出 call 的页面怎么进入', agent='mentora', history=[], reasoningEffort='low')
        list(dispatch(payload, 'test-owner'))
        general.assert_called_once()
        workflow.handles_question.assert_not_called()
