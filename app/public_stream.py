"""Translate only public model output; never synthesize timed text frames."""
from __future__ import annotations

WIDGET_TOOL='visualize_show_widget'


class PublicStream:
    def __init__(self,prefix='assistant'):
        self.prefix=prefix;self.turn=0;self.texts={};self.last_text='';self.has_text=False
        self.calls={};self.artifacts=[];self.segments=[]
        self.public_blocks={};self.progress_keys=set();self.final_keys=set()

    def _text(self,index,text,channel=None):
        if channel=='final_answer':channel='final'
        key=f'{self.prefix}:{self.turn}:text:{index}'
        seen=self.public_blocks.get(key,'')
        self.public_blocks[key]=text
        self.texts[index]=text
        confirming=channel=='final' and key not in self.final_keys
        if channel=='final':
            self.final_keys.add(key)
            self.progress_keys.discard(key)
        if channel=='commentary':
            was_answer=bool(seen) and key not in self.progress_keys
            self.progress_keys.add(key)
            events=[('answer_text',dict(blockId=key,discard=True))] if was_answer else []
            if text!=seen:events.append(('progress',dict(blockId=key,text=text,kind='commentary')))
            return events
        if key in self.progress_keys:
            return [('progress',dict(blockId=key,text=text,kind='commentary'))] if text!=seen else []
        if not text or (text==seen and not confirming):return []
        self.has_text=True
        data=dict(blockId=key,live=True,final=False)
        if text.startswith(seen) and (not confirming or not seen):data['delta']=text[len(seen):]
        else:data.update(text=text,replace=True)
        return [('answer_text',data)]

    def settle_progress(self):
        """Compatibility no-op: a tool boundary does not identify text semantics."""
        return []

    def begin(self, attempt_id):
        # A retry is a new visible block, never concatenate it into the failed
        # attempt. Normal durable settlement has already cleared the prior turn.
        self.turn=str(attempt_id)
        self.texts={}

    def chunk(self,chunk):
        channel=chunk.get('channel') or chunk.get('phase')
        if channel in {'analysis','reasoning'}:return []
        kind=chunk.get('type');index=chunk.get('index',0)
        if kind=='text-delta':
            text=chunk.get('text')
            if not isinstance(text,str) or not text:return []
            return self._text(index,self.texts.get(index,'')+text,channel)
        if kind=='tool-call-delta':
            call=self.calls.setdefault((self.turn,index),dict(id='',name='',arguments='',started=False))
            call['id']=chunk.get('id') or call['id'];call['name']=chunk.get('name') or call['name']
            if call['name']!=WIDGET_TOOL:return []
            call_id=call['id'] or f'{self.prefix}:{self.turn}:tool:{index}'
            reset=not call['started'];call['started']=True
            return [('visualization',dict(id=call_id,toolName=WIDGET_TOOL,argumentDelta=chunk.get('argumentsDelta') or '',reset=reset,native=True,live=True,final=False))]
        # reasoning-delta, signatures, usage and unknown chunks are not public prose.
        return []

    def message(self,message):
        events=[]
        channel=message.get('channel') or message.get('phase')
        if channel not in {'analysis','reasoning'}:
            content=message.get('content') or []
            for index,block in enumerate(content if isinstance(content,list) else []):
                if not isinstance(block,dict) or block.get('type')!='text':continue
                text=str(block.get('text') or '')
                events.extend(self._text(index,text,channel))
            self.last_text=''.join(str(b.get('text') or '') for b in content if isinstance(b,dict) and b.get('type')=='text') if isinstance(content,list) else ''
            if self.last_text:self.segments.append(self.last_text)
        self.turn=f'{self.turn}:next';self.texts={}
        return events

    def finish(self,answer):
        text=str(answer or '')
        if not text:return []
        matching=[key for key,value in self.public_blocks.items() if key not in self.progress_keys and value.strip()==text.strip()]
        if matching:
            key=matching[-1]
            return []
        events=self._text('final',text,'final')
        for _,data in events:data['final']=True
        return events

    def transcript(self, answer):
        parts=[text for key,text in self.public_blocks.items() if key not in self.progress_keys and text.strip()]
        if answer and (not parts or parts[-1].strip()!=answer.strip()):parts.append(answer)
        return '\n\n'.join(parts)


def reduce_stream_block(blocks,event,data):
    """Compact chronological blocks for durable final/error responses and replay."""
    if event=='answer_text':
        key=str(data.get('blockId') or 'legacy-answer')
        progress=next((b for b in blocks if b['kind']=='progress' and b['id']==key),None)
        if progress and progress['data'].get('provisional') and not data.get('discard'):blocks.remove(progress)
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
        block['data']={k:data[k] for k in ('tool','title','thoughtSummary','phase','text','detail','callId','provisional') if k in data}
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
