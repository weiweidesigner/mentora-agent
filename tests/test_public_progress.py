"""Public commentary routing, without importing presentation or production storage."""
import importlib.util
from pathlib import Path
import unittest

root=Path(__file__).parent
source=root/'public_stream.py'
if not source.exists():source=root.parent/'app/public_stream.py'
spec=importlib.util.spec_from_file_location('public_stream_fixture',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Progress(unittest.TestCase):
    def test_tool_boundary_moves_public_prelude_out_of_answer(self):
        stream=module.PublicStream()
        events=stream.chunk({'type':'text-delta','text':'我先确认交易日。'})
        events+=stream.message({'content':[{'type':'text','text':'我先确认交易日。'}]})
        events+=stream.settle_progress()
        events+=stream.chunk({'type':'text-delta','text':'本周市场表现：指数上涨。'})
        events+=stream.finish('本周市场表现：指数上涨。')
        self.assertEqual(stream.transcript('本周市场表现：指数上涨。'),'本周市场表现：指数上涨。')
        blocks=[]
        for event,data in events:module.reduce_stream_block(blocks,event,data)
        self.assertEqual([block['kind'] for block in blocks],['progress','text'])
        self.assertEqual(blocks[0]['data']['text'],'我先确认交易日。')

    def test_commentary_updates_one_progress_block_and_private_is_ignored(self):
        stream=module.PublicStream();blocks=[]
        for text in ('先确认','交易日'):
            for event,data in stream.chunk({'type':'text-delta','text':text,'channel':'commentary'}):
                module.reduce_stream_block(blocks,event,data)
        self.assertEqual(len(blocks),1)
        self.assertEqual(blocks[0]['kind'],'progress')
        self.assertEqual(blocks[0]['data']['text'],'先确认交易日')
        self.assertEqual(stream.chunk({'type':'text-delta','text':'PRIVATE','channel':'analysis'}),[])
        self.assertEqual(stream.chunk({'type':'reasoning-delta','text':'PRIVATE'}),[])

    def test_explicit_final_answer_is_not_reclassified(self):
        stream=module.PublicStream()
        stream.chunk({'type':'text-delta','text':'已核实的部分结论','channel':'final'})
        self.assertEqual(stream.settle_progress(),[])
        self.assertEqual(stream.transcript('已核实的部分结论'),'已核实的部分结论')

    def test_widget_boundary_settles_thought_before_native_arguments(self):
        stream=module.PublicStream()
        stream.chunk({'type':'text-delta','text':'构建市场复盘图'})
        events=stream.chunk({'type':'tool-call-delta','index':1,'id':'v','name':module.WIDGET_TOOL,'argumentsDelta':'{"title":"复盘"'})
        self.assertEqual([event for event,_ in events],['answer_text','progress','visualization'])
        self.assertTrue(events[0][1]['discard'])
        self.assertFalse(any(event=='visualization' for event,_ in stream.chunk({'type':'tool-call-delta','index':2,'id':'read','name':'read','argumentsDelta':'PRIVATE'})))

if __name__=='__main__':unittest.main()
