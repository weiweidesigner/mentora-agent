import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from app.character_prompt import normalize_character_prompt
from app.character_settings import CharacterProfile, CharacterStore
from app.day_tasks import DayTasks


def test_semantic_cleanup_preserves_style_and_does_not_rewrite_identity():
    profile=CharacterProfile(relationship='sidekick',role='用户的跟班小弟，称呼用户老大',agentPrompt='和爸爸聊天，要温柔，不虚构和爸爸的共同经历。')
    captured=[]
    class Client:
        def __init__(self,**kwargs):self.chat=SimpleNamespace(completions=SimpleNamespace(create=self.create))
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def create(self,**kwargs):
            captured.append(kwargs)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({'expressionPrompt':'语气温柔，不虚构共同经历。'},ensure_ascii=False)))])
    assert normalize_character_prompt(profile,Client)=='语气温柔，不虚构共同经历。'
    state=json.loads(captured[0]['messages'][1]['content'])
    assert state['identity']['role']==profile.role
    assert state['supplementaryPrompt']==profile.agentPrompt
    assert profile.agentPrompt.startswith('和爸爸')


def test_failed_cleanup_is_not_silently_accepted():
    def fail(**kwargs):raise RuntimeError('provider unavailable')
    with pytest.raises(HTTPException) as error:
        normalize_character_prompt(CharacterProfile(agentPrompt='旧身份'),fail)
    assert error.value.status_code==503


def test_normalized_prompt_is_persisted_and_only_identity_or_prompt_changes_reprocess(tmp_path,monkeypatch):
    calls=[]
    def normalize(profile):
        calls.append(profile.model_dump())
        return '语气自然，保留自己的想法。'
    monkeypatch.setattr('app.character_settings.normalize_character_prompt',normalize)
    store=CharacterStore(DayTasks(tmp_path,lambda *a:{}))
    saved=store.save('owner',CharacterProfile(relationship='sidekick',role='跟班小弟',agentPrompt='叫爸爸，但语气自然'))
    assert saved['agentPrompt']=='语气自然，保留自己的想法。'
    assert store.get('owner')['agentPrompt']==saved['agentPrompt']
    store.save('owner',CharacterProfile(**{**saved,'stickerProbability':90}))
    assert len(calls)==1
    store.save('owner',CharacterProfile(**{**saved,'relationship':'mother'}))
    assert len(calls)==2
    def fail(profile):raise HTTPException(503,'not saved')
    monkeypatch.setattr('app.character_settings.normalize_character_prompt',fail)
    with pytest.raises(HTTPException):store.save('owner',CharacterProfile(**{**saved,'role':'另一个身份'}))
    assert store.get('owner')['relationship']=='mother'
    assert store.get('owner')['role']=='跟班小弟'
