import json,threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler,HTTPServer
from playwright.sync_api import sync_playwright
BASE=Path(__file__).parent
ASSETS=BASE if (BASE/'app.js').exists() else BASE.parent/'app/static'
source=(ASSETS/'app.js').read_text();css=(ASSETS/'styles.css').read_text()
core=source[source.index('function orderedStreamFlow('):source.index('window.addEventListener("aime:streamviz-followup"')]
artifact=source[source.index('function createStreamVisualizationArtifact('):source.index('function streamVisualizationLane(')]
compatible=source[source.index('function streamVisualizationCompatible('):source.index('function prepareStreamVisualizationCode(')]
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<html><head></head><body><article><div class="finalAnswer"></div></article></body></html>')
    def log_message(self,*args):pass
server=HTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
bootstrap='''
window.mounts=[];window.fetches=[];window.fallbacks=0;
window.canonicalArtifact=v=>v;
window.sanitizeUserFacingInsight=v=>v;
window.formatInsight=v=>v.split(/\\n\\n/).map(s=>s.startsWith('## ')?'<h2>'+s.slice(3)+'</h2>':'<p>'+s+'</p>').join('');
window.isNearBottom=()=>false;window.keepScrollPosition=()=>{};window.syncInlineActivity=()=>{};
window.guardStreamVisualization=()=>{};window.prepareStreamVisualizationCode=v=>v;
window.streamVisualizationCodeCache=new Map();window.streamVisualizationReplayPlan=()=>null;
window.artifactCode=url=>{fetches.push(url);return Promise.resolve(url.includes('script')?'<html><script>void 0</script></html>':'<html><svg><text>Fixture chart</text></svg></html>')};
window.mountStreamVisualization=(host,data)=>{mounts.push({...data});host.dataset.mounted='true';if(!host.querySelector('iframe')){const frame=document.createElement('iframe');frame.srcdoc='<html><body><svg width="100%" height="160"><rect x="10" y="30" width="80" height="100" fill="#0a8"/><rect x="120" y="70" width="80" height="60" fill="#c35"/><text x="10" y="20">Chart fixture</text></svg></body></html>';frame.style.cssText='width:100%;height:180px;border:0';host.append(frame)}};
window.withArtifactWidgetControl=(node,item)=>{const outer=document.createElement('div');outer.className='chatArtifactShell';outer.dataset.artifactUrl=item.url;outer.append(node);return outer};
window.createArtifactFallbackFrame=(item,index)=>{fallbacks++;const node=document.createElement('div');node.className='reportFrameShell';node.dataset.artifactUrl=item.url;const frame=document.createElement('iframe');frame.srcdoc='<p>Native script fixture</p>';node.append(frame);return node};
window.AimeStreamViz={unmount:()=>{}};
window.completeThinking=()=>{};window.updateThinkingSummary=()=>{};window.copyFor=()=>'';window.mergeSourcesByUrl=()=>[];window.sourcesFromInsightMarkdown=()=>[];
window.buildResultActions=()=>'';window.buildCapabilityBar=()=>'';window.renderFileDeliverables=()=>{};window.attachResultActionHandlers=()=>{};window.syncActivityDrawer=()=>{};window.recordAssistantResult=()=>{};window.scrollToMessageStart=()=>{};window.buildShareSessionForArticle=()=>({});
'''
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
      for theme in ('light','dark'):
        page=browser.new_page(viewport={'width':width,'height':850})
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.add_style_tag(content=css)
        page.add_style_tag(content=':root{--ink:#17202c;--muted:#6d7585;--chat-body-font-size:16px}body{margin:0;padding:20px;background:#fafafa}article{max-width:1200px;margin:auto}[data-theme="dark"]{--ink:#e6edf3;--muted:#94a3b8;background:#111;color:#e6edf3}')
        page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
        page.add_script_tag(content=bootstrap+compatible+artifact+core+source[source.index('function renderFinalAnswer('):source.index('function buildShareSessionForArticle(')])
        page.evaluate('''()=>{
            window.article=document.querySelector('article');
            appendStreamVisualizationModule(article,{htmlUrl:'/generated/a.html',label:'Fixture',path:'/home/ubuntu/outputs/generated/a.html'});
            if(document.querySelector('.finalAnswer').children.length) throw Error('unreferenced tool inventory displayed');
            renderStreamAnswerText(article,{text:'## 分析结论\\n\\n图表应该紧邻这一段说明。\\n\\n[[AIME_CHART:/home/ubuntu/outputs/generated/a.html]]\\n\\n图后的分析继续输出。',final:false});
        }''')
        page.wait_for_selector('.streamChartSlot iframe')
        assert page.evaluate('mounts.some(item=>item.final===true)'),'StreamViz should mount before final text'
        assert page.evaluate("document.querySelector('.streamAnswerPreview').children[1].className==='streamChartSlot'")
        page.evaluate('window.originalFrame=document.querySelector("iframe");window.originalWindow=originalFrame.contentWindow')
        page.evaluate('''()=>{
            const before=mounts.length;
            for(let i=0;i<8;i++)renderStreamAnswerText(article,{text:'## 分析结论\\n\\n图表应该紧邻这一段说明。\\n\\n[[AIME_CHART:/generated/a.html]]\\n\\n图后的分析继续输出。'+i,final:false});
            if(mounts.length!==before||document.querySelector('iframe')!==originalFrame||originalFrame.contentWindow!==originalWindow)throw Error('text update remounted chart');
            appendStreamVisualizationModule(article,{htmlUrl:'/generated/a.html',label:'updated'});
            if(document.querySelectorAll('.streamChartSlot iframe').length!==1)throw Error('duplicate artifact');
        }''')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'page overflow'
        page.screenshot(path=str(BASE/f'inline-{width}-{theme}.png'))
        page.evaluate('''()=>{
            document.querySelector('.finalAnswer').replaceChildren();article.streamAnswerNodes=new Map();delete article.streamAnswerRaw;article.streamVisualizationArtifacts=[];
            renderStreamAnswerText(article,{text:'Before [[AIME_CHART:/generated/late.html]] After',final:false});
            if(!document.querySelector('.streamChartPending'))throw Error('missing pending slot');
            appendStreamVisualizationModule(article,{htmlUrl:'/generated/late.html',label:'late'});
        }''')
        page.wait_for_selector('.streamChartSlot iframe')
        assert not page.locator('.streamChartPending').count()
        page.evaluate('''()=>{
            document.querySelector('.finalAnswer').replaceChildren();article.streamAnswerNodes=new Map();delete article.streamAnswerRaw;article.streamVisualizationArtifacts=[];
            queueStreamVisualization(article,{id:'native',htmlUrl:'/generated/native.html',reset:true,delta:'<svg>',native:true});
            if(!document.querySelector('.streamvizArtifactHost'))throw Error('native stream waits for text');
            window.nativeHost=document.querySelector('.streamvizArtifactHost');window.nativeFrame=nativeHost.querySelector('iframe');window.nativeWindow=nativeFrame.contentWindow;
            renderStreamAnswerText(article,{text:'Before\\n\\n[[AIME_CHART:/generated/native.html]]\\n\\nAfter',final:false});
            queueStreamVisualization(article,{id:'native',delta:'<text>more</text></svg>',native:true,final:true});
            if(document.querySelectorAll('.streamvizArtifactHost').length!==1||document.querySelector('.streamChartSlot .streamvizArtifactHost')!==nativeHost)throw Error('native duplicated on relocation');
            if(nativeHost.streamVisualizationCode!=='<svg><text>more</text></svg>')throw Error('native delta lost');
            if(nativeHost.querySelector('iframe')!==nativeFrame||nativeFrame.contentWindow!==nativeWindow)throw Error('native frame reset');
            renderStreamAnswerText(article,{text:'Before [[AIME_C',final:false});
            if(document.querySelector('.streamAnswerPreview').textContent.includes('[[AIME'))throw Error('partial marker leaked');
            document.querySelector('.finalAnswer').replaceChildren();article.streamVisualizationArtifacts=[];
            renderStreamAnswerText(article,{blockId:'one',delta:'Part one',final:false});
            renderStreamAnswerText(article,{blockId:'two',delta:'Part two',final:false});
            renderStreamAnswerText(article,{blockId:'one',delta:' continued',final:false});
            if(document.querySelectorAll('.streamAnswerPreview').length!==2||document.querySelector('.streamAnswerPreview').textContent!=='Part one continued')throw Error('block deltas lost their identity');
            appendStreamVisualizationModule(article,{htmlUrl:'/generated/not-selected.html'});
            renderStreamAnswerText(article,{blockId:'two',delta:' [[AIME_CHART:/generated/a.html]] after',final:false});
            appendStreamVisualizationModule(article,{htmlUrl:'/generated/a.html'});
            window.finalFrame=document.querySelector('iframe');
            article.taskContext={question:'fixture'};
            renderFinalAnswer(article,{interpretation:'Part one continued Part two',reportArtifacts:[{url:'/generated/a.html'},{url:'/generated/not-selected.html'}]});
            if(document.querySelectorAll('iframe').length!==1||document.querySelector('iframe')!==finalFrame)throw Error('final handoff remounted or appended unselected chart');
            const saved=document.createElement('article');saved.innerHTML='<div class="finalAnswer"><section class="interleavedFlow"></section></div>';document.body.append(saved);
            saved.activityEnded=true;
            replayOrderedStream(saved,[{kind:'tool_step',data:{title:'internal tool'}},{kind:'visualization',data:{htmlUrl:'/generated/saved.html'}},{kind:'text',id:'saved-text',text:'before [[AIME_CHART:/generated/saved.html]] after'}],saved.querySelector('.interleavedFlow'));
            if(saved.querySelector('.orderedTool')||!saved.querySelector('.streamChartSlot [data-artifact-url]')||!saved.textContent.includes('before'))throw Error('saved replay lost marker placement');
            saved.remove();
            article.activityEnded=true;const html=document.querySelector('.finalAnswer').innerHTML;
            renderStreamAnswerText(article,{text:'stale',final:false});
            if(document.querySelector('.finalAnswer').innerHTML!==html)throw Error('late answer changed final');
        }''')
        assert not errors,errors
        checks.append({'width':width,'theme':theme,'inline':True,'earlyStreamViz':True,'stableFrames':True,'lateModule':True})
        page.close()
    browser.close()
server.shutdown()
print(json.dumps({'ok':True,'checks':checks}))
