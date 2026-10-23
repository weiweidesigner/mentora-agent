"""Translate only public model output; never synthesize timed text frames."""
from __future__ import annotations

WIDGET_TOOL='visualize_show_widget'


class PublicStream:
    def __init__(self,prefix='assistant'):
        self.prefix=prefix;self.turn=0;self.texts={};self.last_text='';self.has_text=False
        self.calls={};self.artifacts=[];self.segments=[]

    def begin(self, attempt_id):
        # A retry is a new visible block, never concatenate it into the failed
        # attempt. Normal durable settlement has already cleared the prior turn.
        self.turn=str(attempt_id)
        self.texts={}

    def chunk(self,chunk):
        kind=chunk.get('type');index=chunk.get('index',0)
        if kind=='text-delta':
            text=chunk.get('text')
            if not isinstance(text,str) or not text:return []
            self.texts[index]=self.texts.get(index,'')+text;self.has_text=True
            return [('answer_text',dict(blockId=f'{self.prefix}:{self.turn}:text:{index}',delta=text,live=True,final=False))]
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
        if message.get('channel') not in {'analysis','reasoning'}:
            content=message.get('content') or []
            for index,block in enumerate(content if isinstance(content,list) else []):
                if not isinstance(block,dict) or block.get('type')!='text':continue
                text=str(block.get('text') or '')
                seen=self.texts.get(index,'')
                if text and text!=seen:
                    data=dict(blockId=f'{self.prefix}:{self.turn}:text:{index}',live=True,final=False)
                    if text.startswith(seen):data['delta']=text[len(seen):]
                    else:data.update(text=text,replace=True)
                    events.append(('answer_text',data));self.has_text=True
            self.last_text=''.join(str(b.get('text') or '') for b in content if isinstance(b,dict) and b.get('type')=='text') if isinstance(content,list) else ''
            if self.last_text:self.segments.append(self.last_text)
        self.turn=f'{self.turn}:next';self.texts={}
        return events

    def finish(self,answer):
        text=str(answer or '')
        current=''.join(self.texts.values()) or self.last_text
        if not text or text.strip()==current.strip():return []
        return [('answer_text',dict(blockId=f'{self.prefix}:{self.turn}:final',text=text,replace=True,live=True,final=False))]

    def transcript(self, answer):
        parts=list(self.segments)
        current=''.join(self.texts.values())
        if current:parts.append(current)
        if answer and (not parts or parts[-1].strip()!=answer.strip()):parts.append(answer)
        return '\n\n'.join(parts)


def reduce_stream_block(blocks,event,data):
    """Compact chronological blocks for durable final/error responses and replay."""
    if event=='answer_text':
        key=str(data.get('blockId') or 'legacy-answer')
        block=next((b for b in blocks if b['kind']=='text' and b['id']==key),None)
        if block is None:block=dict(kind='text',id=key,text='');blocks.append(block)
        if 'delta' in data:block['text']+=str(data['delta'])
        else:block['text']=str(data.get('text') or '')
    elif event in {'tool_step','progress'}:
        key=str(data.get('callId') or f'{event}:{len(blocks)}')
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
