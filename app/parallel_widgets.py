"""Render agent-authored visual briefs while that agent continues its prose.

Only actual renderer deltas are sent. Text generated concurrently is held in its
original event order until the visual commits; the renderer never writes prose.
"""
from pathlib import Path
import json
import queue
import threading
import time


class ParallelWidgets:
    def __init__(self, generated_dir, *, theme='light', renderer=None):
        self.generated=Path(generated_dir).resolve()
        self.theme=theme;self.renderer=renderer
        self.events=queue.Queue();self.jobs={};self.buffer=[];self.artifacts=[];self.errors=[]
        self.current=None;self.held_events={}
        self.stopped=threading.Event();self.clients={};self.lock=threading.Lock()

    @property
    def active(self):return bool(self.jobs)

    def start(self, call_id, args, receipt):
        if receipt.get('status')!='rendering':return False
        if isinstance(args,str):args=json.loads(args)
        if not isinstance(args,dict) or not isinstance(args.get('brief'),str):raise ValueError('Missing visual brief')
        output=Path(receipt.get('output','')).resolve()
        if output.parent!=self.generated or not output.name.startswith('streamviz-job-') or output.suffix!='.html':
            raise ValueError('Invalid parallel widget output')
        if call_id in self.jobs:return True
        worker=threading.Thread(target=self._run,args=(call_id,args,output),daemon=True,name='streamviz-renderer')
        if self.current is None:self.current=call_id
        else:self.buffer.append(('_render_barrier',call_id))
        self.jobs[call_id]=worker;worker.start();return True

    def _run(self, key, args, output):
        client=None
        try:
            if self.renderer:
                source=self.renderer(args,output)
            else:
                from app.native_streamviz import _client_from_env,stream_native_widget
                client,model=_client_from_env()
                client=client.with_options(timeout=60,max_retries=0)
                with self.lock:
                    if self.stopped.is_set():client.close();return
                    self.clients[key]=client
                source=stream_native_widget('根据以下完整简报生成 HTML；只负责展示，不取数、不补充事实、不撰写后续回答。\n'+args['brief'],self.generated,
                    evidence=args['brief'],theme_mode=self.theme,client_override=client,model_override=model)
            committed=False;final_data=None;saved=None
            for event,data in source:
                if self.stopped.is_set():break
                if event!='visualization':continue
                data={**data,'id':key,'title':args.get('title',''),'native':True,'parallel':True,'emittedAt':time.time()}
                if data.get('final') and not data.get('discard'):
                    url=str(data.get('htmlUrl') or '')
                    saved=self.generated/Path(url).name
                    if not url or saved.parent!=self.generated or not saved.is_file():raise ValueError('Renderer did not commit HTML')
                    final_data=data;committed=True
                    continue
                self.events.put((key,'visualization',data))
            if not self.stopped.is_set():
                if not committed:raise ValueError('Renderer returned no validated HTML')
                saved.replace(output)
                final_data['htmlUrl']='/generated/'+output.name
                self.artifacts.append(dict(url=final_data['htmlUrl'],path=str(output),label=args.get('title',''),streamvizSource='native-streamviz'))
                self.events.put((key,'visualization',final_data))
        except Exception as exc:
            if not self.stopped.is_set():
                self.events.put((key,'visualization',dict(id=key,discard=True,final=True,native=True)))
                self.events.put((key,'_render_error',str(exc)))
        finally:
            if client:
                with self.lock:self.clients.pop(key,None)
                try:client.close()
                except Exception:pass
            self.events.put((key,'_render_done',key))

    def hold(self, events):
        for event,data in events:
            if event in ('answer_text','visualization') and self.active:
                if event=='answer_text':data={**data,'preparedAt':time.time(),'bufferedByVisualization':True}
                self.buffer.append((event,data))
            else:yield event,data

    def drain(self):
        while True:
            try:key,event,data=self.events.get_nowait()
            except queue.Empty:break
            self.held_events.setdefault(key,[]).append((event,data))
        while self.current:
            key=self.current
            rows=self.held_events.pop(key,[])
            done=False
            for event,data in rows:
                if event=='_render_done':done=True
                elif event=='_render_error':self.errors.append(data)
                else:yield event,data
            if self.errors:
                self.buffer.clear()
                raise RuntimeError('可视化生成失败，未交付尚未验证的后续内容。请重试。') from RuntimeError('; '.join(self.errors))
            if not done:break
            self.jobs.pop(key,None);self.current=None
            while self.buffer:
                event,data=self.buffer.pop(0)
                if event=='_render_barrier':
                    self.current=data;break
                yield event,data

    def close(self):
        self.stopped.set();self.buffer.clear()
        with self.lock:clients=list(self.clients.values())
        for client in clients:
            try:client.close()
            except Exception:pass
