"""Incrementally decode explicitly selected JSON string values, not reasoning.

The structural JSON is still validated by the caller before any business action.
Only opted-in public paths are emitted; nested arguments and private fields never
cross this boundary. Invalid attempts retract their provisional display blocks.
"""
from contextlib import contextmanager
from contextvars import ContextVar
import json
import uuid
from types import SimpleNamespace

from app.skill_calls import emit_public_text,emit_public_visualization,check_skill_cancelled

_fields=ContextVar('public_json_fields',default=())
_attempts=ContextVar('public_json_attempts',default=None)
_widgets=ContextVar('public_json_widgets',default=False)


@contextmanager
def public_json_fields(*fields,widgets=False):
    token=_fields.set(fields)
    widget_token=_widgets.set(widgets)
    attempts=[];attempt_token=_attempts.set(attempts)
    try:yield attempts
    except BaseException:
        for attempt in attempts:attempt.discard()
        raise
    finally:
        _fields.reset(token);_attempts.reset(attempt_token);_widgets.reset(widget_token)


class PublicJsonStrings:
    def __init__(self, fields=(), emit=None, prefix=()):
        self.allowed={tuple(prefix)+(field,) for field in fields}
        self.emit=emit or (lambda path,delta:None)
        self.stack=[];self.in_string=False;self.escape=False;self.hex=None
        self.string='';self.key_string=False;self.path=();self.primitive=False
        self.high=None

    def value_path(self):
        if not self.stack:return ()
        frame=self.stack[-1]
        return frame['path']+(frame['key'] if frame['kind']=='object' else str(frame['index']),)

    def value_done(self):
        if self.stack:
            self.stack[-1]['state']='comma'
            if self.stack[-1]['kind']=='array':self.stack[-1]['index']+=1

    def character(self,char):
        code=ord(char)
        if 0xD800<=code<=0xDBFF:
            if self.high is not None:raise ValueError('Invalid surrogate')
            self.high=code;return ''
        if 0xDC00<=code<=0xDFFF:
            if self.high is None:raise ValueError('Invalid surrogate')
            char=chr(0x10000+((self.high-0xD800)<<10)+code-0xDC00);self.high=None
        elif self.high is not None:raise ValueError('Invalid surrogate')
        self.string+=char
        return char

    def feed(self,text):
        output=[]
        for char in text:
            decoded=''
            if self.in_string:
                if self.hex is not None:
                    if char not in '0123456789abcdefABCDEF':raise ValueError('Invalid Unicode escape')
                    self.hex+=char
                    if len(self.hex)==4:
                        decoded=self.character(chr(int(self.hex,16)));self.hex=None
                elif self.escape:
                    self.escape=False
                    if char=='u':self.hex=''
                    else:
                        escapes={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'}
                        if char not in escapes:raise ValueError('Invalid escape')
                        decoded=self.character(escapes[char])
                elif char=='\\':self.escape=True
                elif char=='"':
                    if self.high is not None:raise ValueError('Invalid surrogate')
                    self.in_string=False
                    if self.key_string:
                        self.stack[-1].update(key=self.string,state='colon')
                    else:self.value_done()
                else:
                    if ord(char)<32:raise ValueError('Unescaped control character')
                    decoded=self.character(char)
                if decoded and not self.key_string and self.path in self.allowed:output.append((self.path,decoded))
                continue
            if self.primitive:
                if char not in ',}] \r\n\t':continue
                self.primitive=False;self.value_done()
            if char.isspace():continue
            if char=='"':
                self.key_string=bool(self.stack and self.stack[-1]['kind']=='object' and self.stack[-1]['state']=='key')
                self.path=() if self.key_string else self.value_path()
                self.in_string=True;self.string='';self.high=None
            elif char in '{[':
                self.stack.append(dict(kind='object' if char=='{' else 'array',path=self.value_path(),state='key' if char=='{' else 'value',key='',index=0))
            elif char in '}]':
                if not self.stack:raise ValueError('Unexpected closing bracket')
                self.stack.pop();self.value_done()
            elif char==':':
                if not self.stack:raise ValueError('Unexpected colon')
                self.stack[-1]['state']='value'
            elif char==',':
                if not self.stack:raise ValueError('Unexpected comma')
                self.stack[-1]['state']='key' if self.stack[-1]['kind']=='object' else 'value'
            else:self.primitive=True
        # One delta per field per network chunk, not one per character.
        grouped=[]
        for path,delta in output:
            if grouped and grouped[-1][0]==path:grouped[-1]=(path,grouped[-1][1]+delta)
            else:grouped.append((path,delta))
        for path,delta in grouped:self.emit(path,delta)


class PublicJsonAttempt:
    def __init__(self, *, constrained=False):
        self.id='deal-'+uuid.uuid4().hex;self.blocks={};self.disabled=False
        self.decoder=PublicJsonStrings(_fields.get(),self.delta,('result',) if constrained else ())
        self.tool='';self.widget_title='';self.widget_started=False
        if _widgets.get():
            prefix=('result',) if constrained else ()
            self.decoder.allowed.update({prefix+('tool',),prefix+('arguments','title'),prefix+('arguments','widget_code')})
        attempts=_attempts.get()
        if attempts is not None:attempts.append(self)

    def delta(self,path,text):
        if path[-1]=='tool':self.tool+=text;return
        if len(path)>1 and path[-2]=='arguments':
            if self.tool!='visualize_show_widget':return
            if path[-1]=='title':self.widget_title+=text;return
            if path[-1]=='widget_code':
                if not self.widget_started:
                    self.widget_started=True
                    emit_public_visualization(dict(id=self.id,argumentDelta='{"title":'+json.dumps(self.widget_title,ensure_ascii=False)+',"widget_code":"',reset=True,native=True,live=True,final=False))
                emit_public_visualization(dict(id=self.id,argumentDelta=json.dumps(text,ensure_ascii=False)[1:-1],native=True,live=True,final=False))
                return
        block_id=self.id+':'+path[-1]
        if path[-1]=='title' and block_id not in self.blocks:text='# '+text
        self.blocks[block_id]=self.blocks.get(block_id,'')+text
        emit_public_text(dict(blockId=block_id,delta=text,live=True,final=False,provisional=True))

    def feed(self,text):
        if self.disabled:return
        try:self.decoder.feed(text)
        except ValueError:self.discard();self.disabled=True

    def discard(self):
        for block_id in self.blocks:emit_public_text(dict(blockId=block_id,discard=True))
        self.blocks.clear()
        if self.widget_started:
            emit_public_visualization(dict(id=self.id,discard=True));self.widget_started=False

    def finish_widget(self):
        if self.widget_started:
            emit_public_visualization(dict(id=self.id,argumentDelta='"}',native=True,live=True,final=False))


class PublicAnswerLedger:
    """Preserve streamed prose, then append only unseen validated final text."""
    def __init__(self):self.blocks={}

    def accept(self,event,data):
        if event!='answer_text':return
        key=data.get('blockId') or 'answer'
        if data.get('discard'):self.blocks.pop(key,None)
        elif 'delta' in data:self.blocks[key]=self.blocks.get(key,'')+data['delta']
        elif 'text' in data:self.blocks[key]=data['text']

    def remaining(self,report):
        remaining=report
        for text in self.blocks.values():
            if text.strip():remaining=remaining.replace(text.strip(),'',1)
        return remaining.strip()

    def transcript(self,report):
        parts=[text for text in self.blocks.values() if text.strip()]
        remaining=self.remaining(report)
        if remaining:parts.append(remaining)
        return '\n\n'.join(parts)


def collect_chat_stream(stream, public):
    """Consume provider deltas without exposing reasoning_content or raw JSON."""
    content=[];calls={};usage=None;finish=None
    try:
        for chunk in stream:
            check_skill_cancelled()
            if getattr(chunk,'usage',None) is not None:usage=chunk.usage
            if not chunk.choices:continue
            choice=chunk.choices[0];delta=choice.delta
            text=getattr(delta,'content',None) or ''
            if text:content.append(text);public.feed(text)
            for call in getattr(delta,'tool_calls',None) or []:
                item=calls.setdefault(call.index,dict(id='',name='',arguments='',fed=0))
                if getattr(call,'id',None):item['id']=call.id
                function=getattr(call,'function',None)
                if function:
                    item['name']+=getattr(function,'name',None) or ''
                    arguments=getattr(function,'arguments',None) or ''
                    item['arguments']+=arguments
                    if call.index==0 and item['name']=='submit_research_result':
                        public.feed(item['arguments'][item['fed']:]);item['fed']=len(item['arguments'])
            if choice.finish_reason:finish=choice.finish_reason
    except BaseException:
        public.discard();raise
    finally:
        close=getattr(stream,'close',None)
        if close:close()
    if finish is None:
        public.discard();raise RuntimeError('研究生成连接中断，未收到完整结束标记；本次未执行交易。')
    message=SimpleNamespace(content=''.join(content),tool_calls=[SimpleNamespace(id=item['id'],function=SimpleNamespace(name=item['name'],arguments=item['arguments'])) for _,item in sorted(calls.items())])
    return SimpleNamespace(choices=[SimpleNamespace(message=message,finish_reason=finish)],usage=usage)
