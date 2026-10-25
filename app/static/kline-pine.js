/* Host editor for native K-lines. Calculations use the existing Pine API. */
(() => {
  const docs=new WeakSet(),frames=new WeakSet();
  const initial='//@version=5\nindicator("自定义指标", overlay=true)\nlength = input.int(20, "周期", minval=1)\nplot(ta.sma(close, length), title="均线", color=color.orange, linewidth=2)';
  const icon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 4l-4 16"/></svg>';
  function endpoint(win){
    for(let w=win,i=0;i<8;i++){
      try{if(/^https?:/.test(w.location.protocol))return w.location.pathname.split(/\/(?:share-artifact|generated|static|api|share|s)\//)[0].replace(/\/$/,'')+'/api/portfolio';if(w.parent===w)break;w=w.parent;}catch{break;}
    }
    throw Error('请在本站打开图表后运行 Pine');
  }
  function highlight(pre,code,doc){
    const tokens=code.match(/\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][\w.]*\b|[^\w]/g)||[];
    const fragment=doc.createDocumentFragment();
    for(const token of tokens){
      const kind=token.startsWith('//')?'comment':/^["']/.test(token)?'string':/^\d/.test(token)?'number':/^(?:if|else|for|while|var|varip|true|false|na|and|or|not|switch|import|export)$/.test(token)?'keyword':/^(?:ta|math|input|color|plot|hline|indicator|strategy|request)(?:\.|$)/.test(token)?'function':'';
      if(kind){const span=doc.createElement('span');span.className='pine-token-'+kind;span.textContent=token;fragment.append(span);}else fragment.append(doc.createTextNode(token));
    }
    fragment.append(doc.createTextNode('\n'));pre.replaceChildren(fragment);
  }
  function mount(doc){
    if(!doc?.defaultView)return;const win=doc.defaultView;
    doc.querySelectorAll('.kline-component').forEach(root=>{
      if(!root.klinePine||root.dataset.pineUi||root.dataset.compactTile==='true')return;
      const header=root.querySelector('.kline-title'),chart=root.querySelector('.chart-host');if(!header||!chart)return;
      root.dataset.pineUi='2';
      if(!doc.querySelector('[data-kline-pine-style]')){
        const style=doc.createElement('style');style.dataset.klinePineStyle='2';
        style.textContent=`.kline-component{position:relative}.kline-title{padding-right:44px!important}.kline-code-toggle{position:absolute;right:4px;top:0;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:0;border-radius:6px;color:inherit;background:transparent;cursor:pointer}.kline-code-toggle:hover,.kline-code-toggle[aria-pressed="true"]{background:#8882}.kline-pine{box-sizing:border-box;min-width:0;padding:20px 0 0;font:13px/1.6 system-ui,sans-serif}.kline-pine [hidden],.kline-component[data-pine-view="code"]>.chart-host,.kline-component[data-pine-view="code"]>.kline-pine-legend,.kline-component[data-pine-view="code"] .period-tabs{display:none!important}.kline-pine-bar,.kline-pine-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.kline-pine-bar{margin-bottom:12px;justify-content:space-between}.kline-pine-surface{position:relative;height:420px;min-height:240px;border:1px solid #8884;border-radius:8px;overflow:hidden;background:var(--kl-bg,#141414);color:#d4d4d4}.kline-pine-surface pre,.kline-pine-surface textarea{box-sizing:border-box;position:absolute;inset:0;width:100%;height:100%;margin:0;border:0;padding:20px;font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:normal;tab-size:4;white-space:pre;overflow:auto;word-break:normal;overflow-wrap:normal}.kline-pine-surface pre{pointer-events:none}.kline-pine-surface textarea{background:transparent;color:transparent;caret-color:#eee;resize:none;-webkit-text-fill-color:transparent}.kline-pine-surface textarea::selection{background:#5488c466}.pine-token-comment{color:#77946b}.pine-token-string{color:#ce9178}.pine-token-number{color:#b5cea8}.pine-token-keyword{color:#c586c0}.pine-token-function{color:#60c9e4}.kline-pine-actions{padding-top:16px}.kline-pine button{font:inherit;border:1px solid #8884;border-radius:6px;padding:7px 14px;color:inherit;background:transparent;cursor:pointer}.kline-pine button[data-action="run"]{margin-left:auto;background:#ededed;color:#171717;border-color:transparent}.kline-pine button:disabled{opacity:.5;cursor:wait}.kline-pine [data-status]{margin:12px 0 0;color:#999;overflow-wrap:anywhere}.kline-pine :focus-visible,.kline-code-toggle:focus-visible{outline:2px solid #6aa9df;outline-offset:2px}:root[data-theme="light"] .kline-pine-surface{background:#fafafa;color:#333}:root[data-theme="light"] .kline-pine-surface textarea{caret-color:#222}:root[data-theme="light"] .pine-token-function{color:#007e94}:root[data-theme="light"] .pine-token-number{color:#407223}@media(max-width:520px){.kline-pine-surface{height:360px}.kline-pine-surface pre,.kline-pine-surface textarea{padding:16px}.kline-pine button{min-height:36px}}`;
        (doc.head||doc.documentElement).append(style);
      }
      let config={};
      for(const script of doc.querySelectorAll('script')){const match=script.textContent.match(/\bconst\s+config\s*=\s*(\{[^\n]*\});/);if(match){try{config=JSON.parse(match[1]);break;}catch{}}}
      const overlays=config.pineOverlays||[],source=overlays.find(p=>p.sourceCode)?.sourceCode;
      const button=doc.createElement('button');button.type='button';button.className='kline-code-toggle';button.innerHTML=icon;button.setAttribute('aria-label','查看 Pine Script 代码');button.title='查看 Pine Script 代码';button.setAttribute('aria-pressed','false');header.append(button);
      const panel=doc.createElement('section');panel.className='kline-pine';panel.hidden=true;
      panel.innerHTML='<div class="kline-pine-bar"><span>Pine Script</span><span data-code-state></span></div><div class="kline-pine-surface"><pre aria-hidden="true"></pre><textarea data-code aria-label="Pine Script 代码" maxlength="12000" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off"></textarea></div><div class="kline-pine-actions"><button type="button" data-action="copy">复制代码</button><button type="button" data-action="clear">清除指标</button><button type="button" data-action="run">运行代码</button></div><p data-status role="status" aria-live="polite"></p>';
      root.append(panel);button.setAttribute('aria-controls',panel.id='pine-editor-'+Math.random().toString(36).slice(2));
      const editor=panel.querySelector('textarea'),pre=panel.querySelector('pre'),status=panel.querySelector('[data-status]'),state=panel.querySelector('[data-code-state]'),run=panel.querySelector('[data-action="run"]');
      editor.value=source||(overlays.length?'':initial);let appliedCode=source||'',pendingCode='',controller=null,timer=null,sequence=0;
      status.textContent=overlays.length&&!source?'此历史图表未找到对应 Pine 源码，请粘贴代码后运行；现有指标不受影响。':'使用当前图表已加载的 OHLCV；支持主图 plot / hline，不会下单。';
      const resize=()=>{try{win.parent.postMessage({type:'aime-frame-resize'},'*');}catch{}};
      const paint=()=>{highlight(pre,editor.value,doc);pre.scrollTop=editor.scrollTop;pre.scrollLeft=editor.scrollLeft;state.textContent=editor.value.trim()&&editor.value===appliedCode?'已运行':'未运行';};
      const view=code=>{root.dataset.pineView=code?'code':'chart';panel.hidden=!code;button.setAttribute('aria-pressed',String(code));button.title=code?'返回 K 线':'查看 Pine Script 代码';button.setAttribute('aria-label',button.title);if(code){paint();editor.focus();}else win.dispatchEvent(new win.Event('resize'));resize();};
      button.addEventListener('click',()=>view(panel.hidden));editor.addEventListener('input',paint);editor.addEventListener('scroll',()=>{pre.scrollTop=editor.scrollTop;pre.scrollLeft=editor.scrollLeft;});
      editor.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();editor.setRangeText('    ',editor.selectionStart,editor.selectionEnd,'end');paint();}if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();run.click();}});
      async function renderCode(code,returnToChart=false){
        if(!code.trim()){status.textContent='请先输入 Pine Script 代码。';editor.focus();return;}
        pendingCode=code;clearTimeout(timer);controller?.abort();const current=new win.AbortController();controller=current;const id=++sequence,snapshot=root.klinePine.snapshot();run.disabled=true;run.textContent='运行中…';status.textContent=`正在计算 ${snapshot.period} 的 ${snapshot.rows.length} 根 K 线…`;
        try{
          const response=await win.fetch(endpoint(win)+'/pine/plot',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Veya-Portfolio':'1'},body:JSON.stringify({code,rows:snapshot.rows,period:snapshot.period}),signal:current.signal});
          const text=await response.text();let data;try{data=JSON.parse(text);}catch{throw Error('Pine 服务返回格式异常，请稍后重试');}if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Pine 运行失败');if(id!==sequence)return;
          if(!root.klinePine.apply(data,snapshot.key)){timer=setTimeout(()=>void renderCode(code,returnToChart),250);return;}
          appliedCode=code;pendingCode='';paint();status.textContent=`${data.period} · ${data.barCount} 根 K 线 · 已运行 ${data.plots.length+data.hlines.length} 条指标线`;
          if(returnToChart)view(false);
        }catch(error){if(id===sequence&&error.name!=='AbortError'){pendingCode='';status.textContent=error.message+'；保留原有指标。';}}
        finally{if(id===sequence){run.disabled=false;run.textContent='运行代码';}resize();}
      }
      panel.addEventListener('click',async event=>{
        const action=event.target.closest('[data-action]')?.dataset.action;
        if(action==='run')await renderCode(editor.value,true);
        if(action==='copy'){try{await win.navigator.clipboard.writeText(editor.value);status.textContent='复制成功';}catch{status.textContent='复制失败，请手动复制';}}
        if(action==='clear'){++sequence;clearTimeout(timer);controller?.abort();appliedCode='';pendingCode='';root.klinePine.clear();run.disabled=false;run.textContent='运行代码';paint();status.textContent='已清除 Pine 指标，原有标注不受影响。';}
      });
      root.addEventListener('kline-context-change',()=>{++sequence;controller?.abort();clearTimeout(timer);const code=pendingCode||appliedCode;if(code)timer=setTimeout(()=>void renderCode(code),250);else{run.disabled=false;run.textContent='运行代码';}});
      win.addEventListener('pagehide',()=>{clearTimeout(timer);controller?.abort();});paint();
    });
    doc.querySelectorAll('iframe').forEach(frame=>{const visit=()=>{try{mount(frame.contentDocument);}catch{}};if(!frames.has(frame)){frames.add(frame);frame.addEventListener('load',visit);}visit();});
    if(!docs.has(doc)){docs.add(doc);if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',()=>mount(doc),{once:true});}
  }
  mount(document);
})();
