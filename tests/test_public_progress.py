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
    def test_unknown_channel_streams_immediately_without_final_confirmation(self):
        stream=module.PublicStream();blocks=[]
        first=stream.chunk({'type':'text-delta','text':'指数历史数据可用。'})
        self.assertEqual(first[0][0],'answer_text')
        self.assertNotIn('provisional',first[0][1])
        for event,data in first:module.reduce_stream_block(blocks,event,data)
        self.assertEqual([block['kind'] for block in blocks],['text'])
        stream.message({'content':[{'type':'text','text':'指数历史数据可用。'}]})
        for event,data in stream.settle_progress():module.reduce_stream_block(blocks,event,data)
        final_text='本周市场表现如下。'
        for event,data in stream.chunk({'type':'text-delta','text':final_text}):module.reduce_stream_block(blocks,event,data)
        confirmed=stream.finish(final_text)
        self.assertEqual(confirmed,[])
        for event,data in confirmed:module.reduce_stream_block(blocks,event,data)
        self.assertEqual([block['kind'] for block in blocks],['text','text'])
        self.assertEqual(blocks[-1]['text'],final_text)

    def test_later_tool_boundary_does_not_move_public_answer_to_thinking(self):
        stream=module.PublicStream()
        events=stream.chunk({'type':'text-delta','text':'我先确认交易日。'})
        events+=stream.message({'content':[{'type':'text','text':'我先确认交易日。'}]})
        events+=stream.settle_progress()
        events+=stream.chunk({'type':'text-delta','text':'本周市场表现：指数上涨。'})
        events+=stream.finish('本周市场表现：指数上涨。')
        self.assertEqual(stream.transcript('本周市场表现：指数上涨。'),'我先确认交易日。\n\n本周市场表现：指数上涨。')
        blocks=[]
        for event,data in events:module.reduce_stream_block(blocks,event,data)
        self.assertEqual([block['kind'] for block in blocks],['text','text'])
        self.assertEqual(blocks[0]['text'],'我先确认交易日。')

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

    def test_widget_arguments_do_not_reclassify_public_prose(self):
        stream=module.PublicStream()
        stream.chunk({'type':'text-delta','text':'构建市场复盘图'})
        events=stream.chunk({'type':'tool-call-delta','index':1,'id':'v','name':module.WIDGET_TOOL,'argumentsDelta':'{"title":"复盘"'})
        self.assertEqual([event for event,_ in events],['visualization'])
        self.assertFalse(any(event=='visualization' for event,_ in stream.chunk({'type':'tool-call-delta','index':2,'id':'read','name':'read','argumentsDelta':'PRIVATE'})))

    def test_followup_tool_does_not_hide_core_conclusion_or_markdown(self):
        stream=module.PublicStream();blocks=[]
        text='**核心结论：本周市场表现如下。**'
        events=stream.chunk({'type':'text-delta','text':text})
        events+=stream.message({'content':[{'type':'text','text':text}],'tool_calls':[{'id':'read'}]})
        events+=stream.chunk({'type':'tool-call-delta','index':2,'name':'read','argumentsDelta':'PRIVATE'})
        for event,data in events:module.reduce_stream_block(blocks,event,data)
        self.assertEqual([block['kind'] for block in blocks],['text'])
        self.assertEqual(blocks[0]['text'],text)

if __name__=='__main__':unittest.main()
