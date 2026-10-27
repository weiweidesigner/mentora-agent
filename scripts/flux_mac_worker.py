#!/usr/bin/env python3
"""Loopback-only authenticated transport for the installed local FLUX runner."""
import argparse
import base64
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
from pathlib import Path
import signal
import subprocess
import tempfile
import threading

PNG=b'\x89PNG\r\n\x1a\n'
LIMIT=12*1024*1024


def stop(process):
    if process.poll() is not None:return
    try:os.killpg(process.pid,signal.SIGTERM)
    except ProcessLookupError:return
    try:process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        try:os.killpg(process.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        process.wait()


class Worker(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,address,runner,token,timeout=900):
        self.runner=Path(runner).resolve();self.token=token;self.timeout=timeout
        self.generation_lock=threading.Lock()
        self.progress_lock=threading.Lock();self.progress={}
        super().__init__(address,Handler)


class Handler(BaseHTTPRequestHandler):
    def reply(self,code,payload):
        data=json.dumps(payload).encode()
        self.send_response(code);self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(data)));self.end_headers()
        try:self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError):pass

    def do_GET(self):
        if self.path.startswith('/progress/'):
            if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+self.server.token):return self.reply(401,{'error':'Unauthorized'})
            job=self.path.removeprefix('/progress/')
            with self.server.progress_lock:progress=dict(self.server.progress)
            if not job or progress.pop('jobId',None)!=job:return self.reply(404,{'error':'Not found'})
            return self.reply(200,progress)
        if self.path!='/health':return self.reply(404,{'error':'Not found'})
        ready=self.server.runner.is_file() and os.access(self.server.runner,os.X_OK)
        self.reply(200 if ready else 503,{'ready':ready,'busy':self.server.generation_lock.locked(),'model':'FLUX.2 [klein] 4B','progressSupported':True})

    def do_POST(self):
        if self.path!='/generate':return self.reply(404,{'error':'Not found'})
        if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+self.server.token):
            return self.reply(401,{'error':'Unauthorized'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=LIMIT:raise ValueError()
            self.connection.settimeout(15)
            data=json.loads(self.rfile.read(length))
            prompt=data['prompt'];height,width=map(int,data.get('size','512x512').split('x'))
            steps=data.get('steps',4);seed=data.get('seed',42)
            job=data.get('job_id','')
            if not isinstance(job,str) or job and not re.fullmatch(r'[a-f0-9]{32}',job):raise ValueError()
            if not isinstance(prompt,str) or not prompt.strip() or len(prompt)>4000:raise ValueError()
            if min(height,width)<256 or height%16 or width%16 or height*width>1024*1024:raise ValueError()
            if type(steps) is not int or not 1<=steps<=4 or type(seed) is not int or not 0<=seed<2**31:raise ValueError()
            reference=base64.b64decode(data['input_image'],validate=True) if data.get('input_image') else None
        except (ValueError,TypeError,KeyError,AttributeError,TimeoutError):
            return self.reply(400,{'error':'Invalid generation parameters'})
        if not self.server.generation_lock.acquire(blocking=False):
            return self.reply(409,{'error':'Image worker is busy; retry after the current generation'})
        try:
            with self.server.progress_lock:self.server.progress=dict(jobId=job,phase='flux-model',message='正在加载绘图模型',progressPct=0)
            with tempfile.TemporaryDirectory(prefix='mentora-flux-job-') as temp:
                output=Path(temp)/'result.png'
                command=[str(self.server.runner),prompt,'--size',f'{height}x{width}','--steps',str(steps),'--seed',str(seed),'--output',str(output)]
                if reference:
                    source=Path(temp)/'reference.png';source.write_bytes(reference)
                    command+=['--input-image',str(source)]
                log=Path(temp)/'runner.log'
                diagnostics=log.open('wb')
                try:process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=diagnostics,start_new_session=True)
                except BaseException:
                    diagnostics.close();raise
                try:
                    import time
                    deadline=time.monotonic()+self.server.timeout
                    while True:
                        remaining=deadline-time.monotonic()
                        if remaining<=0:raise subprocess.TimeoutExpired(command,self.server.timeout)
                        try:
                            process.communicate(timeout=min(.5,remaining));break
                        except subprocess.TimeoutExpired:
                            progress=step_progress(log.read_bytes()[-65536:].decode('utf-8','replace'),steps)
                            if progress:
                                with self.server.progress_lock:self.server.progress=dict(jobId=job,**progress)
                except subprocess.TimeoutExpired:
                    stop(process);return self.reply(504,{'error':'Local generation timed out'})
                finally:
                    stop(process)
                    diagnostics.close()
                if process.returncode!=0 or not output.is_file():
                    self.log_error('Local FLUX runtime exited with code %s',process.returncode)
                    return self.reply(502,{'error':'Local FLUX runner failed; check worker logs'})
                image=output.read_bytes()
                if not image.startswith(PNG):return self.reply(502,{'error':'Runner did not return PNG'})
                with self.server.progress_lock:self.server.progress=dict(jobId=job,phase='flux-transfer',message='图片已生成，正在传输资源',progressPct=100)
                self.reply(200,{'image':base64.b64encode(image).decode()})
        except OSError:
            self.reply(503,{'error':'Local FLUX runtime unavailable'})
        finally:self.server.generation_lock.release()


def step_progress(text,steps):
    """Only accept the unlabelled inference tqdm, never weight/download bars."""
    matches=re.findall(r'(?:^|[\r\n])\s*\d+%\|[^\r\n]*?\|\s*(\d+)/(\d+)\s*\[',text)
    valid=[int(done) for done,total in matches if int(total)==steps and 0<=int(done)<=steps]
    if not valid:return None
    done=max(valid)
    return dict(phase='flux-decode' if done==steps else 'flux-denoise',
                message='推理已完成，正在解码图片' if done==steps else f'正在生成图像细节 · {done}/{steps} 步',
                progressPct=round(done/steps*100),completedSteps=done,totalSteps=steps,progressKind='denoising-steps')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runner',type=Path,required=True)
    parser.add_argument('--token-file',type=Path,required=True)
    parser.add_argument('--port',type=int,default=8766)
    args=parser.parse_args();token=args.token_file.read_text().strip()
    if not token:parser.error('Token file must not be empty')
    with Worker(('127.0.0.1',args.port),args.runner,token) as server:server.serve_forever()


if __name__=='__main__':main()
