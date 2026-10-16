// Context-bound questions. Rotation is local; model calls happen only on context changes.
(() => {
  window.WidgetRecommendations=class {
    constructor({workspace,prompt,welcome,busy}){
      Object.assign(this,{workspace,prompt,welcome,busy});this.cache=new Map();this.serial=0;this.offset=0;this.items=[];this.taskLoadedAt=0;
      this.welcome?.replaceChildren();
      const cancelHint=()=>{clearTimeout(this.hintTimer);this.prompt.classList.remove('is-hint-changing');this.hintTarget=this.prompt.placeholder;};
      this.prompt.addEventListener('input',cancelHint);this.prompt.addEventListener('focus',cancelHint);
      this.prompt.addEventListener('blur',()=>this.paint());
      this.prompt.addEventListener('click',()=>{
        if(this.busy()||this.prompt.disabled||this.prompt.value.trim())return;
        const items=this.items.length?this.items:(this.evidenceFallback||[]);
        const suggestion=items.find(item=>item.question===this.prompt.placeholder);
        if(!suggestion?.prompt||!this.prompt.form)return;
        // Send the visible question's full request, including its supporting context.
        this.prompt.value=suggestion.prompt;
        this.prompt.dispatchEvent(new Event('input',{bubbles:true}));
        this.prompt.form.requestSubmit();
      });
      setInterval(()=>{if(workspace.hidden||document.hidden||busy()||prompt.value||document.activeElement===prompt)return;this.offset++;this.paint();if(this.context&&Date.now()-this.taskLoadedAt>60000)this.update(this.context,true);},9000);
    }
    async taskResults(){
      if(this.taskPromise)return this.taskPromise;
      if(Date.now()-this.taskLoadedAt<60000)return this.tasks||[];
      this.taskPromise=(async()=>{
        try{
          const response=await fetch('/api/day/tasks',{cache:'no-store'});if(!response.ok)return[];const data=await response.json();
          const tasks=[...(data.tasks||[]),...(data.sceneTasks||[])].filter(t=>t.successAt&&t.resultVersion).sort((a,b)=>String(b.successAt).localeCompare(String(a.successAt))).filter((t,i,all)=>all.findIndex(v=>v.id===t.id)===i).slice(0,4);
          return await Promise.all(tasks.map(async task=>{
            let question=task.question||'',interpretation=[task.resultHeadline,task.resultDescription,task.summary].filter(Boolean).join('\n');
            try{const r=await fetch('/api/day/tasks/'+encodeURIComponent(task.id)+'/result',{cache:'no-store'});if(r.ok){const body=await r.json();question=body.question||question;interpretation=body.answer?.interpretation||interpretation;}}catch{}
            return {id:String(task.id),title:String(task.title||'').slice(0,200),question:String(question).slice(0,6000),interpretation:String(interpretation).replace(/\[\[AIME_[^\n]+?\]\]/g,'').slice(0,5000),asOf:String(task.successAt),market:String(task.resultMarket||task.market||'')};
          }));
        }catch{return[];}
      })();
      try{this.tasks=await this.taskPromise;this.taskLoadedAt=Date.now();return this.tasks;}finally{this.taskPromise=null;}
    }
    async update(context,force=false){
      const key=JSON.stringify(context);this.context=context;
      const changed=this.key!==key;if(!force&&!changed)return;this.key=key;const serial=++this.serial;this.controller?.abort();if(changed){this.offset=0;this.items=[];this.evidenceFallback=[];}
      const card=context.board.cards.find(c=>c.id===context.selectedCardId);
      this.fallback='输入看板需求';this.paint();
      const taskResults=await this.taskResults();if(serial!==this.serial||!this.workspace.isConnected)return;
      if(!context.selectedCardId&&!context.board.cards.length&&!this.items.length){this.evidenceFallback=taskResults.map(t=>({question:`能把「${t.title.slice(0,24)}」里的结论做成看板吗？`,prompt:`根据${t.asOf}的「${t.title}」已完成任务结果创建跟踪看板。任务问题：${t.question.slice(0,300)}\n任务结果：${t.interpretation.slice(0,1500)}`,sourceTaskIds:[t.id]}));this.paint();}
      const payload={...context,taskResults},signature=JSON.stringify(payload),cached=this.cache.get(signature);
      if(cached&&cached.until>Date.now()){this.items=cached.items;this.paint();return;}
      this.controller=new AbortController();const timeout=setTimeout(()=>this.controller.abort(),23000);
      try{
        const response=await fetch('/api/widgets/recommendations',{method:'POST',headers:{'Content-Type':'application/json'},signal:this.controller.signal,body:signature});if(!response.ok){const problem=await response.json();this.prompt.dataset.recommendationError=JSON.stringify(Array.isArray(problem.detail)?problem.detail.map(({loc,type})=>({loc,type})):problem.detail).slice(0,1000);throw Error('unavailable');}delete this.prompt.dataset.recommendationError;const result=await response.json();
        if(serial!==this.serial)return;
        this.items=(result.suggestions||[]).filter(item=>typeof item.question==='string'&&item.question.length<=64&&typeof item.prompt==='string').slice(0,4);
        this.cache.set(signature,{until:Date.now()+(this.items.length?600000:30000),items:this.items});while(this.cache.size>64)this.cache.delete(this.cache.keys().next().value);
        this.paint();
      }catch{if(serial===this.serial)this.paint();}finally{clearTimeout(timeout);}
    }
    motionEnabled(){return typeof this.prompt.animate==='function'&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches&&!document.hidden;}
    changeHint(text){
      if(text===this.hintTarget)return;this.hintTarget=text;clearTimeout(this.hintTimer);
      if(text===this.prompt.placeholder){this.prompt.classList.remove('is-hint-changing');return;}
      if(!this.motionEnabled()||!this.prompt.placeholder){this.prompt.placeholder=text;this.prompt.classList.remove('is-hint-changing');return;}
      this.prompt.classList.add('is-hint-changing');
      this.hintTimer=setTimeout(()=>{
        if(!this.prompt.value&&document.activeElement!==this.prompt)this.prompt.placeholder=text;
        this.prompt.classList.remove('is-hint-changing');
      },180);
    }
    changeWelcome(buttons){
      const version=this.welcomeVersion=(this.welcomeVersion||0)+1;
      this.welcomeAnimation?.cancel();
      const replace=()=>{if(version!==this.welcomeVersion||!this.welcome.isConnected)return;this.welcome.replaceChildren(...buttons);if(this.motionEnabled())this.welcomeAnimation=this.welcome.animate([{opacity:0},{opacity:1}],{duration:300,easing:'ease-out'});};
      if(!this.motionEnabled()||!this.welcome.children.length){replace();return;}
      // Keep the existing buttons mounted through fade-out; rotation never replaces them.
      this.welcomeAnimation=this.welcome.animate([{opacity:1},{opacity:0}],{duration:180,easing:'ease-in',fill:'forwards'});
      const animation=this.welcomeAnimation;
      animation.finished.then(()=>{if(version!==this.welcomeVersion)return;animation.cancel();replace();}).catch(()=>{});
    }
    paint(){
      if(typeof document==='undefined'||!document||!this.context||!this.workspace.isConnected)return;
      const items=this.items.length?this.items:(this.evidenceFallback||[]);
      if(!this.prompt.value&&document.activeElement!==this.prompt)this.changeHint(!this.context.selectedCardId&&!this.context.board.cards.length?'输入看板需求':items.length?items[this.offset%items.length].question:this.fallback);
      if(!this.context.selectedCardId&&!this.context.board.cards.length&&this.welcome&&items.length){
        const key=JSON.stringify(items.map(item=>[item.question,item.prompt,item.sourceTaskIds]));
        if(key===this.welcomeKey)return;this.welcomeKey=key;
        const buttons=items.map(item=>{const button=document.createElement('button');button.type='button';button.dataset.widgetPrompt=item.prompt;button.textContent=item.question;const sources=(this.tasks||[]).filter(t=>(item.sourceTaskIds||[]).includes(t.id));button.title=sources.map(t=>`${t.title} · ${t.asOf}`).join('\n');return button;});
        this.changeWelcome(buttons);

      }
    }
  };
})();
