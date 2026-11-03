import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize('fails',[False,True])
def test_rebuild_preserves_identity_and_recovers_old_song_on_failed_conversion(tmp_path,monkeypatch,fails):
    spec=importlib.util.spec_from_file_location('rebuild','scripts/rebuild_singing_catalog.py')
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    original={'id':'song','title':'歌','vocal':'old.wav','seconds':20,'aliases':['点歌别名']}
    registry=tmp_path/'catalog.json';registry.write_text(json.dumps({'songs':[original],'voices':[]}))
    token=tmp_path/'token';token.write_text('private-test-token');monkeypatch.setenv('SINGING_TOKEN_FILE',str(token))
    manifest=tmp_path/'rebuild.json';manifest.write_text(json.dumps({'songs':[{'id':'song','input':str(tmp_path/'original.mp3')}]}))
    def register(command,**kwargs):
        assert '--seconds' not in command and '--start' not in command
        stage=Path(command[command.index('--root')+1]);(stage/'songs/song').mkdir(parents=True)
        (stage/'songs/song/vocal.wav').write_bytes(b'full source')
        (stage/'catalog.json').write_text(json.dumps({'songs':[{'id':'song','title':'歌','vocal':'songs/song/vocal.wav','seconds':254.59}]}))
    def post(*args,**kwargs):
        assert kwargs['json']=={'songId':'song'}
        def check():
            if fails:raise RuntimeError('conversion unavailable')
        return SimpleNamespace(status_code=200,raise_for_status=check,content=b'\x02#!SILK_V3full',headers={'X-Audio-Duration':'254.59'})
    monkeypatch.setattr(m.subprocess,'run',register);monkeypatch.setattr(m.requests,'post',post)
    monkeypatch.setattr('sys.argv',['rebuild','--root',str(tmp_path),'--manifest',str(manifest)])
    if fails:
        with pytest.raises(SystemExit):m.main()
        assert json.loads(registry.read_text())['songs'][0]==original
    else:
        m.main();song=json.loads(registry.read_text())['songs'][0]
        assert song['seconds']==254.59 and song['aliases']==original['aliases']
        monkeypatch.setattr(m.requests,'post',lambda *a,**k:pytest.fail('finished conversion repeated'))
        m.main()
