"""Serve staged real-bundle StreamViz QA, with no model/API/account calls.
Run: python3 tests/fixtures/streamviz_live_server.py
Each button sends one real visualization event; pause before completion to
verify iframe content, then inspect the frame-identity result after completion.
"""
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SOURCE=(ROOT/'app/static/app.js').read_text()
def function(name):
    start=SOURCE.index('function '+name+'(')
    end=SOURCE.index('window.addEventListener("aime:streamviz-followup"',start) if name=='upsertStreamVisualization' else SOURCE.find('\nfunction ',start+1)
    return SOURCE[start:end]
PAGE='''<!doctype html><html lang="zh-CN" data-theme="dark"><head><meta charset="utf-8"><title>StreamViz 增量验证</title><link rel="stylesheet" href="/app/static/vendor/streamviz/streamviz.css"><style>body{margin:0;padding:24px;background:#141414;color:#eee;font:16px system-ui}main{max-width:1000px;margin:auto}button{padding:10px;margin:4px;background:#333;color:white;border:1px solid #777;border-radius:6px}output{display:block;padding:12px 0;font-size:14px;color:#a8d8c5}.streamvizArtifactHost{width:100%;min-width:0}iframe{max-width:100%}</style></head><body><main><h2>StreamViz 真实增量验证</h2><p>第一段和第二段都不会发送完成事件。</p><button id="first">1 · 第一段</button><button id="second">2 · 第二段</button><button id="finish">3 · 完成</button><button id="reset">重置</button><button id="theme">切换主题</button><output id="result">等待第一段</output><article class="message assistant" data-thinking-state="active"><div class="finalAnswer"></div></article></main><script type="module" src="/app/static/vendor/streamviz/streamviz.js"></script><script>'''
BOOT='''
const article=document.querySelector('article');
window.streamVisualizationLane=()=>document.querySelector('.finalAnswer');
window.isNearBottom=()=>false;window.keepScrollPosition=()=>{};
window.createStreamVisualizationArtifact=()=>{throw Error('Unexpected full-artifact fallback')};
let firstFrame=null,phase='waiting';
const result=document.querySelector('#result');
window.addEventListener('message',event=>{
 const frame=document.querySelector('iframe');if(event.source!==frame?.contentWindow)return;
 if(event.data?.type==='visualize-widget:rendered'&&event.data.hasContent){
  if(!firstFrame)firstFrame=frame;
  result.textContent=`阶段：${phase}；已有可见内容；同一 iframe：${firstFrame===frame}；数量：${document.querySelectorAll('iframe').length}`;
 }
});
const prefix='<style>.qa-card{padding:24px;border:1px solid #666;border-radius:8px;margin:12px 0;color:var(--sv-text-primary)}</style><section class="qa-card"><h2>第一段已显示</h2><p>尚未发送 final，真实内容已进入预览。</p></section>';
const suffix='<section class="qa-card"><h2>第二段已追加</h2><svg width="240" height="80" viewBox="0 0 240 80"><rect width="160" height="30" y="5" fill="#61b59a"/><rect width="220" height="30" y="45" fill="#aa8fd6"/></svg></section>';
const escaped=text=>JSON.stringify(text).slice(1,-1);
document.querySelector('#first').onclick=()=>{phase='生成中（第一段）';queue({id:'qa',reset:true,native:true,argumentDelta:'{"title":"增量预览","widget_code":"'+escaped(prefix),final:false});};
document.querySelector('#second').onclick=()=>{phase='生成中（第二段）';queue({id:'qa',native:true,argumentDelta:escaped(suffix),final:false});};
document.querySelector('#finish').onclick=()=>{phase='已完成';queue({id:'qa',native:true,argumentDelta:'"}',final:true});};
document.querySelector('#reset').onclick=()=>{const host=document.querySelector('.streamvizArtifactHost');if(host){window.AimeStreamViz.unmount(host);host.remove();}firstFrame=null;phase='waiting';result.textContent='等待第一段';};
document.querySelector('#theme').onclick=()=>{const mode=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=mode;document.body.style.background=mode==='dark'?'#141414':'#fafafa';document.body.style.color=mode==='dark'?'#eee':'#222';window.dispatchEvent(new Event('aime:theme-change'));};
function queue(data){upsertStreamVisualization(article,data);}
'''
PAGE+=function('mountStreamVisualization')+function('upsertStreamVisualization')+BOOT+'</script></body></html>'
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_GET(self):
        if self.path=='/':
            body=PAGE.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else:super().do_GET()
    def log_message(self,*args):pass
if __name__=='__main__':
    print('StreamViz QA: http://127.0.0.1:8786/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8786),Handler).serve_forever()
