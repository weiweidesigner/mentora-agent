import os
from pathlib import Path
from types import SimpleNamespace
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.day_tasks import DayTasks
from app.qq_voice import QQVoice, speech_text, speech_chunks
from app.qq_channel import QQClient, QQChannelError, create_router


@pytest.fixture
def tasks(tmp_path):
    return DayTasks(tmp_path, lambda c,r: {})


def test_long_speech_keeps_all_content_and_splits_at_sentences():
    text = '第一句。' + '第二句很长' * 30 + '。最后一句。'
    assert speech_text(text + 'https://example.com/') == text
    parts = speech_chunks(text)
    assert ''.join(parts) == text
    assert parts[0] == '第一句。'
    assert all(len(part) <= 100 for part in parts)
    assert parts[-1].endswith('最后一句。')
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


def test_long_voice_sends_every_segment_in_order_without_sequence_collisions(tasks,monkeypatch):
    generated, sent = [], []
    monkeypatch.setenv('QQ_BREEZE_ENDPOINT','http://127.0.0.1:18768')
    monkeypatch.setenv('QQ_BREEZE_TOKEN','test')
    def post(url, **kwargs):
        generated.append(kwargs['json']['text'])
        return SimpleNamespace(content=b'\x02#!SILK_V3'+str(len(generated)).encode(),raise_for_status=lambda:None)
    monkeypatch.setattr('app.qq_voice.requests.post',post)
    voice=QQVoice(tasks,SimpleNamespace(voice_reply=lambda *a,**k:sent.append((a,k))))
    text=('完整的第一段。'*10)+('完整的第二段。'*10)+('完整的结尾。'*10)
    assert voice.send({'kind':'groups','target':'g','message_id':'m','created':time.time()},text)
    assert ''.join(generated)==text
    assert [kwargs['sequence'] for _,kwargs in sent]==[3,6,7]
    assert len({args[-1] for args,_ in sent})==3


def test_overlong_audio_is_resplit_without_losing_text(tasks,monkeypatch):
    calls, sent = [], []
    monkeypatch.setenv('QQ_BREEZE_ENDPOINT','http://127.0.0.1:18768')
    monkeypatch.setenv('QQ_BREEZE_TOKEN','test')
    def post(url, **kwargs):
        text=kwargs['json']['text'];calls.append(text)
        return SimpleNamespace(status_code=413 if len(calls)==1 else 200,
                               content=b'\x02#!SILK_V3encoded',raise_for_status=lambda:None)
    monkeypatch.setattr('app.qq_voice.requests.post',post)
    voice=QQVoice(tasks,SimpleNamespace(voice_reply=lambda *a,**k:sent.append((a,k))))
    text='长句子没有停顿'*10
    assert voice.send({'kind':'users','target':'u','message_id':'m','created':time.time()},text)
    assert ''.join(calls[1:])==text and len(sent)==2


def test_failed_later_synthesis_never_sends_an_incomplete_answer(tasks,monkeypatch):
    monkeypatch.setenv('QQ_BREEZE_ENDPOINT','http://127.0.0.1:18768')
    monkeypatch.setenv('QQ_BREEZE_TOKEN','test')
    calls=[]
    def post(*args,**kwargs):
        calls.append(True)
        if len(calls)>1:raise RuntimeError('worker unavailable')
        return SimpleNamespace(content=b'\x02#!SILK_V3encoded',raise_for_status=lambda:None)
    monkeypatch.setattr('app.qq_voice.requests.post',post)
    voice=QQVoice(tasks,SimpleNamespace(voice_reply=lambda *a,**k:pytest.fail('partial answer sent')))
    with pytest.raises(RuntimeError):
        voice.send({'kind':'users','created':time.time()},'第一段。'*30)


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


def test_breeze_model_load_and_generation_share_one_gpu_thread(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    import sys,threading
    import numpy as np
    from scripts import breeze_tts_service as worker
    threads=[]
    class Model:
        def generate(self,**kwargs):
            threads.append(threading.get_ident())
            yield SimpleNamespace(audio=np.zeros(2400),sample_rate=24000)
    def load(path):
        threads.append(threading.get_ident())
        return Model()
    monkeypatch.setenv('BREEZE_MODEL_PATH','test-model')
    monkeypatch.setattr(worker,'TOKEN','test-token')
    monkeypatch.setattr(worker,'model_pool',ThreadPoolExecutor(max_workers=1))
    monkeypatch.setitem(sys.modules,'mlx_audio',SimpleNamespace(tts=SimpleNamespace(load=load)))
    monkeypatch.setitem(sys.modules,'mlx_audio.tts',SimpleNamespace(load=load))
    monkeypatch.setitem(sys.modules,'pilk',SimpleNamespace(encode=lambda source,target,**kwargs:Path(target).write_bytes(b'\x02#!SILK_V3encoded')))
    with TestClient(worker.app) as client:
        response=client.post('/speech',json={'text':'你好'},headers={'Authorization':'Bearer test-token'})
    assert response.status_code==200
    assert len(threads)==2 and threads[0]==threads[1] and threads[0]!=threading.get_ident()


@pytest.mark.parametrize('seconds,tokens',[(56,700),(1,1800)])
def test_breeze_rejects_incomplete_audio_instead_of_silently_trimming(monkeypatch,seconds,tokens):
    import sys
    import numpy as np
    from scripts import breeze_tts_service as worker
    monkeypatch.setattr(worker,'TOKEN','test-token')
    monkeypatch.setitem(sys.modules,'pilk',SimpleNamespace(encode=lambda *a,**k:pytest.fail('incomplete audio encoded')))
    monkeypatch.setattr(worker,'model',SimpleNamespace(generate=lambda **k:iter([
        SimpleNamespace(audio=np.zeros(24000*seconds),sample_rate=24000,token_count=tokens)])))
    client=TestClient(worker.app)
    response=client.post('/speech',json={'text':'完整的长回答。'},headers={'Authorization':'Bearer test-token'})
    assert response.status_code==413
