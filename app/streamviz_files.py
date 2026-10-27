"""Carry renderer-produced HTML over the existing Harness event loop.

The private channel is scoped to one cached Harness session. Renderers append
real generation events; the gateway tails only bytes written in this turn.
No finished artifact is sliced, replayed, or delayed to simulate generation.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import time
import uuid


def channel_path(root: Path, session: str) -> Path:
    return root/'outputs'/'.streamviz-events'/(hashlib.sha256(session.encode()).hexdigest()+'.jsonl')


class HtmlRenderStream:
    def __init__(self, output: Path, title: str):
        self.output=output.resolve();self.title=title;self.id='html-render:'+uuid.uuid4().hex
        self.handle=None;self.started=False
        raw=os.getenv('MENTORA_STREAMVIZ_EVENTS','')
        if raw:
            path=Path(raw)
            path.parent.mkdir(parents=True,exist_ok=True)
            self.handle=path.open('a',encoding='utf-8')
    def emit(self, **data):
        if self.handle:
            self.handle.write(json.dumps(dict(id=self.id,output=str(self.output),title=self.title,
                emittedAt=time.time(),**data),ensure_ascii=False)+'\n')
            self.handle.flush()
    def append(self, code):
        self.emit(delta=code,reset=not self.started,final=False)
        self.started=True
    def finish(self):self.emit(final=True)
    def close(self, failed=False):
        if self.handle:
            if failed:self.emit(discard=True,final=True)
            self.handle.close()


class HtmlRenderEvents:
    def __init__(self, root: Path, session: str):
        self.path=channel_path(root,session);self.generated=(root/'outputs/generated').resolve()
        self.offset=self.path.stat().st_size if self.path.exists() else 0
        self.pending=b'';self.ids={};self.artifacts=[]
    def poll(self):
        try:
            with self.path.open('rb') as handle:
                handle.seek(self.offset);raw=handle.read();self.offset=handle.tell()
        except FileNotFoundError:return
        lines=(self.pending+raw).split(b'\n');self.pending=lines.pop()
        for line in lines:
            try:
                event=json.loads(line)
                output=Path(event['output']).resolve()
                if output.parent!=self.generated or output.suffix.lower()!='.html':continue
                key=str(event['id']);url='/generated/'+output.name
                if event.get('reset'):self.ids[key]=url
                if self.ids.get(key)!=url:continue
                if event.get('final') and not event.get('discard'):
                    if not output.is_file() or output.stat().st_size<=0:continue
                    self.artifacts.append(dict(url=url,path=str(output),label=event.get('title',''),streamvizSource='generated-html-live'))
                data={k:event[k] for k in ('id','title','delta','reset','final','discard','emittedAt') if k in event}
                yield 'visualization',dict(data,htmlUrl=url,live=True,streamvizSource='generated-html-live')
                if event.get('final'):self.ids.pop(key,None)
            except (ValueError,TypeError,KeyError):continue
