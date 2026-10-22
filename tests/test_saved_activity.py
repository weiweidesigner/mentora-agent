from fastapi import HTTPException
import pytest
from app.chat_sessions import ChatSessions


def test_activity_keeps_public_events_in_order_without_private_reasoning(tmp_path):
    store=ChatSessions(tmp_path)
    def execute(*_):
        yield 'progress', {'text':'核验公开来源'}
        yield 'tool_step', {'callId':'real-call','phase':'completed','output':{'verified':True}}
        yield 'reasoning', {'text':'not public activity'}
        yield 'final', {'interpretation':'最终报告'}
    run=store.start('a',{'question':'test','sessionId':'case-test'},execute)
    store.pool.shutdown(wait=True)
    events=store.activity('a',run['runId'])['events']
    assert [e['event'] for e in events]==['progress','tool_step']
    assert events[1]['data']['output']['verified'] is True
    assert store.activity('a',run['runId'])['events']==events
    with pytest.raises(HTTPException) as error:
        store.activity('b',run['runId'])
    assert error.value.status_code==404
