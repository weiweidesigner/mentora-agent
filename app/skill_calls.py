"""Persist actual Skill inputs/results through the existing scheduled-run event stream."""
from contextlib import contextmanager
from contextvars import ContextVar
import json
import re
import uuid

_events=ContextVar('skill_events',default=None)

@contextmanager
def skill_events(emit):
    token=_events.set(emit)
    try:yield
    finally:_events.reset(token)

def emit_model_activity(phase):
    """Expose only model-call lifecycle, never private reasoning or model text."""
    emit=_events.get()
    if emit:emit('model_activity',{'phase':phase})

def public_value(value):
    if isinstance(value,dict):return {str(k):('[redacted]' if re.search(r'api.?key|authorization|password|cookie|secret|owner',str(k),re.I) else public_value(v)) for k,v in value.items()}
    if isinstance(value,(tuple,list)):return [public_value(v) for v in value]
    if isinstance(value,str):return re.sub(r'(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]+','[redacted]',value,flags=re.I)
    return value

def invoke_skill(skill,operation,arguments,execute,*,script):
    emit=_events.get();call_id=str(uuid.uuid4());inputs=public_value(arguments)
    base=dict(skillId=skill,operation=operation,tool=skill,script=script,callId=call_id,input=inputs,lang='zh-CN')
    if emit:emit('tool_step',dict(base,phase='started'))
    try:result=execute()
    except Exception as error:
        if emit:emit('tool_step',dict(base,phase='failed',error=dict(type=type(error).__name__,message='Skill 调用失败，未返回有效结果')))
        raise
    if emit:emit('tool_step',dict(base,phase='completed',output=public_value(result)))
    return result
