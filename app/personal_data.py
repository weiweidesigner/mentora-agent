"""Read-only current-user Skill transport. Identity is bound by the chat host."""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import build_opener, ProxyHandler, Request
from app.skill_calls import public_value

ENV_KEY='MENTORA_PERSONAL_DATA_ENDPOINT'

class PersonalDataBridge:
    def __init__(self,service):
        self.service=service;self.lock=threading.Lock();self.owners={};self.tokens={}
        self.server=None;self.thread=None

    def environment(self,owner):
        if not owner:return {}
        with self.lock:
            if self.server is None:
                bridge=self
                class Handler(BaseHTTPRequestHandler):
                    def do_GET(self):
                        parts=self.path.split('/')
                        with bridge.lock:user=bridge.owners.get(parts[1]) if len(parts)==3 else None
                        if not user:self.send_error(403);return
                        if parts[2] not in ('holdings','watchlist'):self.send_error(404);return
                        try:result=bridge.read(user,parts[2])
                        except Exception:
                            self.send_error(503,'Personal data could not be read');return
                        body=json.dumps(result,ensure_ascii=False,allow_nan=False).encode()
                        self.send_response(200);self.send_header('Content-Type','application/json; charset=utf-8')
                        self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)))
                        self.end_headers();self.wfile.write(body)
                    def log_message(self,*args):pass
                self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
                self.thread=threading.Thread(target=self.server.serve_forever,daemon=True,name='personal-data-skills')
                self.thread.start()
            token=self.tokens.get(owner)
            if token is None:
                token=secrets.token_urlsafe(32);self.tokens[owner]=token;self.owners[token]=owner
            return {ENV_KEY:f'http://127.0.0.1:{self.server.server_port}/{token}'}

    def read(self,owner,resource):
        if resource=='holdings':
            from app.portfolio_skills import call
            result={'account':call(self.service,owner,'portfolio-account',{'operation':'read'})}
        elif resource=='watchlist':result={'items':self.service.workflow.favorites(owner)}
        else:raise ValueError('Unsupported personal data resource')
        return dict(resource=resource,asOf=dt.datetime.now(dt.timezone.utc).isoformat(),
                    source='Mentora Deal',mode='paper',**public_value(result))

    def close(self):
        if self.server:
            self.server.shutdown();self.server.server_close();self.thread.join(timeout=2)
            self.server=None
        self.owners.clear();self.tokens.clear()


def read_current_user(resource):
    if resource not in ('holdings','watchlist'):raise ValueError('Unsupported personal data resource')
    endpoint=os.getenv(ENV_KEY,'')
    if not endpoint:raise RuntimeError('当前运行未绑定用户身份，无法读取个人数据；请在已登录的会话中重试。')
    # This endpoint is supplied by the host, never by model arguments. Ignore
    # outbound web proxies: personal data only crosses this local read bridge.
    try:
        with build_opener(ProxyHandler({})).open(Request(endpoint+'/'+resource),timeout=30) as response:
            return json.load(response)
    except Exception:
        raise RuntimeError('当前用户的个人数据读取失败；不能据此声称空仓或没有自选，请稍后重试。') from None


def main(resource):
    parser=argparse.ArgumentParser(description='读取当前会话用户的'+('持仓（Mentora模拟账户）' if resource=='holdings' else '自选股票')+'；只读，不接收用户身份或交易参数。')
    parser.parse_args()
    try:result=read_current_user(resource)
    except RuntimeError as exc:
        print(json.dumps({'ok':False,'error':str(exc)},ensure_ascii=False));return 2
    print(json.dumps(result,ensure_ascii=False));return 0
