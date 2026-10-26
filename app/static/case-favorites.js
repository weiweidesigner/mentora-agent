(() => {
  let rows=[],revision=0;
  const pending=new WeakSet();
  const announcement=document.createElement('span');announcement.className='srOnly';announcement.setAttribute('role','status');document.body.append(announcement);
  async function api(path='',options={}){
    const r=await fetch('/api/case-favorites'+path,{cache:'no-store',...options});
    const data=await r.json();if(!r.ok)throw new Error(data.detail||'收藏操作失败，请重试');return data;
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
    button.classList.toggle('is-favorited',saved);button.setAttribute('aria-pressed',String(saved));
    button.setAttribute('aria-label',saved?'取消收藏':'收藏到我的');button.dataset.tip=saved?'取消收藏':'收藏';
    const icon=button.querySelector('.resultActionIcon');if(icon)icon.innerHTML=favoriteHeartIcon(saved);
  }
  async function sync(article){
    try{
      await ready;
      const currentRevision=revision,value=snapshot(article),matching=rows.some(row=>row.question===value.question.trim());
      const state=matching?await api('/status',{method:'POST',headers:{'Content-Type':'application/json','X-Veya-Day':'1'},body:JSON.stringify(value)}):{saved:false};
      if(currentRevision!==revision)return sync(article);
      article.querySelectorAll('.favoriteResultButton').forEach(button=>mark(button,state.saved));
    }catch{/* Status failure must not prevent using the action. */}
  }
  async function toggle(article,button){
    if(!article||!button||pending.has(article))return;
    pending.add(article);button.disabled=true;button.setAttribute('aria-busy','true');
    article.querySelector('.favoriteActionError')?.remove();
    const removing=button.classList.contains('is-favorited');
    try{
      await ready;
      const value=snapshot(article),headers={'Content-Type':'application/json','X-Veya-Day':'1'};
      if(removing){
        const result=await api('',{method:'DELETE',headers,body:JSON.stringify(value)});
        const ids=new Set([...(result.removedIds||[]),...rows.filter(row=>row.fingerprint&&row.fingerprint===result.fingerprint).map(row=>row.id)]);
        rows=rows.filter(row=>!ids.has(row.id));revision++;mark(button,false);
        window.dispatchEvent(new CustomEvent('mentora:case-favorite-removed',{detail:{ids:[...ids]}}));
        announcement.textContent='已取消收藏';
      }else{
        const row=await api('',{method:'POST',headers,body:JSON.stringify({...value,category:'mine'})});
        rows=[row,...rows.filter(item=>item.id!==row.id)];revision++;mark(button,true);
        window.dispatchEvent(new CustomEvent('mentora:case-favorite-saved',{detail:row}));
        announcement.textContent='已收藏到我的';
      }
      document.querySelectorAll('.message.assistant').forEach(item=>void sync(item));
    }catch(error){
      const message=document.createElement('span');message.className='favoriteActionError';message.setAttribute('role','alert');
      message.textContent=removing?'取消收藏失败，请重试':'收藏失败，请重试';button.after(message);
    }finally{pending.delete(article);button.disabled=false;button.removeAttribute('aria-busy');}
  }
  window.MentoraCaseFavorites={ready,sync,get rows(){return rows;},open(article,button){void toggle(article,button);}};
  void ready.then(()=>document.querySelectorAll('.message.assistant').forEach(article=>void sync(article)));
})();
