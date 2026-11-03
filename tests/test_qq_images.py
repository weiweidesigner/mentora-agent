import json
import threading
import time
from io import BytesIO
from types import SimpleNamespace

from PIL import Image
import pytest
from app.qq_images import QQImages,image_attachments,download_frames
from app.qq_channel import QQChannel
from app.day_tasks import DayTasks


def attachment(url='https://gchat.qpic.cn/test',**extra):
    return {'content_type':'image/png','url':url,**extra}


def test_attachment_urls_only_qq_images_and_bounded():
    assert len(image_attachments({'attachments':[attachment()]*10}))==3
    for url in ['https://localhost/x','https://gchat.qpic.cn.evil.com/x','https://evil.com/x','file:///x','https://user:pw@gchat.qpic.cn/x','https://gchat.qpic.cn:8000/x']:
        assert image_attachments({'attachments':[attachment(url)]})==[]
    assert image_attachments({'attachments':[{'content_type':'video/mp4','url':'https://gchat.qpic.cn/x'}]})==[]
    assert image_attachments({'attachments':None})==[]


def test_download_samples_gif_and_refuses_redirects(monkeypatch):
    frames=[Image.new('RGB',(20,20),c) for c in ('red','green','blue')]
    out=BytesIO();frames[0].save(out,format='GIF',save_all=True,append_images=frames[1:])
    class Response:
        status_code=200;headers={}
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def iter_content(self,*a):yield out.getvalue()
    response=Response();calls=[]
    monkeypatch.setattr('app.qq_images.requests.get',lambda *a,**kw:(calls.append(kw) or response))
    values,animated=download_frames('https://gchat.qpic.cn/x')
    assert animated and len(values)==2 and calls[0]['allow_redirects'] is False
    assert 'headers' not in calls[0]
    response.status_code=302
    with pytest.raises(ValueError):download_frames('https://gchat.qpic.cn/x')


def test_describe_partial_failure_preserves_uncertainty(monkeypatch):
    def download(url):
        if url=='bad':raise ValueError()
        return [b'frame'],True
    monkeypatch.setattr('app.qq_images.download_frames',download)
    service=QQImages(observer=lambda frames,text:'可见小猫与爱心，可能表达喜欢')
    try:
        value=service.describe([{'url':'ok'},{'url':'bad'}],'')
        assert '可能表达喜欢' in value and '抽样识别' in value and '部分附件无法读取' in value
    finally:service.close()


class Client:
    def credentials(self):return 'app','secret'
    def reply(self,*a,**kw):pass


def wait_for(fn):
    until=time.monotonic()+3
    while time.monotonic()<until:
        if fn():return
        time.sleep(.01)
    raise AssertionError('Async operation timed out')


@pytest.fixture
def channel(tmp_path):
    tasks=DayTasks(tmp_path,lambda *a:{})
    channel=QQChannel(tasks,client=Client(),chat_runner=lambda *a:{'interpretation':'看见你的小猫啦'})
    yield channel,tasks
    channel.chat.close()
    for notice in channel.chat.notices.values():notice.cancel()


def event(kind='GROUP_MESSAGE_CREATE',mid='one',text='',images=True):
    return {'op':0,'t':kind,'d':{'id':mid,'content':text,'group_openid':'room','author':{'member_openid':'alice','user_openid':'alice'},'attachments':[attachment()] if images else []}}


def test_image_only_group_is_async_understood_before_participation_and_deduped(channel,monkeypatch):
    c,tasks=channel;started=threading.Event();release=threading.Event();calls=[];responses=[]
    def describe(*a):started.set();release.wait(2);return '[图片识别资料]小猫头顶爱心，可能表达喜欢'
    c.chat.images.describe=describe
    c.chat.groups.should_reply=lambda *a:(calls.append(a[2]) or True)
    c._respond=lambda *a,**kw:responses.append(a[-1])
    c.dispatch(event());assert started.wait(1);assert not calls
    c.dispatch(event('GROUP_AT_MESSAGE_CREATE'))
    release.set();wait_for(lambda:bool(responses))
    assert len(responses)==1 and '小猫头顶爱心' in responses[0]
    with tasks.db() as db:
        row=db.execute('SELECT payload,mentioned FROM qq_group_messages').fetchone()
        value=json.loads(tasks.cipher.decrypt(row['payload'].encode()))
        assert '小猫头顶爱心' in value['text'] and row['mentioned']==1
    c.dispatch(event());assert len(responses)==1


def test_private_image_without_content_is_understood_and_failure_is_honest(channel):
    c,tasks=channel;responses=[]
    c._respond=lambda *a,**kw:responses.append(a[-1])
    c.chat.images.describe=lambda *a:(_ for _ in ()).throw(ValueError('bad file'))
    payload=event('C2C_MESSAGE_CREATE');payload['d'].pop('content');c.dispatch(payload)
    wait_for(lambda:bool(responses))
    assert '无法读取内容' in responses[0] and '不要猜测' in responses[0]


def test_ordinary_unrelated_image_can_remain_silent(channel):
    c,tasks=channel;responses=[]
    c.chat.images.describe=lambda *a:'风景照片'
    c.chat.groups.should_reply=lambda *a:False
    c._respond=lambda *a,**kw:responses.append(a[-1])
    c.dispatch(event())
    def ignored():
        with tasks.db() as db:return bool(db.execute("SELECT 1 FROM qq_events WHERE state='ignored'").fetchone())
    wait_for(ignored);assert not responses


def test_native_qq_face_labels_are_decoded_without_claiming_visual_access():
    from app.qq_images import readable_faces
    value=readable_faces('<faceType=6,faceId="0",ext="eyJ0ZXh0IjoiW+eIseS6hueIseS6hl0ifQ==">')
    assert '[爱了爱了]' in value and '未获得图片' in value
    assert '未提供可读名称' in readable_faces('<faceType=3,faceId="480",ext="bad">')
    assert readable_faces('正常文字')=='正常文字'


def test_recent_sticker_context_is_same_speaker_and_bounded(channel):
    from app.qq_images import recent_media
    c,tasks=channel;scope=json.dumps(['app','groups','room','alice'])
    c.chat.groups.record('face-one',scope,'<faceType=3,faceId="451",ext="eyJ0ZXh0Ijoi6ImyIn0=">')
    assert '名称：色' in recent_media(tasks,scope,time.time())
    assert recent_media(tasks,json.dumps(['app','groups','room','bob']),time.time())==''
    assert recent_media(tasks,scope,time.time()+181)==''


def test_recognized_attachment_does_not_also_claim_its_image_is_unavailable():
    from app.qq_images import readable_faces
    raw='<faceType=6,faceId="0",ext="eyJ0ZXh0IjoiIn0=">\n[图片识别资料，仅供理解]\n柴犬特写\n[/图片识别资料]'
    text=readable_faces(raw)
    assert '图像内容见下方识别资料' in text and '柴犬特写' in text
    assert '未提供可读名称或图片' not in text
