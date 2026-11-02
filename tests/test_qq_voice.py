import os
from pathlib import Path
from types import SimpleNamespace
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.day_tasks import DayTasks
from app.qq_voice import QQVoice, speech_text
from app.qq_channel import QQClient, QQChannelError, create_router


@pytest.fixture
def tasks(tmp_path):
    return DayTasks(tmp_path, lambda c,r: {})


def test_spoken_excerpt_ends_at_sentence_and_removes_urls():
    text = '第一句。' + '第二句很长' * 80 + 'https://example.com/'
    assert speech_text(text) == '第一句。详细内容请看文字。'
    assert speech_text('简短回答。') == '简短回答。'


def test_voice_preferences_are_scoped_and_default_configurable(tasks,monkeypatch):
    voice = QQVoice(tasks, SimpleNamespace())
    assert not voice.enabled('alice')
    assert '暂未配置' in voice.setting('alice',True)
    monkeypatch.setenv('QQ_BREEZE_ENDPOINT','http://127.0.0.1:18768')
    monkeypatch.setenv('QQ_BREEZE_TOKEN','private-token')
    assert voice.enabled('alice')
    voice.setting('alice',False)
    assert not voice.enabled('alice') and voice.enabled('bob')
    assert not QQVoice(tasks,SimpleNamespace()).enabled('alice')


def test_synthesis_auth_silk_validation_and_passive_send(tasks,monkeypatch):
    calls, sent = [], []
    monkeypatch.setenv('QQ_BREEZE_ENDPOINT','http://127.0.0.1:18768')
    monkeypatch.setenv('QQ_BREEZE_TOKEN','private-token')
    monkeypatch.setenv('VEYA_PUBLIC_URL','https://example.com/mentora/')
    def post(url,**kwargs):
        calls.append((url,kwargs))
        return SimpleNamespace(content=b'\x02#!SILK_V3'+b'encoded',raise_for_status=lambda:None)
    monkeypatch.setattr('app.qq_voice.requests.post',post)
    voice=QQVoice(tasks,SimpleNamespace(voice_reply=lambda *a,**k:sent.append((a,k))))
    job={'kind':'users','target':'alice','message_id':'mid','created':time.time()}
    assert voice.send(job,'你好')
    assert calls[0][1]['headers']['Authorization']=='Bearer private-token'
    assert calls[0][1]['json']['text']=='你好'
    assert sent[0][1]['sequence']==3
    url=sent[0][0][-1]
    assert url.startswith('https://example.com/mentora/api/qq/voice/')
    app=FastAPI();app.include_router(create_router(tasks));client=TestClient(app)
    filename=url.rsplit('/',1)[1]
    response=client.get('/api/qq/voice/'+filename)
    assert response.status_code==200 and response.content.startswith(b'\x02#!SILK_V3')
    path=voice.directory/filename
    os.utime(path,(time.time()-901,)*2)
    assert client.get('/api/qq/voice/'+filename).status_code==404
    assert client.get('/api/qq/voice/not-valid.silk').status_code==404


def test_invalid_synth_response_is_not_uploaded(tasks,monkeypatch):
    monkeypatch.setenv('QQ_BREEZE_ENDPOINT','http://127.0.0.1:18768')
    monkeypatch.setenv('QQ_BREEZE_TOKEN','private-token')
    monkeypatch.setattr('app.qq_voice.requests.post',lambda *a,**k:SimpleNamespace(content=b'<html>error',raise_for_status=lambda:None))
    voice=QQVoice(tasks,SimpleNamespace())
    with pytest.raises(ValueError):
        voice.send({'kind':'users','created':time.time()},'你好')
    assert not list(voice.directory.glob('*.silk'))


def test_qq_voice_upload_uses_silk_and_never_active_send(monkeypatch):
    calls=[]
    def post(url,**kwargs):
        calls.append((url,kwargs))
        return SimpleNamespace(status_code=200,json=lambda:{'file_info':'uploaded'} if url.endswith('/files') else {'id':'sent'})
    monkeypatch.setattr('app.qq_channel.requests.post',post)
    client=QQClient();monkeypatch.setattr(client,'token',lambda:'token')
    client.voice_reply('groups','group','mid','https://example.com/speech.silk')
    assert calls[0][0].endswith('/v2/groups/group/files')
    assert calls[0][1]['json']=={'file_type':3,'url':'https://example.com/speech.silk','srv_send_msg':False}
    assert calls[1][1]['json']['msg_type']==7
    assert calls[1][1]['json']['msg_id']=='mid'
    assert calls[1][1]['json']['msg_seq']==3
    assert calls[1][1]['json']['media']['file_info']=='uploaded'
    monkeypatch.setattr('app.qq_channel.requests.post',lambda *a,**k:SimpleNamespace(status_code=400,json=lambda:{}))
    with pytest.raises(QQChannelError):
        client.voice_reply('users','alice','mid','https://example.com/speech.silk')


def test_local_breeze_worker_auth_busy_and_silk_output(monkeypatch):
    import sys
    import numpy as np
    from scripts import breeze_tts_service as worker
    monkeypatch.setattr(worker,'TOKEN','test-token')
    monkeypatch.setattr(worker,'model',SimpleNamespace(generate=lambda **kwargs:iter([SimpleNamespace(audio=np.zeros(2400),sample_rate=24000)])))
    def encode(source,target,**kwargs):
        assert kwargs=={'pcm_rate':24000,'tencent':True}
        assert len(Path(source).read_bytes())==4800
        Path(target).write_bytes(b'\x02#!SILK_V3encoded')
    monkeypatch.setitem(sys.modules,'pilk',SimpleNamespace(encode=encode))
    client=TestClient(worker.app)
    assert client.post('/speech',json={'text':'你好'}).status_code==401
    response=client.post('/speech',json={'text':'你好'},headers={'Authorization':'Bearer test-token'})
    assert response.status_code==200 and response.content.startswith(b'\x02#!SILK_V3')
    worker.lock.acquire()
    try:
        assert client.post('/speech',json={'text':'你好'},headers={'Authorization':'Bearer test-token'}).status_code==409
    finally:worker.lock.release()
    assert client.post('/speech',json={'text':'长'*301},headers={'Authorization':'Bearer test-token'}).status_code==422
