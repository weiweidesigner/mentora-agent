import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import threading

from app.streamviz_files import HtmlRenderEvents,HtmlRenderStream,channel_path

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'app/skills/streamviz/scripts/render_streamviz.py'


def test_registered_renderer_command_emits_real_chunks_and_preserves_final_file(tmp_path,monkeypatch):
    output=ROOT/'outputs/generated/streamviz-file-test.html'
    payload=tmp_path/'payload.json'
    payload.write_text(json.dumps(dict(title='Fixture',html='<section>Actual verified input</section>')))
    events=HtmlRenderEvents(ROOT,'file-test-'+str(tmp_path))
    env={**os.environ,'MENTORA_STREAMVIZ_EVENTS':str(events.path)}
    try:
        result=subprocess.run([sys.executable,'app/skill_runner.py','execute','--script','render_streamviz.py','--',
            '--input',str(payload),'--output',str(output)],cwd=ROOT,env=env,text=True,capture_output=True,check=True)
        assert json.loads(result.stdout)['ok'] is True
        received=list(events.poll());chunks=[d for _,d in received if 'delta' in d]
        assert len(chunks)>=3 and chunks[0]['reset'] is True
        assert 'Actual verified input' in chunks[1]['delta']
        assert all(d['final'] is False for d in chunks)
        assert received[-1][1]['final'] is True
        assert ''.join(d['delta'] for d in chunks)==output.read_text()
        assert len({d['id'] for _,d in received})==1
    finally:
        output.unlink(missing_ok=True);events.path.unlink(missing_ok=True)


def test_first_section_arrives_before_later_sections_generate_or_file_commits(tmp_path,monkeypatch):
    spec=importlib.util.spec_from_file_location('streamviz_renderer_qa',SCRIPT)
    renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
    root=tmp_path;output=root/'outputs/generated/report.html';payload=root/'input.json'
    payload.write_text(json.dumps(dict(title='Fixture',blocks=[dict(type='narrative',paragraphs=['real'])])))
    events=HtmlRenderEvents(root,'stream-test')
    monkeypatch.setenv('MENTORA_STREAMVIZ_EVENTS',str(events.path))
    monkeypatch.setattr(sys,'argv',[str(SCRIPT),'--input',str(payload),'--output',str(output)])
    waiting=threading.Event();resume=threading.Event();errors=[]
    def blocks(*args):
        yield '<section>First verified section</section>'
        waiting.set()
        if not resume.wait(3):raise RuntimeError('QA gate timed out')
        yield '<section>Second verified section</section>'
    monkeypatch.setattr(renderer,'iter_blocks',blocks)
    def execute():
        try:renderer.main()
        except BaseException as error:errors.append(error)
    worker=threading.Thread(target=execute);worker.start()
    try:
        assert waiting.wait(2)
        first=list(events.poll())
        assert any('First verified section' in d.get('delta','') for _,d in first)
        assert not any(d.get('final') for _,d in first)
        assert not output.exists()
    finally:resume.set();worker.join(3)
    assert not errors and not worker.is_alive()
    last=list(events.poll());assert last[-1][1]['final'] is True
    assert 'Second verified section' in output.read_text()


def test_channels_ignore_old_events_and_other_sessions_and_incomplete_lines(tmp_path,monkeypatch):
    output=tmp_path/'outputs/generated/report.html'
    path=channel_path(tmp_path,'one');monkeypatch.setenv('MENTORA_STREAMVIZ_EVENTS',str(path))
    old=HtmlRenderStream(output,'old');old.append('<p>Old</p>');old.finish();old.close()
    one=HtmlRenderEvents(tmp_path,'one');other=HtmlRenderEvents(tmp_path,'two')
    stream=HtmlRenderStream(output,'new');stream.append('<p>New</p>');stream.close()
    assert not list(other.poll())
    items=list(one.poll());assert len(items)==1 and items[0][1]['delta']=='<p>New</p>'
    event=dict(id=stream.id,output=str(output),delta='extra',final=False)
    raw=json.dumps(event).encode()
    with path.open('ab') as f:f.write(raw[:12])
    assert not list(one.poll())
    with path.open('ab') as f:f.write(raw[12:]+b'\n')
    assert list(one.poll())[0][1]['delta']=='extra'


def test_failure_discards_partial_preview_and_rejects_non_generated_paths(tmp_path,monkeypatch):
    events=HtmlRenderEvents(tmp_path,'failure');monkeypatch.setenv('MENTORA_STREAMVIZ_EVENTS',str(events.path))
    outside=HtmlRenderStream(tmp_path/'private.html','private');outside.append('hidden');outside.finish();outside.close()
    assert not list(events.poll())
    stream=HtmlRenderStream(tmp_path/'outputs/generated/report.html','broken');stream.append('<h1>Partial</h1>');stream.close(failed=True)
    received=list(events.poll());assert received[-1][1]['discard'] is True
    assert received[-1][1]['final'] is True
