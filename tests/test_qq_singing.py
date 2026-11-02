import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import time

import pytest

from app.qq_singing import save,validate,receipt_from_event,context
from app.qq_voice import QQVoice
from app.day_tasks import DayTasks


@pytest.fixture
def singing(tmp_path,monkeypatch):
    monkeypatch.setenv('QQ_SINGING_TOKEN','test-only-secret')
    monkeypatch.setenv('VEYA_DAY_DATA_DIR',str(tmp_path))
    monkeypatch.setenv('QQ_SINGING_ENDPOINT','http://127.0.0.1:18769')
    key='a'*32;audio=b'\x02#!SILK_V3'+b'test song bytes'
    data=save(audio,delivery_key=key,song={'id':'twinkle','title':'小星星（英文清唱）'},voice_id='companion',duration=20)
    return SimpleNamespace(root=tmp_path/'qq-voice',receipt=data,key=key,audio=audio)


def test_receipt_cannot_be_forged_replayed_or_redirected(singing):
    s=singing
    assert validate(s.receipt,s.key)
    assert validate(s.receipt,'b'*32) is None
    assert validate({**s.receipt,'title':'另一首歌'},s.key) is None
    assert validate({**s.receipt,'id':'../../etc/passwd'},s.key) is None
    path=s.root/(s.receipt['id']+'.silk');path.write_bytes(b'\x02#!SILK_V3tampered')
    assert validate(s.receipt,s.key) is None


def test_only_completed_tool_receipts_produce_audio(singing):
    s=singing
    output=json.dumps({'ok':True,'observation':{'type':'singing-result','qqSong':s.receipt}})
    assert receipt_from_event({'phase':'completed','observation':output},s.key)==s.receipt
    assert receipt_from_event({'phase':'started','observation':output},s.key) is None
    assert receipt_from_event({'phase':'completed','thought':output},s.key) is None
    assert receipt_from_event({'phase':'completed','observation':output},'b'*32) is None


def test_expired_receipt_and_invalid_audio_are_rejected(singing,monkeypatch):
    s=singing
    monkeypatch.setattr('app.qq_singing.time.time',lambda:s.receipt['created']+901)
    assert validate(s.receipt,s.key) is None
    with pytest.raises(ValueError):save(b'not audio',delivery_key=s.key,song={'id':'x','title':'x'},voice_id='companion',duration=20)


def test_singing_uses_qq_media_without_breeze_or_voice_preference(singing,tmp_path,monkeypatch):
    s=singing;tasks=DayTasks(tmp_path,lambda *a:{})
    sends=[];voice=QQVoice(tasks,SimpleNamespace(voice_reply=lambda *a,**kw:sends.append((a,kw))))
    monkeypatch.delenv('QQ_BREEZE_ENDPOINT',raising=False)
    job={'kind':'users','target':'alice','message_id':'mid','created':time.time()}
    assert voice.send_song(job,s.receipt)
    assert len(sends)==1 and sends[0][0][-1].endswith(s.receipt['id']+'.silk')
    assert not voice.send_song({**job,'created':time.time()-3600},s.receipt)


@pytest.mark.parametrize('reply_text',['给你唱一段小星星。',''])
def test_qq_chat_delivers_generated_song_without_narrating_the_reply(singing,tmp_path,monkeypatch,reply_text):
    from app.qq_chat import QQChat
    tasks=DayTasks(tmp_path,lambda *a:{})
    voices=[];texts=[]
    client=SimpleNamespace(voice_reply=lambda *a,**kw:voices.append(a[-1]),reply=lambda *a,**kw:texts.append(a[-1]))
    chat=QQChat(tasks,client,lambda *a:{'interpretation':reply_text,'qqSong':singing.receipt})
    monkeypatch.setattr(chat.expression,'route',lambda *a,**kw:{'mode':'text','sticker':None})
    monkeypatch.setattr(chat.voice,'send',lambda *a:pytest.fail('Singing must not use Breeze TTS'))
    chat.enqueue('sing-request','scope','users','alice','mid','唱小星星')
    chat.pool.shutdown(wait=True)
    assert len(voices)==1 and not texts
    with tasks.db() as db:
        row=db.execute('SELECT delivered FROM qq_chat_jobs').fetchone();assert row[0]==1
        plan=json.loads(db.execute('SELECT payload FROM qq_expression_decisions').fetchone()[0]);assert plan['deliveredMode']=='singing'


def test_singing_tool_lists_then_renders_only_real_catalog_songs(singing,tmp_path,monkeypatch):
    path=Path('app/skills/singing/scripts/singing_render.py')
    spec=importlib.util.spec_from_file_location('singing_render',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    catalog={'ready':True,'songs':[{'id':'twinkle','title':'小星星'}],'voices':[{'id':'companion'}]}
    monkeypatch.setattr(module.requests,'get',lambda *a,**kw:SimpleNamespace(status_code=200,json=lambda:catalog))
    posted=[]
    def post(*a,**kw):
        posted.append(kw['json']);return SimpleNamespace(status_code=200,headers={'X-Audio-Duration':'20','X-Singing-Engine':'seed-vc-svc'},iter_content=lambda n:[singing.audio])
    monkeypatch.setattr(module.requests,'post',post)
    output=tmp_path/'song.json'
    monkeypatch.setattr('sys.argv',['singing_render.py','--operation','render','--song-id','twinkle','--delivery-key',singing.key,'--output',str(output)])
    module.main();receipt=json.loads(output.read_text())['qqSong'];assert validate(receipt,singing.key)
    assert posted==[{'songId':'twinkle','voiceId':'companion'}]
    monkeypatch.setattr('sys.argv',['singing_render.py','--operation','render','--song-id','missing','--delivery-key',singing.key,'--output',str(output)])
    with pytest.raises(ValueError,match='尚未加入'):module.main()
    assert len(posted)==1


def test_real_agent_loop_receipt_attaches_but_final_text_cannot_forge_audio(singing,monkeypatch):
    import ast
    from app.character_settings import CharacterProfile
    source=ast.parse(Path('app/presentation.py').read_text())
    fn=next(x for x in source.body if isinstance(x,ast.FunctionDef) and x.name=='run_qq_chat')
    monkeypatch.setattr('secrets.token_hex',lambda n:singing.key)
    calls=[];observations=[{'phase':'completed','observation':json.dumps({'qqSong':singing.receipt})}]
    def events(payload,owner):
        calls.append(payload)
        for row in observations:yield 'tool_step',row
        yield 'final',{'interpretation':'给你唱一段小星星。','qqSong':singing.receipt}
    namespace={'CHARACTERS':SimpleNamespace(for_scope=lambda s:CharacterProfile().model_dump(),memory_context=lambda s:''),
               'character_context':lambda p:'角色设置',
               'DAY_TASKS':SimpleNamespace(execution_preferences=lambda:{}),
               'ChatRequest':lambda **kw:SimpleNamespace(**kw),
               'durable_chat_events':events,'normalize_chat_result':lambda data:dict(data)}
    exec(compile(ast.Module(body=[fn],type_ignores=[]),'<singing-runner>','exec'),namespace)
    result=namespace['run_qq_chat']('scope:0','唱小星星',[])
    assert result['qqSong']==singing.receipt and singing.key in calls[-1].question
    observations.clear()
    result=namespace['run_qq_chat']('scope:0','普通问题',[])
    assert 'qqSong' not in result and len(calls)==2


def test_singing_is_discoverable_by_the_runtime_script_registry():
    import ast
    from dataclasses import make_dataclass
    source=ast.parse(Path('app/main.py').read_text())
    dirs=next(x for x in source.body if isinstance(x,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SKILL_SCRIPT_DIRS' for t in x.targets))
    load=next(x for x in source.body if isinstance(x,ast.FunctionDef) and x.name=='load_module_registry')
    metadata=next(x for x in json.loads(Path('app/module_registry.json').read_text()) if x.get('script')=='singing_render.py')
    component=make_dataclass('SingingComponent',['key','label','filename','description'])
    ns={'SKILLS_DIR':Path('app/skills'),'ROOT':Path('.'),'MODULE_REGISTRY_PATH':Path('app/module_registry.json'),
        'AllowedComponent':component,'json':json,'load_registry_data':lambda p:[metadata]}
    exec(compile(ast.Module(body=[dirs,load],type_ignores=[]),'<singing-registry>','exec'),ns)
    assert [c.filename for c in ns['load_module_registry']()]==['singing_render.py']
