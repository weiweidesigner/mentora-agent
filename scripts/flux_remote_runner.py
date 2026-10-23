#!/usr/bin/env python3
"""Runner-compatible client for the Mac FLUX worker; saves PNG on the web host."""
import argparse
import base64
import json
import os
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import URLError,HTTPError

def main():
    p=argparse.ArgumentParser();p.add_argument('prompt');p.add_argument('--size',default='512x512');p.add_argument('--steps',type=int,default=4);p.add_argument('--seed',type=int,default=42);p.add_argument('--output',type=Path,required=True);p.add_argument('--input-image',type=Path)
    args=p.parse_args()
    token=Path(os.environ['MENTORA_FLUX_TOKEN_FILE']).read_text().strip()
    payload=dict(prompt=args.prompt,size=args.size,steps=args.steps,seed=args.seed)
    if args.input_image:payload['input_image']=base64.b64encode(args.input_image.read_bytes()).decode()
    endpoint=os.getenv('MENTORA_FLUX_URL','http://127.0.0.1:18766').rstrip('/')
    request=Request(endpoint+'/generate',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urlopen(request,timeout=1560) as response:result=json.load(response)
    except HTTPError as exc:raise SystemExit(f'Mac 生图服务返回 {exc.code}，请稍后重试')
    except URLError:raise SystemExit('Mac 生图节点离线，请确认 Mac 已开机并连接网络')
    image=base64.b64decode(result['image'],validate=True)
    if not image.startswith(b'\x89PNG\r\n\x1a\n'):raise SystemExit('Mac 未返回有效 PNG')
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_bytes(image)

if __name__=='__main__':main()
