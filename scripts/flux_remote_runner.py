#!/usr/bin/env python3
"""Runner-compatible client for the Mac FLUX worker; saves PNG on the web host."""
import argparse
import base64
import json
import os
import http.client
import socket
import threading
import uuid
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import URLError,HTTPError
from urllib.parse import urlsplit


def check_health(endpoint):
    try:
        with urlopen(endpoint+'/health',timeout=5) as response:health=json.load(response)
    except (OSError,ValueError):raise SystemExit('Mac 生图节点离线或隧道超时，请检查生图连接')
    if not isinstance(health,dict) or not health.get('ready'):raise SystemExit('Mac 生图节点尚未就绪，请检查本地运行组件')
    if health.get('busy'):raise SystemExit('Mac 生图节点正在处理其他图片，请稍后重试')

def main():
    p=argparse.ArgumentParser();p.add_argument('prompt');p.add_argument('--size',default='512x512');p.add_argument('--steps',type=int,default=4);p.add_argument('--seed',type=int,default=42);p.add_argument('--output',type=Path,required=True);p.add_argument('--input-image',type=Path)
    args=p.parse_args()
    token=Path(os.environ['MENTORA_FLUX_TOKEN_FILE']).read_text().strip()
    job=uuid.uuid4().hex
    payload=dict(prompt=args.prompt,size=args.size,steps=args.steps,seed=args.seed,job_id=job)
    if args.input_image:payload['input_image']=base64.b64encode(args.input_image.read_bytes()).decode()
    endpoint=os.getenv('MENTORA_FLUX_URL','http://127.0.0.1:18766').rstrip('/')
    check_health(endpoint)
    stopped=threading.Event()
    def poll_progress():
        path=os.environ.get('MENTORA_FLUX_PROGRESS_FILE')
        if not path:return
        while not stopped.wait(.4):
            try:
                request=Request(endpoint+'/progress/'+job,headers={'Authorization':'Bearer '+token})
                with urlopen(request,timeout=2) as response:state=json.load(response)
                percent=state.get('progressPct')
                if type(percent) not in (int,float) or not 0<=percent<=100:continue
                safe={key:state[key] for key in ('phase','message','progressPct','completedSteps','totalSteps','progressKind') if key in state}
                target=Path(path);temporary=target.with_suffix('.tmp')
                temporary.write_text(json.dumps(safe));temporary.replace(target)
            except (OSError,ValueError,TypeError):pass
    thread=threading.Thread(target=poll_progress,daemon=True);thread.start()
    url=urlsplit(endpoint)
    if url.scheme not in {'http','https'}:raise SystemExit('Mac 生图节点地址配置无效')
    connection=(http.client.HTTPSConnection if url.scheme=='https' else http.client.HTTPConnection)(url.hostname,url.port,timeout=5)
    try:
        connection.connect()
        connection.sock.settimeout(930)
        connection.request('POST',url.path.rstrip('/')+'/generate',body=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        response=connection.getresponse()
        if response.status==409:raise SystemExit('Mac 生图节点正在处理其他图片，请稍后重试')
        if response.status==504:raise SystemExit('Mac 生图服务生成超时，请稍后重试')
        if response.status!=200:raise SystemExit(f'Mac 生图服务返回 {response.status}，请检查本地运行组件')
        result=json.loads(response.read(20*1024*1024))
    except socket.timeout:raise SystemExit('Mac 生图节点连接或生成超时，请稍后重试')
    except (OSError,http.client.HTTPException):raise SystemExit('Mac 生图节点离线，请确认 Mac 已开机并连接网络')
    finally:
        stopped.set();thread.join(timeout=3);connection.close()
    image=base64.b64decode(result['image'],validate=True)
    if not image.startswith(b'\x89PNG\r\n\x1a\n'):raise SystemExit('Mac 未返回有效 PNG')
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_bytes(image)

if __name__=='__main__':main()
