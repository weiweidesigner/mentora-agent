#!/usr/bin/env python3
"""Authenticated loopback-only TradingView screener node, reached via SSH."""
import argparse
import hmac
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.stock_screening import tradingview_screen
from pydantic import ValidationError

class Handler(BaseHTTPRequestHandler):
    def reply(self,status,payload):
        body=json.dumps(payload,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)

    def do_GET(self):
        if self.path!='/health':return self.reply(404,{'error':'not found'})
        return self.reply(200,{'ready':True,'provider':'tradingview','mode':'read-only'})

    def do_POST(self):
        if self.path!='/screen':return self.reply(404,{'error':'not found'})
        if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+self.server.token):return self.reply(401,{'error':'unauthorized'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=64000:raise ValueError('invalid body')
            arguments=json.loads(self.rfile.read(length))
            return self.reply(200,tradingview_screen(arguments))
        except (ValidationError,ValueError,TypeError):return self.reply(400,{'error':'invalid screener arguments'})
        except Exception:return self.reply(502,{'error':'TradingView query unavailable'})

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--token-file',type=Path,required=True);parser.add_argument('--port',type=int,default=8767)
    args=parser.parse_args();server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    server.token=args.token_file.read_text().strip()
    if len(server.token)<32:raise SystemExit('screener node token is missing')
    server.serve_forever()
