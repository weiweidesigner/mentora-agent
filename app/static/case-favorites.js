(() => {
  const categories=[['lane','泳道'],['reports','市场报告'],['charts','金融图表'],['analysis','数据分析'],['videos','金融视频'],['art','艺术绘图']];
  let rows=[],source=null,anchor=null,busy=false,revision=0;
  const removing=new WeakSet();
  const dialog=document.createElement('dialog');dialog.className='caseFavoriteDialog';
  dialog.setAttribute('aria-labelledby','caseFavoriteTitle');
  dialog.innerHTML='<header><h2 id="caseFavoriteTitle">收藏到首页</h2><button type="button" class="caseFavoriteClose" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><form class="caseFavoriteForm"><label class="caseFavoriteField" for="caseFavoriteCategory">首页模块</label><div class="caseFavoriteSelect"><select id="caseFavoriteCategory" name="category">'+categories.map(([id,label])=>'<option value="'+id+'">'+label+'</option>').join('')+'</select><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></div><button type="submit" class="caseFavoriteSubmit">收藏到该模块</button></form><p class="caseFavoriteStatus" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const status=dialog.querySelector('.caseFavoriteStatus'),select=dialog.querySelector('select');
  async function api(path='',options={}){
    const r=await fetch('/api/case-favorites'+path,{cache:'no-store',...options});
    const data=await r.json();if(!r.ok)throw new Error(data.detail||'收藏失败，请重试');return data;
  }
  const ready=api().then(data=>{rows=[...rows,...(Array.isArray(data.cases)?data.cases:[]).filter(row=>!rows.some(item=>item.id===row.id))];revision++;return rows;}).catch(()=>[]);
  function snapshot(article){
    const session=article.shareSession||transientShareSessionForArticle(article)||{};
    const question=article.dataset.question||nearbyUserQuestionForArticle(article)||session.question||'收藏案例';
    const answer={};for(const key of ['interpretation','reportUrl','reportArtifacts','fileArtifacts','streamBlocks','sources','videos','actionLinks','lang'])if(session[key]!==undefined)answer[key]=session[key];
    if(article.streamBlocks?.length)answer.streamBlocks=article.streamBlocks;
    if(!answer.interpretation&&!answer.streamBlocks?.length&&!answer.reportUrl&&!answer.reportArtifacts?.length)answer.interpretation=article.querySelector('.mixedReport')?.textContent?.trim()||'';
    return {question,title:question.slice(0,40),answer};
  }
  function mark(button,saved){
    if(!button?.isConnected)return;
    button.classList.toggle('is-favorited',saved);
    button.setAttribute('aria-pressed',String(saved));
    button.setAttribute('aria-label',saved?'取消收藏':'收藏为案例');button.dataset.tip=saved?'取消收藏':'收藏';
    const icon=button.querySelector('.resultActionIcon');if(icon)icon.innerHTML=favoriteHeartIcon(saved);
  }
  async function sync(article){
    try{
      await ready;
      const currentRevision=revision;
      const value=snapshot(article),matching=rows.filter(row=>row.question===value.question.trim());
      const state=matching.length?await api('/status',{method:'POST',headers:{'Content-Type':'application/json','X-Veya-Day':'1'},body:JSON.stringify(value)}):{saved:false};
      if(currentRevision!==revision)return sync(article);
      article.querySelectorAll('.favoriteResultButton').forEach(button=>mark(button,state.saved));
    }catch{/* A failed status read must never prevent opening or saving. */}
  }
  function buttons(disabled){dialog.querySelectorAll('button,select').forEach(b=>b.disabled=disabled);}
  async function removeFavorite(article,button){
    if(removing.has(article))return;
    removing.add(article);button.disabled=true;button.setAttribute('aria-busy','true');
    article.querySelector('.favoriteActionError')?.remove();
    try{
      await ready;
      const result=await api('',{method:'DELETE',headers:{'Content-Type':'application/json','X-Veya-Day':'1'},body:JSON.stringify(snapshot(article))});
      const ids=new Set([...(result.removedIds||[]),...rows.filter(row=>row.fingerprint&&row.fingerprint===result.fingerprint).map(row=>row.id)]);
      rows=rows.filter(row=>!ids.has(row.id));revision++;
      mark(button,false);
      window.dispatchEvent(new CustomEvent('mentora:case-favorite-removed',{detail:{ids:[...ids]}}));
      document.querySelectorAll('.message.assistant').forEach(item=>void sync(item));
    }catch(error){
      const message=document.createElement('span');message.className='favoriteActionError';message.setAttribute('role','alert');
      message.textContent='取消收藏失败，请重试';button.after(message);
    }finally{removing.delete(article);button.disabled=false;button.removeAttribute('aria-busy');}
  }
  function close(){if(!busy)dialog.close();}
  dialog.querySelector('.caseFavoriteClose').onclick=close;
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();
  });
  select.addEventListener('change',()=>{status.textContent='';});
  dialog.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!source)return;
    busy=true;buttons(true);status.textContent='';dialog.setAttribute('aria-busy','true');
    try{
      const row=await api('',{method:'POST',headers:{'Content-Type':'application/json','X-Veya-Day':'1'},body:JSON.stringify({...source,category:select.value})});
      rows=[row,...rows.filter(item=>item.id!==row.id)];
      revision++;
      window.dispatchEvent(new CustomEvent('mentora:case-favorite-saved',{detail:row}));
      mark(anchor,true);
      status.textContent='已收藏到'+categories.find(([id])=>id===row.category)[1];
    }catch(error){status.textContent=error.message;}
    finally{busy=false;buttons(false);dialog.removeAttribute('aria-busy');}
  });
  dialog.addEventListener('close',()=>{source=null;anchor?.focus({preventScroll:true});anchor=null;});
  window.MentoraCaseFavorites={ready,sync,get rows(){return rows;},open(article,button){
    if(!article||busy||removing.has(article))return;
    if(button?.classList.contains('is-favorited')){void removeFavorite(article,button);return;}
    source=snapshot(article);anchor=button;status.textContent='';
    if(!dialog.open)dialog.showModal();
  }};
  void ready.then(()=>document.querySelectorAll('.message.assistant').forEach(article=>void sync(article)));
})();
