"""Persist actual Skill inputs/results through the existing scheduled-run event stream."""
from contextlib import contextmanager
from contextvars import ContextVar
import json
import re
import uuid

_events=ContextVar('skill_events',default=None)
_cancelled=ContextVar('skill_events_cancelled',default=None)

@contextmanager
def skill_events(emit,cancelled=None):
    token=_events.set(emit)
    cancel_token=_cancelled.set(cancelled) if cancelled is not None else None
    try:yield
    finally:
        _events.reset(token)
        if cancel_token is not None:_cancelled.reset(cancel_token)

def check_skill_cancelled():
    cancelled=_cancelled.get()
    if cancelled and cancelled():raise InterruptedError('本轮执行已取消')

def emit_model_activity(phase):
    """Expose only model-call lifecycle, never private reasoning or model text."""
    emit=_events.get()
    if emit:emit('model_activity',{'phase':phase})

def emit_public_progress(text):
    """Forward the model's public action summary without templating its wording."""
    emit=_events.get()
    if emit and isinstance(text,str) and text.strip():
        emit('progress',{'text':text.strip(),'kind':'analysis','agent':'mentora-deal','lang':'zh-CN'})

def emit_public_text(data):
    """Forward an explicit public-answer field, never raw model JSON/reasoning."""
    emit=_events.get()
    if emit:emit('answer_text',dict(data,agent='mentora-deal',lang='zh-CN'))

def emit_public_visualization(data):
    emit=_events.get()
    if emit:emit('visualization',dict(data,agent='mentora-deal',lang='zh-CN'))

def public_value(value):
    if isinstance(value,dict):return {str(k):('[redacted]' if re.search(r'api.?key|authorization|password|cookie|secret|owner',str(k),re.I) else public_value(v)) for k,v in value.items()}
    if isinstance(value,(tuple,list)):return [public_value(v) for v in value]
    if isinstance(value,str):return re.sub(r'(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]+','[redacted]',value,flags=re.I)
    return value

def invoke_skill(skill,operation,arguments,execute,*,script):
    check_skill_cancelled()
    emit=_events.get();call_id=str(uuid.uuid4());inputs=public_value(arguments)
    base=dict(skillId=skill,operation=operation,tool=skill,script=script,callId=call_id,input=inputs,lang='zh-CN')
    if emit:emit('tool_step',dict(base,phase='started'))
    try:result=execute()
    except Exception as error:
        if emit:emit('tool_step',dict(base,phase='failed',error=dict(type=type(error).__name__,message='Skill 调用失败，未返回有效结果')))
        raise
    if emit:emit('tool_step',dict(base,phase='completed',output=public_value(result)))
    return result
