"""Translate only public model output; never synthesize timed text frames."""
from __future__ import annotations

WIDGET_TOOL='visualize_show_widget'


class PublicStream:
    def __init__(self,prefix='assistant'):
        self.prefix=prefix;self.turn=0;self.texts={};self.last_text='';self.has_text=False
        self.calls={};self.artifacts=[];self.segments=[]
        self.public_blocks={};self.progress_keys=set();self.final_keys=set();self.pending_keys=[]

    def _text(self,index,text,channel=None):
        key=f'{self.prefix}:{self.turn}:text:{index}'
        seen=self.public_blocks.get(key,'')
        self.public_blocks[key]=text
        self.texts[index]=text
        if channel=='final':self.final_keys.add(key)
        if channel=='commentary':
            was_answer=key in self.pending_keys and key not in self.progress_keys
            self.progress_keys.add(key)
            events=[('answer_text',dict(blockId=key,discard=True))] if was_answer else []
            if text!=seen:events.append(('progress',dict(blockId=key,text=text,kind='commentary')))
            return events
        if key in self.progress_keys:
            return [('progress',dict(blockId=key,text=text,kind='commentary'))] if text!=seen else []
        if key not in self.pending_keys:self.pending_keys.append(key)
        if not text or text==seen:return []
        self.has_text=True
        data=dict(blockId=key,live=True,final=False)
        if text.startswith(seen):data['delta']=text[len(seen):]
        else:data.update(text=text,replace=True)
        return [('answer_text',data)]

    def settle_progress(self):
        """A tool boundary identifies public pre-tool narration, not private reasoning."""
        events=[]
        for key in self.pending_keys:
            if key in self.final_keys or key in self.progress_keys:continue
            text=self.public_blocks.get(key,'')
            self.progress_keys.add(key)
            events.append(('answer_text',dict(blockId=key,discard=True)))
            if text:events.append(('progress',dict(blockId=key,text=text,kind='commentary')))
        self.pending_keys=[]
        return events

    def begin(self, attempt_id):
        # A retry is a new visible block, never concatenate it into the failed
        # attempt. Normal durable settlement has already cleared the prior turn.
        self.turn=str(attempt_id)
        self.texts={}

    def chunk(self,chunk):
        if chunk.get('channel') in {'analysis','reasoning'}:return []
        kind=chunk.get('type');index=chunk.get('index',0)
        if kind=='text-delta':
            text=chunk.get('text')
            if not isinstance(text,str) or not text:return []
            return self._text(index,self.texts.get(index,'')+text,chunk.get('channel'))
        if kind=='tool-call-delta':
            call=self.calls.setdefault((self.turn,index),dict(id='',name='',arguments='',started=False))
            call['id']=chunk.get('id') or call['id'];call['name']=chunk.get('name') or call['name']
            progress=self.settle_progress()
            if call['name']!=WIDGET_TOOL:return progress
            call_id=call['id'] or f'{self.prefix}:{self.turn}:tool:{index}'
            reset=not call['started'];call['started']=True
            return progress+[('visualization',dict(id=call_id,toolName=WIDGET_TOOL,argumentDelta=chunk.get('argumentsDelta') or '',reset=reset,native=True,live=True,final=False))]
        # reasoning-delta, signatures, usage and unknown chunks are not public prose.
        return []

    def message(self,message):
        events=[]
        if message.get('channel') not in {'analysis','reasoning'}:
            content=message.get('content') or []
            for index,block in enumerate(content if isinstance(content,list) else []):
                if not isinstance(block,dict) or block.get('type')!='text':continue
                text=str(block.get('text') or '')
                events.extend(self._text(index,text,message.get('channel')))
            self.last_text=''.join(str(b.get('text') or '') for b in content if isinstance(b,dict) and b.get('type')=='text') if isinstance(content,list) else ''
            if self.last_text:self.segments.append(self.last_text)
            has_tools=bool(message.get('tool_calls') or message.get('toolCalls')) or any(
                isinstance(block,dict) and block.get('type') in {'tool_use','tool_call','tool-call','toolCall'}
                for block in content if isinstance(content,list))
            if has_tools:events.extend(self.settle_progress())
        self.turn=f'{self.turn}:next';self.texts={}
        return events

    def finish(self,answer):
        text=str(answer or '')
        if not text or any(value.strip()==text.strip() for key,value in self.public_blocks.items() if key not in self.progress_keys):return []
        return self._text('final',text,'final')

    def transcript(self, answer):
        parts=[text for key,text in self.public_blocks.items() if key not in self.progress_keys and text.strip()]
        if answer and (not parts or parts[-1].strip()!=answer.strip()):parts.append(answer)
        return '\n\n'.join(parts)


def reduce_stream_block(blocks,event,data):
    """Compact chronological blocks for durable final/error responses and replay."""
    if event=='answer_text':
        key=str(data.get('blockId') or 'legacy-answer')
        block=next((b for b in blocks if b['kind']=='text' and b['id']==key),None)
        if data.get('discard'):
            if block:blocks.remove(block)
            return
        if block is None:block=dict(kind='text',id=key,text='');blocks.append(block)
        if 'delta' in data:block['text']+=str(data['delta'])
        else:block['text']=str(data.get('text') or '')
    elif event in {'tool_step','progress'}:
        key=str(data.get('blockId') or data.get('callId') or f'{event}:{len(blocks)}')
        block=next((b for b in blocks if b['kind']==event and b['id']==key),None)
        if block is None:block=dict(kind=event,id=key);blocks.append(block)
        block['data']={k:data[k] for k in ('tool','title','thoughtSummary','phase','text','detail','callId') if k in data}
    elif event in {'visualization','visualize_widget','module'}:
        key=str(data.get('id') or data.get('callId') or data.get('htmlUrl') or data.get('url') or '')
        if not key:return
        block=next((b for b in blocks if b['kind']=='visualization' and b['id']==key),None)
        if data.get('discard'):
            if block:blocks.remove(block)
            return
        if block is None:block=dict(kind='visualization',id=key,data={});blocks.append(block)
        # Keep only completed artifact references, not megabytes of code/arguments.
        for k in ('htmlUrl','url','title','label','native','final'):
            if k in data:block['data'][k]=data[k]
