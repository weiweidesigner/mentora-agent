(() => {
  'use strict';
  const sessions = new Map();
  let active = null;
  const clean = text => typeof sanitizeUserFacingInsight === 'function' ? sanitizeUserFacingInsight(text) : text;
  const copy = text => typeof formatInsight === 'function' ? formatInsight(clean(text)) : '';

  function dispose() {
    if (!active) return;
    active.controller?.abort();
    active.observer?.disconnect();
    active.panel.querySelector('.conversation').inert=false;
    active.panel.classList.remove('has-case-chat','has-case-assistant');
    active.launcher.remove();active.drawer.remove();
    active = null;
  }
  function setOpen(open, focus = true) {
    const state = active;if (!state) return;
    if (open && typeof closeActivityDrawer === 'function') closeActivityDrawer();
    state.drawer.hidden = !open;
    state.launcher.hidden = open;
    state.launcher.setAttribute('aria-expanded',String(open));
    state.panel.classList.toggle('has-case-chat',open);
    state.panel.querySelector('.conversation').inert=open&&!!window.matchMedia?.('(max-width:760px)').matches;
    if (focus) (open ? state.input : state.launcher).focus({preventScroll:true});
  }
  function scroll(state, force = false) {
    if (force || state.follow) state.thread.scrollTop = state.thread.scrollHeight;
  }
  function userMessage(state, text) {
    const node = document.createElement('article');node.className='caseChatUser';node.textContent=text;state.thread.append(node);return node;
  }
  async function answerMessage(state, answer, text) {
    const node=document.createElement('article');node.className='message assistant caseChatAnswer';node.dataset.lang='zh-CN';state.thread.append(node);
    node.shareSession={...answer,id:`case-chat-${state.row.id}-${Date.now()}`,title:state.row.title,question:text,messages:[{role:'user',text}]};
    if(typeof renderSavedAssistantAnswer==='function') await renderSavedAssistantAnswer(node,answer,{question:text});
    else node.textContent=answer.interpretation||'';
    return node;
  }
  function update(state) {
    state.send.disabled=!!state.controller||!state.input.value.trim();
    state.stop.hidden=!state.controller;state.send.hidden=!!state.controller;
    state.input.style.height='auto';state.input.style.height=Math.min(120,Math.max(40,state.input.scrollHeight))+'px';
  }
  async function send(state, text) {
    text=String(text||'').trim();
    if (!text || state.controller || active!==state) return;
    const controller=new AbortController();state.controller=controller;
    const prior=[
      {role:'user',text:`我们正在讨论案例《${state.row.title}》。原始问题：${state.question}。案例缓存日期：${state.row.cachedDate||'未记录'}。请结合该案例回答追问，区分案例中的历史数据与本次新查到的数据。`},
      {role:'assistant',text:String(state.answer.interpretation||'').slice(0,18000)},
      ...state.turns.slice(-8).map(turn=>({role:turn.role,text:turn.text})),
    ];
    const user=userMessage(state,text);state.input.value='';state.error.textContent='';state.suggestions.hidden=true;
    const preview=document.createElement('article');preview.className='caseChatPreview';preview.setAttribute('role','status');preview.textContent='正在结合案例分析…';state.thread.append(preview);
    state.follow=true;update(state);scroll(state,true);
    let answer=null, failure='';
    try {
      const response=await fetch('/api/chat/stream',{
        method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({question:text,history:prior,sessionTitle:state.row.title+' · 案例追问',reasoningFramework:typeof DEFAULT_REASONING_FRAMEWORK==='string'?DEFAULT_REASONING_FRAMEWORK:'deepseek',inferenceModel:typeof DEFAULT_INFERENCE_MODEL==='string'?DEFAULT_INFERENCE_MODEL:'',themeMode:document.documentElement.dataset.theme==='dark'?'dark':'light'}),
      });
      if (!response.ok || !response.body) {const data=await response.json().catch(()=>({}));throw new Error(data.detail||'暂时无法回答，请重试。');}
      await readEventStream(response.body,(event,data)=>{
        if(controller.signal.aborted||active!==state)return;
        if(event==='progress'&&data.text&&!preview.dataset.answerStarted)preview.textContent=data.text;
        if(event==='answer_text'&&data.text){preview.dataset.answerStarted='true';const text=String(data.text).replace(/\[\[AIME_CHART:[\s\S]*?(?:\]\]|$)/g,'');if(typeof formatInsight==='function')preview.innerHTML=copy(text);else preview.textContent=text;}
        if(event==='final')answer=data;
        if(event==='error')failure=data.detail||data.message||'本次分析失败，请重试。';
        scroll(state);
      });
      if(controller.signal.aborted||active!==state)return;
      if(!answer)throw new Error(failure||'本次未返回结果，请重试。');
      preview.remove();await answerMessage(state,answer,text);
      if(active!==state)return;
      state.turns.push({role:'user',text},{role:'assistant',text:answer.interpretation||'',answer});
      state.turns.splice(0,Math.max(0,state.turns.length-20));scroll(state);
    } catch(error) {
      preview.remove();
      if(active===state){user.remove();state.input.value=text;state.error.textContent=controller.signal.aborted?'已停止，可以修改问题后重新发送。':error.message;}
    } finally {
      if(state.controller===controller){state.controller=null;if(active===state)update(state);}
    }
  }
  async function mount(detail) {
    dispose();
    const panel=document.querySelector('.caseOverlayPanel');if(!panel||!detail?.row)return;
    const state={...detail,panel,turns:sessions.get(detail.row.id)||[],controller:null,follow:true};sessions.set(detail.row.id,state.turns);
    const launcher=document.createElement('button');launcher.type='button';launcher.className='caseChatLauncher';launcher.setAttribute('aria-label','和 Mentora 聊聊这个案例');launcher.setAttribute('aria-expanded','false');launcher.setAttribute('aria-controls','caseChatDrawer');
    launcher.innerHTML='<span class="caseChatHint">聊聊这个案例</span><span class="caseRobotAvatar"><img src="/static/assets/case-robot.svg" alt=""><span class="caseRobotBadge">AI</span></span>';
    const drawer=document.createElement('aside');drawer.id='caseChatDrawer';drawer.className='caseChatDrawer';drawer.hidden=true;drawer.setAttribute('aria-label','案例追问');
    drawer.innerHTML='<header class="caseChatHeader"><img src="/static/assets/case-robot.svg" alt=""><div><strong>Mentora <span>案例助手</span></strong><p></p></div><button class="caseChatClose" type="button" aria-label="收起案例对话">×</button></header><div class="caseChatThread" role="log" aria-label="案例追问记录" tabindex="0"><div class="caseChatWelcome"><h2>一起看懂这个案例</h2><p>可以聊聊结论、图表和分析方法。</p><div class="caseChatSuggestions"></div></div></div><div class="caseChatBottom"><p class="caseChatError" role="status"></p><form class="caseChatForm"><textarea rows="1" maxlength="6000" aria-label="向 Mentora 追问这个案例" placeholder="聊聊这个案例…" required></textarea><button class="caseChatSend" type="submit" aria-label="发送追问" disabled>↑</button><button class="caseChatStop" type="button" aria-label="停止回答" hidden>■</button></form></div>';
    Object.assign(state,{launcher,drawer,thread:drawer.querySelector('.caseChatThread'),input:drawer.querySelector('textarea'),send:drawer.querySelector('.caseChatSend'),stop:drawer.querySelector('.caseChatStop'),error:drawer.querySelector('.caseChatError'),suggestions:drawer.querySelector('.caseChatSuggestions')});
    drawer.querySelector('.caseChatHeader p').textContent='正在聊「'+state.row.title+'」';
    ['这个案例最值得关注的结论是什么？','这张图应该怎么看？','这个分析有哪些局限？'].forEach(text=>{const button=document.createElement('button');button.type='button';button.textContent=text+' ↗';button.onclick=()=>send(state,text);state.suggestions.append(button);});
    launcher.onclick=()=>setOpen(true);drawer.querySelector('.caseChatClose').onclick=()=>setOpen(false);
    drawer.querySelector('form').onsubmit=event=>{event.preventDefault();void send(state,state.input.value);};
    state.input.oninput=()=>update(state);state.input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing&&!event.shiftKey&&!event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();void send(state,state.input.value);}};
    state.stop.onclick=()=>state.controller?.abort();
    state.thread.addEventListener('scroll',()=>{state.follow=state.thread.scrollHeight-state.thread.scrollTop-state.thread.clientHeight<100;},{passive:true});
    panel.append(drawer,launcher);panel.classList.add('has-case-assistant');active=state;
    const activity=panel.querySelector('.activityDrawer');
    if(activity){state.observer=new MutationObserver(()=>{if(activity.classList.contains('is-open')&&!drawer.hidden)setOpen(false,false);});state.observer.observe(activity,{attributes:true,attributeFilter:['class']});}
    for(const turn of state.turns){if(active!==state)return;if(turn.role==='user')userMessage(state,turn.text);else await answerMessage(state,turn.answer||{interpretation:turn.text},'案例追问');}
    state.suggestions.hidden=state.turns.length>0;
  }
  window.addEventListener('resize',()=>{if(active&&!active.drawer.hidden)active.panel.querySelector('.conversation').inert=!!window.matchMedia?.('(max-width:760px)').matches;});
  window.addEventListener('veya:case-chat-ready',event=>{void mount(event.detail);});
  window.addEventListener('veya:case-chat-reset',dispose);
  window.addEventListener('veya:case-chat-close',()=>setOpen(false));
})();
