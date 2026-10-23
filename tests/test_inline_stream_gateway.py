"""AST-isolated regression checks: importing presentation starts chat storage."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest

base = Path(__file__).parent
source = base / 'presentation.py'
if not source.exists():
    source = base.parent / 'app/presentation.py'
function = next(node for node in ast.parse(source.read_text()).body
                if isinstance(node, ast.FunctionDef) and node.name == 'durable_chat_events')


def run(events):
    scope = {'framework_events': lambda payload: iter(events)}
    exec(compile(ast.Module(body=[function], type_ignores=[]), '<isolated gateway>', 'exec'), scope)
    return list(scope['durable_chat_events'](SimpleNamespace(question='fixture', agent='', history=[]), {}))


class Gateway(unittest.TestCase):
    def test_native_stream_passes_through_before_prose(self):
        data = {'id': 'native', 'argumentDelta': '{', 'native': True, 'final': False}
        events = run([('visualization', data), ('answer_text', {'blockId': 'one', 'delta': 'hello'})])
        self.assertEqual(events[0], ('visualization', data))
        self.assertEqual(events[1][1]['delta'], 'hello')

    def test_inventory_preserves_metadata_without_synthetic_frames(self):
        module = {'htmlUrl': '/generated/a.html', 'path': '/outputs/generated/a.html', 'renderMode': 'iframe'}
        events = run([('module', module), ('final', {'interpretation': 'No chart requested', 'reportArtifacts': [{'url': '/generated/a.html', 'label': 'A'}]})])
        self.assertEqual(events[0], ('module', module))
        self.assertFalse(any(event == 'visualization' for event, _ in events))
        self.assertEqual(events[-1][1]['interpretation'], 'No chart requested')
        self.assertEqual(events[-1][1]['reportArtifacts'][0]['path'], module['path'])
        self.assertEqual(events[-1][1]['reportArtifacts'][0]['renderMode'], 'iframe')

    def test_authored_chart_position_is_not_changed(self):
        text = 'Before\n[[AIME_CHART:/generated/a.html]]\nAfter\nData notes'
        events = run([('module', {'htmlUrl': '/generated/a.html'}), ('module', {'htmlUrl': '/generated/intermediate.html'}), ('answer_text', {'text': text, 'final': False}), ('final', {'interpretation': text})])
        self.assertEqual(events[-1][1]['interpretation'], text)
        self.assertEqual(sum(event == 'answer_text' for event, _ in events), 1)

    def test_empty_transport_block_does_not_suppress_final_fallback(self):
        events = run([('answer_text', {'delta': ''}), ('final', {'interpretation': 'Complete answer'})])
        self.assertEqual(events[-2], ('answer_text', {'text': 'Complete answer', 'replace': True, 'lang': 'zh-CN'}))


if __name__ == '__main__':
    unittest.main()
