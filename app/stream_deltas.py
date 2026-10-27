"""Compact already-received visual deltas without waiting or changing their bytes."""

def compact_visual_events(rows, max_chars=16384):
    pending=None
    def strip(data):
        data=dict(data)
        if 'argumentDelta' in data:data.pop('toolRawInput',None)
        return data
    for event,value in rows:
        data=strip(value) if event=='visualization' and isinstance(value,dict) else value
        field=next((k for k in ('argumentDelta','delta') if isinstance(data,dict) and k in data),None)
        mergeable=event=='visualization' and field and not data.get('final') and not data.get('discard')
        if pending is not None:
            old=pending[1]
            if mergeable and not data.get('reset') and old.get('id')==data.get('id') and field in old and len(old[field])+len(data[field])<=max_chars:
                joined=old[field]+data[field]
                count=old.get('coalescedDeltas',1)+data.get('coalescedDeltas',1)
                reset=old.get('reset',False)
                pending=(event,{**old,**data,field:joined,'reset':reset,'coalescedDeltas':count})
                continue
            yield pending;pending=None
        if mergeable:pending=(event,data)
        else:yield event,data
    if pending is not None:yield pending
