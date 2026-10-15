(() => {
  'use strict';
  const $ = id => document.getElementById(id), workspace = $('widgetWorkspace');
  if (!workspace) return;
  const shell = document.querySelector('.shell'), canvas = $('widgetCanvas');
  const KEY = 'mentora-widget-boards-v1', GAP = 20, ROW = 24;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => crypto.randomUUID();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || lo));
  const mobile = () => window.innerWidth <= 760;
  let boards = [], activeId = '', catalog = [], category = '全部', componentId = '', internal = false, nameAction = 'rename';
  const jobs = new Map(), libraryInputs = {};
  const current = () => boards.find(b => b.id === activeId);
  function notice(text) { const status=$('widgetStatus');status.textContent=text;status.hidden=!text; }
  function safeUrl(value) {
    try { const u = new URL(value, location.href); return u.origin === location.origin && /\/(generated|share-artifact)\/[^/]+\.html$/.test(u.pathname) ? u.pathname + u.search : ''; } catch { return ''; }
  }
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '{}');
      boards = (Array.isArray(data.boards) ? data.boards : []).slice(0, 40).filter(b => b && typeof b.id === 'string').map(b => ({id:b.id,title:String(b.title || '我的看板').slice(0,48),messages:Array.isArray(b.messages)?b.messages.slice(-12):[],cards:(Array.isArray(b.cards)?b.cards:[]).slice(0,60).filter(c=>c&&typeof c.id==='string').map(c=>({...c,url:safeUrl(c.url),w:clamp(c.w,3,12),h:clamp(c.h,10,40),x:clamp(c.x,0,9),y:clamp(c.y,0,10000),status:c.status==='loading'?'error':c.status,error:c.status==='loading'?'上次生成已中断，请重试。':c.error}))}));
      activeId = data.activeId;
    } catch { boards = []; }
    if (!boards.length) boards.push({id:uid(),title:'我的看板',cards:[],messages:[]});
    if (!current()) activeId = boards[0].id;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({version:1,activeId,boards})); notice(jobs.has(activeId)?'正在生成图表，你可以切换看板继续浏览…':'已自动保存 · 当前浏览器'); }
    catch { notice('浏览器存储空间不足，当前更改尚未保存。'); }
  }
  function overlaps(a,b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
  function settle(board, anchor) {
    const placed = [];
    for (const card of [anchor,...board.cards.filter(c=>c!==anchor)].filter(Boolean)) {
      card.w=clamp(card.w,3,12);card.x=clamp(card.x,0,12-card.w);card.h=clamp(card.h,10,40);card.y=Math.max(0,card.y);
      let hit; while ((hit=placed.find(p=>overlaps(p,card)))) card.y=hit.y+hit.h+1;
      placed.push(card);
    }
  }
  function place(board, card) {
    card.x=0;card.y=0;
    for (let y=0;y<10000;y++) {
      for (let x=0;x<=12-card.w;x+=3) { card.x=x;card.y=y;if(!board.cards.some(c=>overlaps(c,card)))return; }
    }
  }
  function frameUrl(card) {
    const url = new URL(card.url, location.origin);
    url.pathname = url.pathname.replace('/generated/','/share-artifact/');
    url.searchParams.set('theme',document.documentElement.dataset.theme || 'dark');
    url.searchParams.set('canvas','1');
    return url.pathname+url.search;
  }
  function applyLayout() {
    const board=current();if(!board)return;
    const width=canvas.clientWidth, unit=(width+GAP)/12;
    let height=0;
    const sorted=[...board.cards].sort((a,b)=>a.y-b.y||a.x-b.x);
    for (const card of mobile()?sorted:board.cards) {
      const node=canvas.querySelector(`[data-card="${CSS.escape(card.id)}"]`);if(!node)continue;
      const h=card.h*ROW;
      Object.assign(node.style,{left:mobile()?'0px':`${card.x*unit}px`,top:`${mobile()?height:card.y*ROW}px`,width:mobile()?'100%':`${card.w*unit-GAP}px`,height:`${h}px`});
      height=mobile()?height+h+GAP:Math.max(height,card.y*ROW+h+GAP);
    }
    canvas.style.height=board.cards.length?`${height}px`:'';
  }
  function cardNode(card) {
    const el=document.createElement('article');el.className='widgetCard';el.dataset.card=card.id;
    el.innerHTML=`<header class="widgetCardHeader" tabindex="0" aria-label="拖动图表，方向键移动"><span class="widgetGrip" aria-hidden="true">⠿</span><span class="widgetCardTitle">${esc(card.title)}</span><div class="widgetCardActions"><button type="button" data-size="narrow" title="缩窄图表" aria-label="缩窄图表">−</button><button type="button" data-size="wide" title="加宽图表" aria-label="加宽图表">＋</button><button type="button" data-open title="打开完整图表" aria-label="打开完整图表">↗</button><button type="button" data-remove title="移除图表" aria-label="移除图表">×</button></div></header>`;
    if (card.url && card.status==='ready') {
      const frame=document.createElement('iframe');frame.title=card.title;frame.src=frameUrl(card);frame.loading='lazy';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups');
      frame.addEventListener('load',()=>{try {const doc=frame.contentDocument;const title=(doc?.querySelector('h1,h2,.chart-title,.module-title')?.textContent||doc?.title||'').trim();if(title&&title.length<160&&title!==card.title){card.title=title;el.querySelector('.widgetCardTitle').textContent=title;frame.title=title;save();}}catch { /* Cross-origin subframes keep their supplied title. */ }});el.append(frame);
    } else {
      const body=document.createElement('div');body.className='widgetCardBody';
      body.innerHTML=card.status==='loading'?`<div class="widgetLoading" aria-hidden="true"></div><p>${esc(card.loadingText||'正在获取数据、生成图表…')}</p>`:`<p>${esc(card.error||'图表暂不可用，请重新生成。')}</p><button type="button" data-retry>重新生成</button>`;el.append(body);
    }
    const resize=document.createElement('div');resize.className='widgetResize';resize.title='拖动调整宽高';resize.setAttribute('role','slider');resize.tabIndex=0;resize.setAttribute('aria-label','调整图表尺寸，方向键调整');resize.setAttribute('aria-valuemin','3');resize.setAttribute('aria-valuemax','12');resize.setAttribute('aria-valuenow',card.w);el.append(resize);
    return el;
  }
  function render() {
    const board=current();if(!board)return;
    $('widgetBoardTitle').textContent=board.title;
    $('widgetTabs').innerHTML=boards.map(b=>`<button role="tab" id="widget-tab-${esc(b.id)}" aria-selected="${b.id===activeId}" data-board="${esc(b.id)}" aria-controls="widgetCanvas">${esc(b.title)}</button>`).join('');
    canvas.setAttribute('role','tabpanel');canvas.setAttribute('aria-labelledby',`widget-tab-${board.id}`);
    canvas.replaceChildren(...board.cards.map(cardNode));$('widgetEmpty').hidden=!!board.cards.length;
    $('widgetGenerate').hidden=jobs.has(activeId);$('widgetStop').hidden=!jobs.has(activeId);
    applyLayout();notice(jobs.has(activeId)?'正在生成图表，你可以切换看板继续浏览…':'');
  }
  function route(push=true) {
    const url=new URL(location.href);['task','run','dayResult','dayShare'].forEach(k=>url.searchParams.delete(k));url.searchParams.set('tab','widgets');url.searchParams.set('board',activeId);history[push?'pushState':'replaceState'](null,'',url);
  }
  function enter(push=true) {
    if(typeof closeActivityDrawer==='function')closeActivityDrawer();
    internal=true;
    try {window.dispatchEvent(new CustomEvent('veya:chat-navigate'));} finally {internal=false;}
    shell.classList.remove('tasks-view');$('taskWorkspace').hidden=true;$('taskSidebar').hidden=true;
    shell.classList.add('widgets-view');workspace.hidden=false;$('widgetSidebar').hidden=false;
    for(const id of ['navHome','navTasks','railHome','railTasks']){$(id)?.classList.remove('is-selected','is-active');$(id)?.removeAttribute('aria-current');}
    for(const id of ['navWidgets','railWidgets']){$(id)?.classList.add(id==='navWidgets'?'is-selected':'is-active');$(id)?.setAttribute('aria-current','page');}
    if(typeof setSidebarCollapsed==='function')setSidebarCollapsed(mobile());
    route(push);render();
  }
  function leave() {workspace.hidden=true;$('widgetSidebar').hidden=true;shell.classList.remove('widgets-view');for(const id of ['navWidgets','railWidgets']){$(id)?.classList.remove('is-selected','is-active');$(id)?.removeAttribute('aria-current');}}
  async function library() {
    $('widgetLibrary').showModal();
    if(!catalog.length) {
      try {const response=await fetch('/static/widget-catalog.json');if(!response.ok)throw Error();catalog=await response.json();componentId=catalog[0]?.id||'';}
      catch {$('widgetLibraryList').textContent='图表库暂时无法加载，请关闭后重试。';return;}
    }
    renderLibrary();
  }
  function renderLibrary() {
    $('widgetCategories').innerHTML=['全部',...new Set(catalog.map(c=>c.category))].map(c=>`<button type="button" data-category="${esc(c)}" aria-pressed="${category===c}">${esc(c)}</button>`).join('');
    const term=$('widgetSearch').value.trim().toLowerCase();
    const items=catalog.filter(c=>(category==='全部'||c.category===category)&&`${c.title} ${c.id} ${c.description} ${c.provider||''}`.toLowerCase().includes(term));
    if(!items.some(c=>c.id===componentId))componentId=items[0]?.id||'';
    $('widgetLibraryList').innerHTML=items.length?items.map(c=>`<button type="button" data-component="${esc(c.id)}" aria-pressed="${componentId===c.id}"><strong>${esc(c.title)}<span class="widgetProvider">${c.provider==='TradingView'?'TradingView':'业务图表'}</span></strong><small>${esc(c.description)}</small></button>`).join(''):'<p>没有找到匹配的图表</p>';
    $('widgetAddForm').querySelector('button').disabled=!componentId;
    const selected=catalog.find(c=>c.id===componentId),market=selected?.inputMode==='market',group=selected?.inputMode==='group';
    const input=$('widgetSymbol'),mode=selected?.inputMode||'symbol';
    if(input.dataset.mode&&input.dataset.mode!==mode){libraryInputs[input.dataset.mode]=input.value;input.value=libraryInputs[mode]||'';}input.dataset.mode=mode;
    $('widgetSymbolLabel').textContent=market?'市场或范围（可选）':group?'关注标的（可多个）':'关注标的';
    const directMarket=market&&selected?.provider==='TradingView';
    $('widgetSymbol').hidden=directMarket;$('widgetMarket').hidden=!directMarket;
    if(directMarket){const options=selected.widget==='screener'?[['default','美股'],['china','中国 A 股'],['hongkong','港股'],['japan','日本'],['uk','英国'],['germany','德国']]:selected.widget==='economic-calendar'?[['default','全球'],['us','美国'],['cn','中国'],['eu','欧元区'],['gb','英国'],['jp','日本']]:[['default',selected.defaultScope||'默认市场']];$('widgetMarket').innerHTML=options.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');}
    $('widgetSymbol').required=!market;
    $('widgetSymbol').placeholder=market?`留空使用：${selected.defaultScope}`:selected?.provider==='TradingView'?(group?'例如 NASDAQ:AAPL、NASDAQ:MSFT、NASDAQ:NVDA':'例如 NASDAQ:AAPL、HKEX:700'):'例如 AAPL、NVDA 或 MSFT';
    $('widgetLibraryNote').textContent=selected?.provider==='TradingView'?'由 TradingView 托管展示；行情可能受交易所延迟与可用性限制。':'公司财务图表适用于美股，按生成时的数据展示。';
  }
  async function addTradingView(message, component, retryId, market='default') {
    const board=current();if(!board)return;
    if(board.cards.length>=60&&!retryId){notice('当前看板最多放置 60 张图表，请新建看板继续。');return;}
    const widget=component.widget||component.id.slice(3),isMarket=['screener','crypto-mkt-screener','stock-heatmap','crypto-heatmap','market-overview','economic-calendar','top-stories'].includes(widget);
    const symbols=isMarket?[]:message.split(/[,，、;；\s]+/).map(s=>s.trim()).filter(Boolean);
    let card=retryId&&board.cards.find(c=>c.id===retryId);
    if(card)Object.assign(card,{status:'loading',error:'',url:'',loadingText:'正在加载 TradingView…',market});
    else {card={id:uid(),title:component.title,w:component.width||6,h:component.height||18,status:'loading',loadingText:'正在加载 TradingView…',url:'',request:message,component:component.id,market};place(board,card);board.cards.push(card);}
    save();render();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch('/api/widgets/tradingview',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({widget,symbols,market,theme:document.documentElement.dataset.theme==='light'?'light':'dark',language:'zh-CN'})});
      const result=await response.json();if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'组件添加失败，请重试。');
      const url=safeUrl(result.url);if(!url)throw Error('组件没有返回可用的地址。');
      if(!boards.includes(board)||!board.cards.includes(card))return;
      Object.assign(card,{url,title:result.title||component.title,status:'ready',createdAt:new Date().toISOString()});
    } catch(error){if(boards.includes(board)&&board.cards.includes(card)){card.status='error';card.error=error.name==='AbortError'?'组件加载超时，请重试。':error.message;}}
    finally{clearTimeout(timeout);save();if(activeId===board.id)render();}
  }
  async function generate(message, component=null, retryId=null, market='default') {
    if(component?.provider==='TradingView'||component?.id?.startsWith('tv-'))return addTradingView(message,component,retryId,market);

    if(['kline','multi_intraday'].includes(component?.id)){notice('该行情组件已从看板库移除，请选择其他图表。');return;}
    const board=current();if(!board||jobs.has(board.id)){notice('当前看板正在生成，请稍候或切换看板。');return;}
    if(board.cards.length>=60&&!retryId){notice('当前看板最多放置 60 张图表，请新建看板继续。');return;}
    const controller=new AbortController();jobs.set(board.id,controller);
    let pending=retryId&&board.cards.find(c=>c.id===retryId);
    if(pending)Object.assign(pending,{status:'loading',error:'',url:''});
    else {pending={id:uid(),title:component?`${component.title} · ${message}`:'正在构建看板',w:component?.width||6,h:component?.height||18,status:'loading',url:'',request:message,component:component?.id||''};place(board,pending);board.cards.push(pending);}
    const pendingId=pending.id;
    board.messages.push({role:'user',content:message});board.messages=board.messages.slice(-12);
    if(board.title==='我的看板'&&!component){const named=message.match(/(?:做|建|生成|创建)(?:一[个张])?(.{2,16}?看板)/),symbol=message.match(/\b[A-Z][A-Z0-9.-]{0,9}\b/);if(named)board.title=named[1];else if(symbol)board.title=symbol[0]+' 看板';}
    save();render();
    let final=null, failure='';
    const request=component?`请为标的 ${message} 生成一个独立的「${component.title}」金融业务图表，使用 business-chart-recall 的 ${component.id}.py。`:`请根据我的需求，为金融看板选择并生成 2 到 6 张各自独立的金融业务图表：${message}`;
    const question=`${request}\n这是 Widget 画布请求。看板库已移除股价与 K 线（kline.py）、多股分时（multi_intraday.py），不得调用或加入这两个组件，也不要用自定义价格走势图替代它们。现在支持 trading-view-chart 技能的 18 种官方托管组件：价格走势、行情列表、筛选器、热力图、技术分析、财务概览、新闻、经济日历等，可根据业务需求选用；行情展示优先选择 TradingView。原生业务图表继续用于财务、估值、评级等分析。用户明确要求被移除的原生组件时说明已移除，可选择 TradingView。请遵守项目技能路由，调用现有业务组件的原生脚本取真实数据；先阅读各组件 schema，保留原生交互、主题、语言和数据来源。原生公司财报、估值与评级只用于契约支持的美股公司，其他资产只选匹配组件。每个图表单独输出 standalone HTML 到 outputs/generated，并各用 AIME_CHART 标记返回，方便画布分别拖拽。不要合并为一份报告、不要创建 dashboard 外壳、不要用示例或编造数据填充。手动指定图表时只生成指定的一张。数据不可用时明确说明，不使用无关标的代替。标题自然具体，不预写未经证实的结论。当前看板已有：${board.cards.filter(c=>c.status==='ready').map(c=>c.title).join('；')||'暂无'}。`;
    try {
      const response=await fetch('/api/chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({question,sessionId:`widget-${board.id}-${pendingId}`,history:board.messages.slice(0,-1),images:[],reasoningFramework:typeof DEFAULT_REASONING_FRAMEWORK==='string'?DEFAULT_REASONING_FRAMEWORK:'deepseek',inferenceModel:typeof DEFAULT_INFERENCE_MODEL==='string'?DEFAULT_INFERENCE_MODEL:'',themeMode:document.documentElement.dataset.theme==='light'?'light':'dark'})});
      if(!response.ok)throw Error(`生成请求失败（${response.status}）`);
      await readEventStream(response.body,(event,data)=>{
        if(event==='final')final=data;
        if(event==='error')failure=data.detail||'图表生成失败，请重试。';
        if(event==='status'||event==='progress') {
          const status=String(data.text||data.detail||data.message||data.title||'正在处理金融数据…').slice(0,180);
          if(activeId===board.id){notice(status);const p=canvas.querySelector(`[data-card="${CSS.escape(pendingId)}"] .widgetCardBody p`);if(p)p.textContent=status;}
        }
      });
      const artifacts=final?(Array.isArray(final.reportArtifacts)&&final.reportArtifacts.length?final.reportArtifacts:[{url:final.reportUrl||final.htmlUrl,title:component?.title}]):[];
      const seen=new Set();const valid=artifacts.filter(a=>a&&safeUrl(a.url)&&!seen.has(safeUrl(a.url))&&seen.add(safeUrl(a.url)));
      if(!valid.length)throw Error(failure||String(final?.interpretation||'没有返回可用图表，请补充具体标的后重试。').replace(/\[\[.*?\]\]/g,'').slice(0,500));
      // Do not resurrect a card or board removed while its request was running.
      if(!boards.includes(board)||!board.cards.some(c=>c.id===pendingId))return;
      const slot={x:pending.x,y:pending.y,w:pending.w,h:pending.h};board.cards=board.cards.filter(c=>c.id!==pendingId);
      valid.slice(0,60-board.cards.length).forEach((a,i)=>{const card={id:uid(),title:String(a.title||a.label||component?.title||'金融图表').slice(0,160),url:safeUrl(a.url),status:'ready',w:6,h:18,request:message,component:component?.id||'',createdAt:new Date().toISOString()};if(i===0)Object.assign(card,slot);else place(board,card);board.cards.push(card);});
      settle(board,board.cards.find(c=>c.x===slot.x&&c.y===slot.y));
      board.messages.push({role:'assistant',content:`已添加 ${valid.length} 张图表。${String(final.interpretation||'').slice(0,1500)}`});
    } catch(error) {
      if(boards.includes(board)&&board.cards.includes(pending)){pending.status='error';pending.error=error.name==='AbortError'?'生成已停止，可以重新生成。':error.message;}
    } finally {
      jobs.delete(board.id);save();if(activeId===board.id){render();if(pending.status==='error')notice(pending.error);}
    }
  }
  function editName(action) {
    if(action==='new'&&boards.length>=40){notice('最多保存 40 个看板，请先整理已有看板。');return;}
    nameAction=action;$('widgetNameHeading').textContent=action==='new'?'新建看板':'重命名看板';$('widgetNameInput').value=action==='new'?'':current().title;$('widgetNameDialog').showModal();$('widgetNameInput').focus();
  }
  $('widgetNameDialog').addEventListener('close',()=>{
    if($('widgetNameDialog').returnValue!=='save')return;const title=$('widgetNameInput').value.trim();if(!title)return;
    if(nameAction==='new'){const board={id:uid(),title,cards:[],messages:[]};boards.push(board);activeId=board.id;}else current().title=title;
    save();route();render();if(mobile()&&typeof setSidebarCollapsed==='function')setSidebarCollapsed(true);
  });
  $('widgetNew').onclick=()=>editName('new');$('widgetRename').onclick=()=>editName('rename');
  $('widgetDelete').onclick=()=>{if(!confirm(`删除「${current().title}」及其看板布局？`))return;jobs.get(activeId)?.abort();boards=boards.filter(b=>b.id!==activeId);if(!boards.length)boards.push({id:uid(),title:'我的看板',cards:[],messages:[]});activeId=boards[0].id;save();route();render();};
  $('widgetTabs').onclick=event=>{const button=event.target.closest('[data-board]');if(!button)return;activeId=button.dataset.board;save();route();render();if(mobile()&&typeof setSidebarCollapsed==='function')setSidebarCollapsed(true);};
  $('widgetTabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const i=boards.findIndex(b=>b.id===activeId);activeId=boards[(i+(['ArrowRight','ArrowDown'].includes(event.key)?1:boards.length-1))%boards.length].id;save();route();render();$('widgetTabs').querySelector('[aria-selected=true]')?.focus();});
  $('widgetSidebarLibrary').onclick=library;$('widgetLibraryOpen').onclick=library;$('widgetEmptyAdd').onclick=library;$('widgetLibraryClose').onclick=()=>$('widgetLibrary').close();
  $('widgetSearch').oninput=renderLibrary;
  $('widgetCategories').onclick=event=>{const b=event.target.closest('[data-category]');if(b){category=b.dataset.category;renderLibrary();}};
  $('widgetLibraryList').onclick=event=>{const b=event.target.closest('[data-component]');if(b){componentId=b.dataset.component;renderLibrary();}};
  $('widgetAddForm').onsubmit=event=>{event.preventDefault();const symbol=$('widgetSymbol').value.trim(),component=catalog.find(c=>c.id===componentId);if(!component||(!symbol&&component.inputMode!=='market'))return;if(jobs.has(activeId)&&component.provider!=='TradingView'){notice('请等待当前图表完成后再添加。');return;}$('widgetLibrary').close();generate(symbol||component.defaultScope,component,null,component.inputMode==='market'&&component.provider==='TradingView'?$('widgetMarket').value:'default');};
  $('widgetForm').onsubmit=event=>{event.preventDefault();const text=$('widgetPrompt').value.trim();if(!text||jobs.has(activeId))return;$('widgetPrompt').value='';updateComposer();generate(text);};
  function updateComposer(){const input=$('widgetPrompt');input.style.height='40px';const height=Math.max(40,Math.min(120,input.scrollHeight));input.style.height=height+'px';input.style.overflowY=input.scrollHeight>height?'auto':'hidden';input.closest('.widgetComposerBox').classList.toggle('is-multiline',height>44);$('widgetGenerate').classList.toggle('is-ready',!!input.value.trim());}
  $('widgetPrompt').oninput=updateComposer;
  $('widgetPrompt').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('widgetForm').requestSubmit();}};
  $('widgetStop').onclick=()=>jobs.get(activeId)?.abort();
  workspace.addEventListener('click',event=>{const b=event.target.closest('[data-widget-prompt]');if(b){$('widgetPrompt').value=b.dataset.widgetPrompt;updateComposer();$('widgetPrompt').focus();}});
  canvas.addEventListener('click',event=>{
    const el=event.target.closest('[data-card]');if(!el)return;const board=current(),card=board.cards.find(c=>c.id===el.dataset.card);if(!card)return;
    if(event.target.closest('[data-remove]')){board.cards=board.cards.filter(c=>c!==card);save();render();}
    if(event.target.closest('[data-open]')&&card.url)window.open(frameUrl(card),'_blank','noopener');
    if(event.target.closest('[data-retry]'))generate(card.request,catalog.find(c=>c.id===card.component)|| (card.component?{id:card.component,title:card.title}:null),card.id,card.market||'default');
    const size=event.target.closest('[data-size]');if(size){card.w=clamp(card.w+(size.dataset.size==='wide'?3:-3),3,12);settle(board,card);save();applyLayout();}
  });
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||event.target.closest('button'))return;
    const el=event.target.closest('[data-card]');if(!el)return;event.preventDefault();const board=current(),card=board.cards.find(c=>c.id===el.dataset.card),resize=event.target.classList.contains('widgetResize');
    if(resize){card.w=clamp(card.w+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0),3,12);card.h=clamp(card.h+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0),10,40);event.target.setAttribute('aria-valuenow',card.w);}else {card.x=clamp(card.x+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0),0,12-card.w);card.y=Math.max(0,card.y+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0));}
    settle(board,card);save();applyLayout();
  });
  canvas.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('.widgetCardHeader,.widgetResize');if(!handle||event.target.closest('button')||event.button!==0)return;
    const el=handle.closest('[data-card]'),board=current(),card=board.cards.find(c=>c.id===el.dataset.card);if(!card)return;
    event.preventDefault();const resize=handle.classList.contains('widgetResize'),start={px:event.clientX,py:event.clientY,x:card.x,y:card.y,w:card.w,h:card.h},unit=(canvas.clientWidth+GAP)/12;
    el.classList.add('is-moving');canvas.classList.add('is-interacting');handle.setPointerCapture(event.pointerId);
    const move=e=>{const dx=e.clientX-start.px,dy=e.clientY-start.py;
      if(resize){card.w=mobile()?start.w:clamp(Math.round(start.w+dx/unit),3,12);card.h=clamp(Math.round(start.h+dy/ROW),10,40);}else {card.x=mobile()?0:clamp(Math.round(start.x+dx/unit),0,12-card.w);card.y=Math.max(0,Math.round(start.y+dy/ROW));}
      applyLayout();
    };
    const end=e=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);el.classList.remove('is-moving');canvas.classList.remove('is-interacting');settle(board,card);save();applyLayout();};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  });
  document.addEventListener('click',event=>{if(event.target.closest('#navWidgets,#railWidgets'))enter();else if(event.target.closest('#navTasks,#railTasks,#dayCustomizeTasks'))leave();});
  window.addEventListener('veya:chat-navigate',()=>{if(!internal)leave();});
  window.addEventListener('popstate',()=>{if(new URL(location.href).searchParams.get('tab')==='widgets'){const id=new URL(location.href).searchParams.get('board');if(boards.some(b=>b.id===id))activeId=id;enter(false);}else leave();});
  new ResizeObserver(()=>applyLayout()).observe(canvas);
  new MutationObserver(()=>{for(const frame of canvas.querySelectorAll('iframe')){const card=current()?.cards.find(c=>c.id===frame.closest('[data-card]').dataset.card);if(card)frame.src=frameUrl(card);}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  load();
  if(new URL(location.href).searchParams.get('tab')==='widgets'){const id=new URL(location.href).searchParams.get('board');if(boards.some(b=>b.id===id))activeId=id;enter(false);}
})();
