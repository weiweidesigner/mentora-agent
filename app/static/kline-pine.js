/* Host adapter: native Pine output → the exact currently loaded K-line bars. */
(() => {
  const docs=new WeakSet(),frames=new WeakSet();
  const initial='//@version=5\nindicator("我的画线", overlay=true)\nlength = input.int(20, "周期", minval=1)\nplot(ta.sma(close, length), title="均线", color=color.orange, linewidth=2)';
  function endpoint(win){
    let path='';
    for(let w=win,i=0;i<8;i++){
      try{if(/^https?:/.test(w.location.protocol)){path=w.location.pathname;break;}if(w.parent===w)break;w=w.parent;}catch{break;}
    }
    if(!path)throw Error('请在本站打开图表后运行 Pine');
    return path.split(/\/(?:share-artifact|generated|api|share|s)\//)[0].replace(/\/$/,'')+'/'+'api/portfolio';
  }
  function mount(doc){
    const win=doc.defaultView;if(!win)return;
    doc.querySelectorAll('.kline-component').forEach(root=>{
      if(!root.klinePine || root.dataset.pineUi || root.dataset.compactTile==='true')return;
      root.dataset.pineUi='1';
      if(!doc.querySelector('[data-kline-pine-style]')){
        const style=doc.createElement('style');style.dataset.klinePineStyle='1';
        style.textContent=`.kline-pine{margin:8px 0 12px;font:12px/1.6 system-ui,sans-serif;color:inherit}.kline-pine summary{cursor:pointer;width:max-content;padding:5px 12px;border:1px solid #8884;border-radius:6px;list-style:none}.kline-pine summary:hover{background:#8881}.kline-pine[open]>summary{margin-bottom:12px}.kline-pine-body{display:grid;gap:12px;padding:16px;border:1px solid #8883;border-radius:8px;background:#88888808;min-width:0}.kline-pine label{display:grid;gap:6px;color:inherit}.kline-pine :is(textarea,select){box-sizing:border-box;max-width:100%;width:100%;border:1px solid #8884;border-radius:6px;background:transparent;color:inherit;padding:9px 12px;font:inherit}.kline-pine select option{background:var(--ui-control-bg,#202020);color:var(--ui-control-ink,inherit)}.kline-pine textarea[data-code]{font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:4;white-space:pre;overflow:auto;resize:vertical}.kline-pine-actions{display:flex;gap:8px;flex-wrap:wrap}.kline-pine button{font:inherit;color:inherit;padding:6px 12px;border:1px solid #8884;background:transparent;border-radius:6px;cursor:pointer}.kline-pine button:hover{background:#8882}.kline-pine button:disabled{opacity:.5;cursor:default}.kline-pine [data-status]{margin:0;color:var(--ui-control-text,#999);overflow-wrap:anywhere}.kline-pine [hidden]{display:none!important}.kline-pine :focus-visible{outline:2px solid #888;outline-offset:2px}@media(max-width:520px){.kline-pine-body{padding:12px}.kline-pine-actions>button{min-height:36px}}`;
        (doc.head||doc.documentElement).append(style);
      }
      const panel=doc.createElement('details');panel.className='kline-pine';
      panel.innerHTML='<summary>Pine 画线</summary><div class="kline-pine-body"><label>已保存策略<select aria-label="已保存的 Pine 策略"><option value="">选择策略，或直接粘贴代码</option></select></label><label>画线逻辑<textarea data-description rows="2" maxlength="4000" placeholder="例如：画出20日均线，以及过去60根K线的支撑和压力线"></textarea></label><div class="kline-pine-actions"><button type="button" data-action="generate">生成并画线</button><button type="button" data-action="cancel" hidden>停止生成</button></div><label>Pine Script v5<textarea data-code aria-label="Pine画线代码" rows="7" maxlength="12000" spellcheck="false"></textarea></label><div class="kline-pine-actions"><button type="button" data-action="run">运行到当前K线</button><button type="button" data-action="clear">清除Pine线条</button><button type="button" data-action="copy">复制代码</button></div><p data-status role="status" aria-live="polite">使用当前图表已加载的OHLCV；仅支持主图 plot/hline，不会下单。</p></div>';
      root.querySelector('.kline-title').after(panel);
      const editor=panel.querySelector('[data-code]'),description=panel.querySelector('[data-description]'),select=panel.querySelector('select'),status=panel.querySelector('[data-status]');editor.value=initial;
      let appliedCode='',pendingCode='',runController=null,genController=null,timer=null,saved=null,sequence=0;
      const say=text=>{status.textContent=text;};
      const resize=()=>{try{win.parent.postMessage({type:'aime-frame-resize'},win.location.origin);}catch{}};
      const busy=on=>{panel.querySelectorAll('[data-action="generate"],[data-action="run"],select').forEach(b=>b.disabled=on);editor.readOnly=on;description.disabled=on;panel.querySelector('[data-action="cancel"]').hidden=!on;};
      async function json(path,payload,signal){
        const response=await win.fetch(endpoint(win)+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Veya-Portfolio':'1'},body:JSON.stringify(payload),signal});
        const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Pine请求失败');return data;
      }
      async function renderCode(code){
        pendingCode=code;
        clearTimeout(timer);runController?.abort();const controller=new win.AbortController();runController=controller;
        const id=++sequence,snapshot=root.klinePine.snapshot();
        say(`正在计算 ${snapshot.period} 的 ${snapshot.rows.length} 根K线…`);
        try{
          const data=await json('/pine/plot',{code,rows:snapshot.rows,period:snapshot.period},controller.signal);
          if(id!==sequence)return;
          if(!root.klinePine.apply(data,snapshot.key)){say('行情或周期已变化，正在重新计算…');timer=setTimeout(()=>void renderCode(code),250);return;}
          appliedCode=code;pendingCode='';
          const finite=data.plots.some(p=>p.values.some(v=>typeof v==='number'&&Number.isFinite(v)))||data.hlines.length;
          say(finite?`${data.period} · ${data.barCount} 根已加载K线 · 已展示 ${data.plots.length+data.hlines.length} 条Pine线`:'当前K线不足以完成指标预热，暂未产生有效线条。');resize();
        }catch(error){if(id===sequence&&error.name!=='AbortError'){pendingCode='';say(error.message+'；未替换已有线条。');}}
      }
      async function generate(){
        if(description.value.trim().length<2){say('请先描述你想画的线');description.focus();return;}
        const previous=editor.value,controller=new win.AbortController();genController=controller;busy(true);say('正在生成Pine代码…');let complete=false,reader;
        try{
          const response=await win.fetch(endpoint(win)+'/pine/generate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Veya-Portfolio':'1'},body:JSON.stringify({description:description.value,code:previous}),signal:controller.signal});
          if(!response.ok){const error=await response.json();throw Error(typeof error.detail==='string'?error.detail:'生成请求失败');}
          if(!response.body)throw Error('浏览器不支持流式响应');
          editor.value='';reader=response.body.getReader();const decoder=new win.TextDecoder();let buffer='';
          while(true){
            const chunk=await reader.read();if(genController!==controller)return;
            buffer+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done}).replace(/\r/g,'');let boundary;
            while((boundary=buffer.indexOf('\n\n'))>=0){
              const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
              const text=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!text)continue;
              const event=JSON.parse(text);if(event.type==='error')throw Error(event.message);
              if(event.type==='delta'){editor.value+=event.text;if(editor.value.length>12000)throw Error('代码超过长度限制');editor.scrollTop=editor.scrollHeight;}
              if(event.type==='complete'){editor.value=event.code;complete=true;}
            }
            if(complete||chunk.done)break;
          }
          if(!complete)throw Error('代码未完整生成');
          await renderCode(editor.value);
        }catch(error){editor.value=previous;say(error.name==='AbortError'?'已停止生成，保留原代码和线条。':error.message+'；保留原代码和线条。');}
        finally{try{await reader?.cancel();}catch{}if(genController===controller){genController=null;busy(false);}}
      }
      panel.addEventListener('click',async event=>{
        const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
        if(action==='generate'){await generate();return;}
        if(action==='cancel'){genController?.abort();return;}
        if(action==='copy'){try{await win.navigator.clipboard.writeText(editor.value);say('复制成功');}catch{say('复制失败，请手动复制');}return;}
        if(action==='clear'){appliedCode='';pendingCode='';++sequence;clearTimeout(timer);runController?.abort();genController?.abort();root.klinePine.clear();say('已清除Pine线条，原有画线不受影响。');resize();return;}
        if(action==='run'){await renderCode(editor.value);}
      });
      select.addEventListener('change',()=>{const entry=saved?.find(s=>s.id===select.value);if(entry){editor.value=entry.code;say('已载入策略，点击运行到当前K线。');}});
      panel.addEventListener('toggle',async()=>{
        resize();if(!panel.open||saved)return;
        try{const response=await win.fetch(endpoint(win)+'/strategies',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error();const cfg=await response.json();saved=(cfg.customStrategies||[]).filter(s=>s.code?.startsWith('//@version=5'));for(const s of saved){const option=doc.createElement('option');option.value=s.id;option.textContent=s.name;select.append(option);}}catch{say('暂时无法读取已保存策略，可直接粘贴Pine代码。');}
      });
      root.addEventListener('kline-context-change',()=>{
        ++sequence;runController?.abort();clearTimeout(timer);
        const code=pendingCode||appliedCode;
        if(code){say('周期或行情变化，正在重新计算Pine线条…');timer=setTimeout(()=>void renderCode(code),250);}
      });
      win.addEventListener('pagehide',()=>{clearTimeout(timer);runController?.abort();genController?.abort();});
    });
    doc.querySelectorAll('iframe').forEach(frame=>{
      const visit=()=>{try{mount(frame.contentDocument);}catch{}};
      if(!frames.has(frame)){frames.add(frame);frame.addEventListener('load',visit);}visit();
    });
    if(!docs.has(doc)){docs.add(doc);if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',()=>mount(doc),{once:true});}
  }
  mount(document);
})();
