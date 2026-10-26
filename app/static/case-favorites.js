(() => {
  const categories=[['lane','泳道'],['reports','市场报告'],['charts','金融图表'],['analysis','数据分析'],['videos','金融视频'],['art','艺术绘图']];
  let rows=[],source=null,anchor=null,busy=false;
  const dialog=document.createElement('dialog');dialog.className='caseFavoriteDialog';
  dialog.setAttribute('aria-labelledby','caseFavoriteTitle');
  dialog.innerHTML='<header><h2 id="caseFavoriteTitle">收藏到首页</h2><button type="button" class="caseFavoriteClose" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="caseFavoriteOptions">'+categories.map(([id,label])=>'<button type="button" data-favorite-category="'+id+'"><span>'+label+'</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>').join('')+'</div><p class="caseFavoriteStatus" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const status=dialog.querySelector('.caseFavoriteStatus');
  async function api(path='',options={}){
    const r=await fetch('/api/case-favorites'+path,{cache:'no-store',...options});
    const data=await r.json();if(!r.ok)throw new Error(data.detail||'收藏失败，请重试');return data;
  }
  const ready=api().then(data=>{rows=Array.isArray(data.cases)?data.cases:[];return rows;}).catch(()=>[]);
  function snapshot(article){
    const session=article.shareSession||transientShareSessionForArticle(article)||{};
    const question=article.dataset.question||nearbyUserQuestionForArticle(article)||session.question||'收藏案例';
    const answer={};for(const key of ['interpretation','reportUrl','reportArtifacts','fileArtifacts','streamBlocks','sources','videos','actionLinks','lang'])if(session[key]!==undefined)answer[key]=session[key];
    if(article.streamBlocks?.length)answer.streamBlocks=article.streamBlocks;
    if(!answer.interpretation&&!answer.streamBlocks?.length&&!answer.reportUrl&&!answer.reportArtifacts?.length)answer.interpretation=article.querySelector('.mixedReport')?.textContent?.trim()||'';
    return {question,title:question.slice(0,40),answer};
  }
  function buttons(disabled){dialog.querySelectorAll('button').forEach(b=>b.disabled=disabled);}
  function close(){if(!busy)dialog.close();}
  dialog.querySelector('.caseFavoriteClose').onclick=close;
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('click',async event=>{
    if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();return;}
    const target=event.target.closest('[data-favorite-category]');if(!target||busy||!source)return;
    busy=true;buttons(true);status.textContent='';dialog.setAttribute('aria-busy','true');
    try{
      const row=await api('',{method:'POST',headers:{'Content-Type':'application/json','X-Veya-Day':'1'},body:JSON.stringify({...source,category:target.dataset.favoriteCategory})});
      rows=[row,...rows.filter(item=>item.id!==row.id)];
      window.dispatchEvent(new CustomEvent('mentora:case-favorite-saved',{detail:row}));
      if(anchor?.isConnected){anchor.classList.add('is-favorited');anchor.setAttribute('aria-label','已收藏，选择其他模块');anchor.dataset.tip='已收藏';}
      status.textContent='已收藏到'+categories.find(([id])=>id===row.category)[1];
      target.classList.add('is-saved');target.setAttribute('aria-label',target.textContent+'，已收藏');
    }catch(error){status.textContent=error.message;}
    finally{busy=false;buttons(false);dialog.removeAttribute('aria-busy');}
  });
  dialog.addEventListener('close',()=>{source=null;anchor?.focus({preventScroll:true});anchor=null;});
  window.MentoraCaseFavorites={ready,get rows(){return rows;},open(article,button){
    if(!article||busy)return;source=snapshot(article);anchor=button;status.textContent='';
    dialog.querySelectorAll('[data-favorite-category]').forEach(b=>{b.classList.remove('is-saved');b.removeAttribute('aria-label');});
    if(!dialog.open)dialog.showModal();
  }};
})();
