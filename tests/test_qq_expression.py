import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest
from app.qq_expression import QQExpressionRouter,sticker_catalog
from app.qq_chat import QQChat
from app.day_tasks import DayTasks


@pytest.fixture
def router(monkeypatch):
    monkeypatch.setenv('LAYA_DECISION_URL','http://127.0.0.1:8791/predict')
    class Client:
        modes=('voice',.96,'add',.94,'heart',.9)
        def __init__(self,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def system_one(self,**kwargs):
            m,c,r,rc,s,sc=self.modes
            def answer(choice,p,others):return SimpleNamespace(choice=choice,confidence=p,probabilities={choice:p,others:1-p})
            answers={'fit':SimpleNamespace(probabilities={'match':.95 if kwargs['questions'].get('fit') and '双手比心' in kwargs['questions']['fit'].criteria['match'] else .2}), 'delivery':answer(m,c,'text' if m=='voice' else 'voice'),'reaction':answer(r,rc,'none' if r=='add' else 'add'),'sticker':answer(s,sc,'snuggle')}
            return SimpleNamespace(model='local-laya',answers={key:answers[key] for key in kwargs['questions']})
    monkeypatch.setitem(sys.modules,'app.laya_client',SimpleNamespace(LocalLayaClient=Client,Choice=lambda **kwargs:SimpleNamespace(**kwargs)))
    return QQExpressionRouter(draw=lambda:0),Client


def test_semantic_voice_and_catalog_reaction_with_real_scores(router):
    active,_=router
    plan=active.route('抱抱我嘛','抱抱你',[],sticker_catalog())
    assert plan['mode']=='voice' and plan['confidence']==.96
    assert plan['sticker']=='heart' and plan['stickerConfidence']==.95
    assert plan['source']=='local-jev-laya'


def test_formal_text_has_no_sticker(router):
    active,client=router;client.modes=('text',.99,'none',.98,'heart',.9)
    plan=active.route('请列出今天指数数据','正式数据',[],sticker_catalog())
    assert plan['mode']=='text' and plan['sticker'] is None


def test_low_confidence_does_not_force_voice_or_stickers(router):
    active,client=router;client.modes=('voice',.55,'add',.6,'heart',.9)
    plan=active.route('普通问题','普通回答',[],sticker_catalog())
    assert plan['mode']=='text' and plan['sticker'] is None and plan['confidence']==.55


def test_missing_model_or_invalid_score_falls_back_without_inventing_confidence(router,monkeypatch):
    active,client=router;client.modes=('voice',float('nan'),'add',.99,'heart',.99)
    assert active.route('问题','回答',[],[])['confidence'] is None
    monkeypatch.delenv('LAYA_DECISION_URL')
    assert active.route('问题','回答',[],[])['mode']=='text'


def test_original_catalog_assets_exist_and_are_png():
    assets=sticker_catalog()
    assert len(assets)==12 and len({x['id'] for x in assets})==12
    root=Path('app/static/assets/qq-fish')
    for item in assets:
        assert (root/item['file']).read_bytes().startswith((b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff'))


@pytest.mark.parametrize('voice_ok',[True,False])
def test_contextual_voice_is_exclusive_with_text_fallback_and_no_ack(tmp_path,monkeypatch,voice_ok):
    tasks=DayTasks(tmp_path,lambda *a:{})
    texts,voices,images=[],[],[]
    client=SimpleNamespace(reply=lambda *a,**k:texts.append(a[-1]),image_reply=lambda *a,**k:images.append(a[-1]))
    chat=QQChat(tasks,client,lambda *a:{'interpretation':'抱抱你呀'})
    plan={'mode':'voice','confidence':.98,'sticker':'heart','stickerConfidence':.94}
    monkeypatch.setattr(chat.expression,'route',lambda *a,**k:plan)
    monkeypatch.setattr(chat.voice,'enabled',lambda scope:True)
    def send(*a):
        voices.append(True)
        if not voice_ok:raise RuntimeError('offline')
        return True
    monkeypatch.setattr(chat.voice,'send',send)
    chat.enqueue('event','scope','users','target','mid','抱抱我嘛')
    chat.pool.shutdown(wait=True)
    assert voices==[True]
    assert texts==([] if voice_ok else ['抱抱你呀'])
    assert len(images)==1
    assert '置信度' not in ''.join(texts) and '正在调用' not in ''.join(texts)
    with tasks.db() as db:
        stored=json.loads(db.execute('SELECT payload FROM qq_expression_decisions').fetchone()[0])
    assert stored['confidence']==.98


def test_formal_reply_does_not_synthesize_or_send_reaction(tmp_path,monkeypatch):
    tasks=DayTasks(tmp_path,lambda *a:{})
    sent=[]
    chat=QQChat(tasks,SimpleNamespace(reply=lambda *a,**k:sent.append(a[-1])),lambda *a:{'interpretation':'正式答复'})
    monkeypatch.setattr(chat.expression,'route',lambda *a,**k:{'mode':'text','confidence':.99,'sticker':None})
    monkeypatch.setattr(chat.voice,'enabled',lambda scope:True)
    monkeypatch.setattr(chat.voice,'send',lambda *a:pytest.fail('formal answer must not synthesize'))
    chat.enqueue('event','scope','users','target','mid','请正式答复')
    chat.pool.shutdown(wait=True)
    assert sent==['正式答复']


def test_sticker_probability_zero_disables_and_higher_values_allow_more(router):
    active,_=router
    assert active.route('贴贴','贴贴',[],sticker_catalog(),sticker_probability=0)['sticker'] is None
    active.draw=lambda:80
    assert active.route('贴贴','贴贴',[],sticker_catalog(),sticker_probability=50)['sticker'] is None
    assert active.route('贴贴','贴贴',[],sticker_catalog(),sticker_probability=100)['sticker']=='heart'


def test_equally_fitting_installed_stickers_do_not_cancel_each_other(router):
    active,_=router
    catalog=[{'id':'selected-one','description':'双手比心，亲切表达喜欢'},
             {'id':'selected-two','description':'双手比心，表达开心和喜欢'}]
    plan=active.route('大肥鱼，我喜欢你','爸爸，我也喜欢和你聊天呀',[],catalog,sticker_probability=100)
    assert plan['sticker'] in {x['id'] for x in catalog}
    assert plan['stickerConfidence']==.95
    assert len(plan['stickerFitScores'])==2
