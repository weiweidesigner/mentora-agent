(() => {
  'use strict';
  const $ = id => document.getElementById(id), workspace = $('widgetWorkspace');
  if (!workspace || workspace.dataset.widgetController === 'ready') return;
  workspace.dataset.widgetController = 'ready';
  const syncReasoningComposer=()=>{if(typeof syncReasoningStrengthComposer==='function')syncReasoningStrengthComposer();};
  new MutationObserver(syncReasoningComposer).observe(workspace,{attributes:true,attributeFilter:['hidden']});
  syncReasoningComposer();
  const shell = document.querySelector('.shell'), canvas = $('widgetCanvas');
  const KEY = 'mentora-widget-boards-v1', GAP = 20, ROW = 24;
  const systemBoardIds = new Set(['starter-stocks','starter-crypto','starter-forex']);
  const advancedChartParameters = ['interval','studies','style','compareSymbols','watchlist','timezone','allowSymbolChange','showDrawingToolbar','showTopToolbar','showLegend','showVolume','showDetails','showHotlist','showDateRanges','showCalendar','saveImage'];
  const isSystemBoard = board => systemBoardIds.has(board.id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => crypto.randomUUID();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || lo));
  const mobile = () => window.innerWidth <= 760;
  let boards = [], activeId = '', catalog = [], category = '全部', componentId = '', internal = false, nameAction = 'rename';
  const jobs = new Map(), libraryInputs = {}, commandControllers=new Map(), undoByBoard=new Map();
  let selectedCardId="", openIds=[], editingCardId='', draggingTab='', pendingArtifact=null;
  let defaultsVersion=0,defaultsLoading=false,initialEmptyId='';
  let generationCatalog=[],generationCatalogLoaded=false;
  const refreshingBoards=new Set(), pageRefreshedAt=new Date();
  const refreshTime=value=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')} ${String(value.getHours()).padStart(2,'0')}:${String(value.getMinutes()).padStart(2,'0')}`;
  const componentFor=id=>generationCatalog.find(c=>c.id===id)||catalog.find(c=>c.id===id);
  async function ensureGenerationCatalog(){await ensureCatalog();if(!generationCatalogLoaded){const response=await fetch('/api/widgets/generation-catalog');if(!response.ok)throw Error('组件能力暂不可用，请重试。');generationCatalog=await response.json();generationCatalogLoaded=true;}}
  function renderRefresh(){
    const board=current(),button=$('widgetRefresh'),time=$('widgetLastRefresh');if(!button||!time)return;
    const busy=!!board&&(jobs.has(board.id)||commandControllers.has(board.id));
    button.disabled=!board?.cards.length||busy;button.classList.toggle('is-refreshing',refreshingBoards.has(board?.id));
    button.setAttribute('aria-busy',String(refreshingBoards.has(board?.id)));
    button.querySelector('span').textContent=refreshingBoards.has(board?.id)?'刷新中':'刷新';
    const refreshed=new Date(board?.lastRefreshedAt||'');
    const shown=Number.isNaN(refreshed.getTime())?pageRefreshedAt:refreshed;
    time.textContent='上次刷新 '+refreshTime(shown);
    time.title='上次页面刷新：'+refreshTime(shown);
    time.dateTime=shown.toISOString();
  }
  const trashIcon=`<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M966.128 181.12H840.96c-0.168 0-0.32-0.096-0.488-0.096-0.16 0-0.312 0.096-0.48 0.096H184.064c-0.176 0-0.32-0.096-0.48-0.096-0.16 0-0.304 0.096-0.48 0.096H57.872a32.6 32.6 0 1 0 0 65.208h93.104v651.928c0 69.32 56.392 125.744 125.712 125.744h470.688c69.32 0 125.712-56.424 125.712-125.744V246.328h93.04a32.6 32.6 0 1 0 0-65.208z m-158.256 717.136c0 33.376-27.136 60.528-60.504 60.528H276.688c-33.352 0-60.496-27.16-60.496-60.528V246.328h591.68v651.928z"/><path d="M346.488 814.744a32.608 32.608 0 0 0 32.608-32.608V422.888a32.6 32.6 0 0 0-65.216 0v359.24a32.6 32.6 0 0 0 32.608 32.616zM512 814.744a32.6 32.6 0 0 0 32.608-32.608V422.888a32.6 32.6 0 0 0-65.216 0v359.24A32.6 32.6 0 0 0 512 814.744zM677.544 814.744a32.584 32.584 0 0 0 32.6-32.608V422.888c0-18.008-14.576-32.6-32.6-32.6s-32.608 14.592-32.608 32.6v359.24a32.592 32.592 0 0 0 32.608 32.616zM318.848 157.6a32.608 32.608 0 0 0 32.608-32.6c0-23.808 64.048-59.792 160.576-59.792 96.512 0 160.544 35.984 160.544 59.792a32.6 32.6 0 0 0 32.608 32.6 32.592 32.592 0 0 0 32.6-32.6C737.792 53.736 640.736 0 512.032 0 383.312 0 286.24 53.736 286.24 125a32.608 32.608 0 0 0 32.608 32.6z"/></svg>`;
  const configIcon=`<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M114.11 276.65h474.9c13.49 54.81 63.05 95.59 121.96 95.59s108.47-40.78 121.96-95.59h76.86c16.57 0 30-13.43 30-30s-13.43-30-30-30h-76.86c-13.49-54.81-63.05-95.59-121.96-95.59s-108.47 40.78-121.96 95.59h-474.9c-16.57 0-30 13.43-30 30s13.43 30 30 30z m596.85-95.59c36.17 0 65.59 29.42 65.59 65.59s-29.42 65.59-65.59 65.59-65.59-29.42-65.59-65.59 29.42-65.59 65.59-65.59zM114.11 542h97.06c13.49 54.81 63.04 95.59 121.96 95.59S441.6 596.81 455.09 542h454.8c16.57 0 30-13.43 30-30s-13.43-30-30-30h-454.8c-13.49-54.81-63.04-95.59-121.96-95.59S224.66 427.19 211.17 482h-97.06c-16.57 0-30 13.43-30 30s13.43 30 30 30z m219.02-95.59c36.17 0 65.59 29.42 65.59 65.59s-29.42 65.59-65.59 65.59-65.59-29.42-65.59-65.59 29.42-65.59 65.59-65.59z m576.75 300.94H737.33c-13.49-54.81-63.05-95.59-121.96-95.59s-108.47 40.78-121.96 95.59h-379.3c-16.57 0-30 13.43-30 30s13.43 30 30 30h379.31c13.49 54.81 63.04 95.59 121.96 95.59s108.47-40.78 121.96-95.59h172.55c16.57 0 30-13.43 30-30s-13.43-30-30-30z m-294.51 95.59c-36.17 0-65.59-29.42-65.59-65.59s29.42-65.59 65.59-65.59 65.59 29.42 65.59 65.59-29.42 65.59-65.59 65.59z"/></svg>`;
  const current = () => boards.find(b => b.id === activeId);
  const isPlaceholderTitle = title => ['', '自定义', '我的widget', '我的看板', '未命名看板', '新建看板'].includes(String(title||'').replace(/\s+/g,'').toLowerCase());
  function repairBoardTitles(){
    let changed=false;
    for(const board of boards){
      if(isSystemBoard(board)||!isPlaceholderTitle(board.title))continue;
      const cards=board.cards.filter(card=>card.status==='ready'&&card.title&&!/^(?:正在|加载)/.test(card.title));
      if(!cards.length)continue;
      const symbols=[...new Set(cards.flatMap(card=>card.parameters?.symbols||[]).map(symbol=>String(symbol).split(':').at(-1)))];
      const subject=symbols.length?symbols.slice(0,3).join('、'):cards[0].title;
      board.title=(cards.length===1?cards[0].title+'看板':subject+'综合分析看板').slice(0,48);
      changed=true;
    }
    return changed;
  }

  const progressByBoard=new Map();
  function setProgress(board,text){progressByBoard.set(board.id,text);if(activeId===board.id)notice(text);}
  function notice(text) { const status=$('widgetStatus');status.textContent=text;status.hidden=!text;status.classList.toggle("is-thinking",progressByBoard.has(activeId)); }
  function streamedWidgetText(event,data={}){
    const text=String(data.thoughtSummary||data.thought_summary||data.text||data.detail||data.message||data.title||'').replace(/\s+/g,' ').trim();
    if(!text||/^(?:正在连接|正在連接|连接模型|連接模型|Connecting to).*?(?:Agent|Harness|模型|model)/i.test(text)||data.key==='agent-connect')return '';
    if(event==='tool_step'&&!data.thoughtSummary&&!data.thought_summary)return '';
    return text.slice(0,180);
  }
  function safeUrl(value) {
    try { const u = new URL(value, location.href); return u.origin === location.origin && /\/(generated|share-artifact)\/[^/]+\.html$/.test(u.pathname) ? u.pathname + u.search : ''; } catch { return ''; }
  }
  const minRows=card=>card.contentHeight?Math.ceil(card.contentHeight/ROW):card.component==='tv-ticker-tape'?6:10;
  function compactTicker(board,card){
    if(card.component!=='tv-ticker-tape'||card.compactTickerVersion===1)return false;
    card.compactTickerVersion=1;const previous=card.h;card.h=6;const delta=previous-card.h;if(delta<=0)return false;
    for(const other of [...board.cards].sort((a,b)=>a.y-b.y)){if(other===card||other.y<card.y+previous)continue;const candidate={...other,y:other.y-delta};if(!board.cards.some(c=>c!==other&&overlaps(c,candidate)))other.y=candidate.y;}
    return true;
  }
  function pullFollowing(board,card,previousHeight){
    const delta=(previousHeight-card.contentHeight)/ROW;if(!delta)return;
    // Move lower rows first on growth so their old positions don't block a
    // whole stack from following the measured edge at the existing gap.
    for(const other of [...board.cards].sort((a,b)=>delta>0?a.y-b.y:b.y-a.y)){
      if(other===card||other.y<card.y+previousHeight/ROW)continue;
      const candidate={...other,y:other.y-delta};
      if(!board.cards.some(c=>c!==other&&overlaps(c,candidate)))other.y=candidate.y;
    }
  }
  const isOldSymbolNotice=m=>m?.role==='assistant'&&!m.scope&&/^已切换到 [A-Z0-9_.!/^+\-]+，更新了 \d+ 个单标的组件。(?:部分组件未能加载，可重新生成。)?$/.test(m.content||'');
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '{}');
      defaultsVersion=Number(data.defaultsVersion)||0;
      boards = (Array.isArray(data.boards) ? data.boards : []).slice(0, 40).filter(b => b && typeof b.id === 'string').map(b => ({id:b.id,title:String(b.title || '我的看板').slice(0,48),lastRefreshedAt:typeof b.lastRefreshedAt==='string'?b.lastRefreshedAt:'',focusSymbol:typeof b.focusSymbol==='string'?b.focusSymbol:'',chat:(Array.isArray(b.chat)?b.chat:[]).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&!isOldSymbolNotice(m)).slice(-40).map(m=>({role:m.role,content:m.content.slice(0,6000),scope:typeof m.scope==='string'?m.scope.slice(0,160):''})),messages:Array.isArray(b.messages)?b.messages.slice(-12):[],cards:(Array.isArray(b.cards)?b.cards:[]).slice(0,60).filter(c=>c&&typeof c.id==='string').map(c=>({...c,url:safeUrl(c.url),w:clamp(c.w,3,12),h:clamp(c.h,minRows(c),Math.max(40,minRows(c))),x:clamp(c.x,0,9),y:clamp(c.y,0,10000),status:c.status==='loading'?'error':c.status,error:c.status==='loading'?'上次生成已中断，请重试。':c.error}))}));
      activeId = data.activeId;openIds=Array.isArray(data.openIds)?[...new Set(data.openIds)].filter(id=>boards.some(b=>b.id===id)):boards.map(b=>b.id);
      if((Array.isArray(data.boards)?data.boards:[]).some(b=>Array.isArray(b?.chat)&&b.chat.some(isOldSymbolNotice)))localStorage.setItem(KEY,JSON.stringify({...data,boards}));
    } catch { boards = []; }
    if (!boards.length) {const board={id:uid(),title:'我的 Widget',cards:[],messages:[]};boards.push(board);openIds=[board.id];initialEmptyId=board.id;}
    for(const board of boards)for(const card of board.cards)compactTicker(board,card);
    // Repair the original starter layout after an earlier intrinsic measurement
    // was saved without pulling the following rows up. Leave moved cards alone.
    for(const board of boards){
      const quote=board.cards.find(c=>c.id===board.id.replace('starter-','')+'-symbol-info');
      const chart=board.cards.find(c=>c.id===board.id.replace('starter-','')+'-advanced-chart');
      if(board.id.startsWith('starter-')&&quote?.contentHeight&&quote.x===0&&quote.y===0&&quote.w===12&&chart?.x===0){
        const gap=chart.y*ROW-quote.contentHeight;
        if(gap>ROW&&gap<=4*ROW){const delta=(gap-ROW)/ROW,start=chart.y;for(const card of board.cards)if(card!==quote&&card.y>=start)card.y-=delta;}
      }
    }
    if(!openIds.includes(activeId))activeId=openIds[0]||'';
  }
  function save() {
    repairBoardTitles();
    try { localStorage.setItem(KEY, JSON.stringify({version:2,defaultsVersion,activeId,openIds,boards}));  }
    catch { notice('浏览器存储空间不足，当前更改尚未保存。'); }
  }
  function overlaps(a,b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
  async function ensureDefaultBoards(){
    if(defaultsLoading||(defaultsVersion>=1&&[...systemBoardIds].every(id=>boards.some(board=>board.id===id))))return;
    defaultsLoading=true;
    try{
      const response=await fetch('/api/widgets/default-boards'),data=await response.json();
      if(!response.ok||data.version!==1||!Array.isArray(data.boards)||data.boards.length!==3)return;
      if(data.boards.some(b=>!b.id||!Array.isArray(b.cards)||!b.cards.length||b.cards.some(c=>!safeUrl(c.url))))return;
      const placeholder=boards.find(b=>b.id===initialEmptyId),replaceEmpty=placeholder&&placeholder.title==='我的 Widget'&&!placeholder.cards.length&&!placeholder.messages.length;
      if(boards.length-(replaceEmpty?1:0)+data.boards.filter(b=>!boards.some(old=>old.id===b.id)).length>40)return;
      const selectDefault=replaceEmpty&&activeId===initialEmptyId;
      if(replaceEmpty){boards=boards.filter(b=>b!==placeholder);openIds=openIds.filter(id=>id!==placeholder.id);}
      for(const board of data.boards){if(boards.some(b=>b.id===board.id))continue;boards.push(board);openIds.push(board.id);}
      defaultsVersion=1;
      if(selectDefault)activeId=data.boards[0].id;
      save();
      if(!workspace.hidden){route(false);render();}
    }catch{/* A failed load leaves existing boards usable and can retry on the next visit. */}
    finally{defaultsLoading=false;}
  }
  function settle(board, anchor) {
    const placed = [];
    for (const card of [anchor,...board.cards.filter(c=>c!==anchor)].filter(Boolean)) {
      card.w=clamp(card.w,3,12);card.x=clamp(card.x,0,12-card.w);card.h=clamp(card.h,minRows(card),Math.max(40,minRows(card)));card.y=Math.max(0,card.y);
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
  function hydrateTradingView(card,spec,node){
    if(!spec.widget||!spec.config)return;const cfg=spec.config;let symbols;
    if(spec.widget==='market-data')symbols=(cfg.symbolsGroups||[]).flatMap(g=>(g.symbols||[]).map(s=>s.name));
    else if(spec.preset==='intraday')symbols=(cfg.symbols||[]).map(s=>s[s.length-1].split('|')[0]);
    else if(typeof cfg.symbol==='string')symbols=[cfg.symbol];
    if(['stock-market','market-summary'].includes(spec.widget)&&cfg.exchange){
      const labels={US:'美国',SSE:'上海证券交易所',SZSE:'深圳证券交易所',HKEX:'香港交易所',TSE:'东京证券交易所',LSE:'伦敦证券交易所'};
      const title=(spec.widget==='stock-market'?'股票市场':'市场摘要')+' · '+(labels[cfg.exchange]||cfg.exchange);
      card.component='tv-'+spec.widget;card.parameters={...card.parameters,symbols:[],market:cfg.exchange};
      if(!card.customTitle||/^(股票市场|市场摘要)\s*·\s*(美国|US)$/.test(card.title)){card.title=title;if(node)node.querySelector('.widgetCardTitle').textContent=title;}
      save();return;
    }
    if(!symbols?.length)return;
    const parameters={...card.parameters,symbols,...(cfg.interval?{interval:cfg.interval}:{}),...(spec.widget==='advanced-chart'?{studies:cfg.studies||[]}:{})};
    const component=spec.preset==='intraday'?'tv-intraday':'tv-'+spec.widget;
    if(card.component!==component||JSON.stringify(card.parameters)!==JSON.stringify(parameters)){card.component=component;card.parameters=parameters;save();}
    const frame=node?.querySelector('iframe');if(frame&&ashareMinuteSymbol(card)&&!frame.src.includes('/api/widgets/ashare-chart?'))frame.src=frameUrl(card);
  }
  function ashareMinuteSymbol(card) {
    if(card.component!=='tv-intraday')return '';
    const symbol=String(card.parameters?.symbols?.[0]||'').toUpperCase();
    const sh=symbol.match(/^(?:SSE|SHSE|SH):(6\d{5})$/),sz=symbol.match(/^(?:SZSE|SZ):([03]\d{5})$/);
    if(sh)return sh[1]+'.SH';if(sz)return sz[1]+'.SZ';
    return /^(?:6\d{5}\.SH|[03]\d{5}\.SZ)$/.test(symbol)?symbol:'';
  }
  function frameUrl(card) {
    const ashare=ashareMinuteSymbol(card);
    if(ashare)return '/api/widgets/ashare-chart?symbol='+encodeURIComponent(ashare)+'&theme='+(document.documentElement.dataset.theme||'dark');
    const url = new URL(card.url, location.origin);
    url.pathname = url.pathname.replace('/generated/','/share-artifact/');
    url.searchParams.set('theme',document.documentElement.dataset.theme || 'dark');
    url.searchParams.set('canvas','1');
    if(String(card.component||'').startsWith('generic-'))url.searchParams.set('widgetTitle','0');
    if(card.refreshedAt)url.searchParams.set('refresh',card.refreshedAt);
    return url.pathname+url.search;
  }
  function normalizeVerticalGaps(board){
    const placed=[];let changed=false;
    for(const card of [...board.cards].sort((a,b)=>a.y-b.y||a.x-b.x)){
      const above=placed.filter(p=>p.x<card.x+card.w&&p.x+p.w>card.x);
      const top=Math.max(0,...above.map(p=>p.y*ROW+(p.contentHeight||p.h*ROW)+24));
      if(Math.abs(card.y*ROW-top)>.1){card.y=top/ROW;changed=true;}
      placed.push(card);
    }
    if(changed)save();
  }
  function applyLayout() {
    const board=current();if(!board)return;
    if(!canvas.classList.contains('is-interacting'))normalizeVerticalGaps(board);
    const width=canvas.clientWidth, unit=(width+GAP)/12;
    let height=0;
    const sorted=[...board.cards].sort((a,b)=>a.y-b.y||a.x-b.x);
    for (const card of mobile()?sorted:board.cards) {
      const node=canvas.querySelector(`[data-card="${CSS.escape(card.id)}"]`);if(!node)continue;
      const h=card.contentHeight||card.h*ROW;
      Object.assign(node.style,{left:mobile()?'0px':`${card.x*unit}px`,top:`${mobile()?height:card.y*ROW}px`,width:mobile()?'100%':`${card.w*unit-GAP}px`,height:`${h}px`});
      height=mobile()?height+h+24:Math.max(height,card.y*ROW+h+24);
    }
    canvas.style.height=board.cards.length?`${height}px`:'';
  }
  function cardNode(card) {
    const el=document.createElement('article');el.className='widgetCard';el.dataset.card=card.id;el.dataset.signature=JSON.stringify([card.status,card.url,card.error,card.loadingText,card.refreshedAt]);
    el.innerHTML=`<header class="widgetCardHeader" tabindex="0" aria-label="点击选中卡片，拖动或方向键移动" title="拖动移动，右上角配置图表"><span class="widgetGrip" aria-hidden="true">⠿</span><span class="widgetCardTitle">${esc(card.title)}</span><div class="widgetCardActions"><button type="button" data-config title="配置" aria-label="配置图表">${configIcon}</button><button type="button" data-remove title="删除" aria-label="删除图表">${trashIcon}</button></div></header>`;
    if (card.url && card.status==='ready') {
      const frame=document.createElement('iframe');frame.title=card.title;frame.src=frameUrl(card);frame.loading='lazy';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
      frame.addEventListener('load',()=>{try{hydrateTradingView(card,JSON.parse(frame.contentDocument?.querySelector('#tv-config')?.textContent||'{}'),el);}catch{}window.installTradingViewSurface?.(frame,(height,intrinsic)=>{
        if(!intrinsic||card.manualHeight)return;
        height+=(el.querySelector('.widgetCardHeader')?.getBoundingClientRect().height||40);
        const board=boards.find(b=>b.cards.includes(card));if(!board||!el.isConnected)return;
        if(Math.abs((card.contentHeight||0)-height)<=1)return;
        const previousHeight=card.contentHeight||card.h*ROW;
        card.contentHeight=height;card.h=Math.ceil(height/ROW);pullFollowing(board,card,previousHeight);settle(board,card);save();
        if(board.id===activeId)applyLayout();
      });try{const spec=JSON.parse(frame.contentDocument?.querySelector('#tv-config')?.textContent||'{}');hydrateTradingView(card,spec,el);window.installChartActivation?.(frame,spec.widget);if(spec.widget==='ticker-tape'){card.component='tv-ticker-tape';const board=boards.find(b=>b.cards.includes(card));if(board&&compactTicker(board,card)){save();if(board.id===activeId)applyLayout();}}}catch{}if(card.customTitle)return;try {const doc=frame.contentDocument;let title=(doc?.querySelector('h1,h2,.chart-title,.module-title')?.textContent||doc?.title||'').trim();if(doc?.querySelector('#tv-config'))title=title.replace(/\s*[·|\-]\s*TradingView\s*$/i,'');if(title&&title.length<160&&title!==card.title){card.title=title;el.querySelector('.widgetCardTitle').textContent=title;frame.title=title;save();}}catch { /* Cross-origin subframes keep their supplied title. */ }});el.append(frame);if(['tv-advanced-chart','tv-crypto-heatmap'].includes(card.component))window.installChartActivation?.(frame,card.component.slice(3));
    } else {
      const body=document.createElement('div');body.className='widgetCardBody';
      body.innerHTML=card.status==='loading'?`<div class="widgetLoading" aria-hidden="true"></div><p>${esc(card.loadingText||'正在获取数据、生成图表…')}</p>`:`<p>${esc(card.error||'图表暂不可用，请重新生成。')}</p><button type="button" data-retry>重新生成</button>`;el.append(body);
    }
    const resize=document.createElement('div');resize.className='widgetResize';resize.title='拖动调整宽高';resize.setAttribute('role','slider');resize.tabIndex=0;resize.setAttribute('aria-label','调整图表尺寸，方向键调整');resize.setAttribute('aria-valuemin','3');resize.setAttribute('aria-valuemax','12');resize.setAttribute('aria-valuenow',card.w);el.append(resize);
    return el;
  }
  function renderChat(){
    const board=current(),log=$('widgetChatLog');if(!board)return;
    const messages=Array.isArray(board.chat)?board.chat:[];
    const pending=commandControllers.has(board.id);
    const signature=JSON.stringify([board.id,messages,pending]);if(log.dataset.signature===signature)return;log.dataset.signature=signature;
    const entries=messages.length?messages:[{role:'assistant',content:'想在这张看板里关注什么？告诉我想看的标的和图表，也可以选中卡片后直接调整。'}];
    log.innerHTML=entries.map(m=>{
      const user=m.role==='user',content=user?esc(m.content):typeof formatInsight==='function'?formatInsight(m.content):esc(m.content);
      const scope=m.scope?`<span class="widgetMessageScope">${esc(m.scope)}</span>`:'';
      return `<article class="message widgetChatMessage ${user?'user is-user':'assistant is-assistant'}">${user?`<div class="userMessageWrap"><div class="bubble userBubble">${scope}${content}</div></div>`:`<div class="bubble assistantBubble"><div class="streamingAnswer">${scope}${content}</div></div>`}</article>`;
    }).join('')+(pending?'<article class="message assistant widgetChatMessage is-pending"><div class="bubble assistantBubble"><span class="thinkingSummaryText" role="status">正在处理…</span></div></article>':'');log.scrollTop=log.scrollHeight;
  }
  function render() {
    const board=current();
    renderRefresh();
    $('widgetTabs').innerHTML=openIds.map(id=>boards.find(b=>b.id===id)).filter(Boolean).map(b=>`<div class="widgetTab ${b.id===activeId?'is-active':''}" draggable="true" data-tab-id="${esc(b.id)}"><button role="tab" id="widget-tab-${esc(b.id)}" aria-selected="${b.id===activeId}" tabindex="${b.id===activeId?0:-1}" data-board="${esc(b.id)}" aria-controls="widgetCanvas" title="${esc(b.title)} · 选中后点击重命名，拖动排序">${esc(b.title)}</button><button class="widgetTabClose" data-close-tab="${esc(b.id)}" aria-label="关闭页签：${esc(b.title)}" title="关闭页签">×</button></div>`).join('');
    $('widgetPrompt').disabled=!board;
    if(!board){canvas.replaceChildren();$('widgetBoardTitle').textContent='';$('widgetEmpty').hidden=false;updateSelection();return;}
    $('widgetBoardTitle').textContent=board.title;
    canvas.setAttribute('role','tabpanel');canvas.setAttribute('aria-labelledby',`widget-tab-${board.id}`);
    const oldNodes=new Map([...canvas.children].map(el=>[el.dataset.card,el]));
    const ids=new Set(board.cards.map(c=>c.id));for(const [id,node] of oldNodes)if(!ids.has(id))node.remove();
    for(const card of board.cards){const old=oldNodes.get(card.id);if(old?.dataset.signature===JSON.stringify([card.status,card.url,card.error,card.loadingText,card.refreshedAt])){old.querySelector('.widgetCardTitle').textContent=card.title;}else if(old){old.replaceWith(cardNode(card));}else{canvas.append(cardNode(card));}}$('widgetEmpty').hidden=!!board.cards.length;
    $('widgetGenerate').hidden=jobs.has(activeId)||commandControllers.has(activeId);$('widgetStop').hidden=!jobs.has(activeId)&&!commandControllers.has(activeId);
    updateSelection();
    applyLayout();notice(progressByBoard.get(activeId)||'');
  }
  function route(push=true) {
    const url=new URL(location.href);['task','run','dayResult','dayShare'].forEach(k=>url.searchParams.delete(k));url.searchParams.set('tab','widgets');url.searchParams.set('board',activeId);history[push?'pushState':'replaceState'](null,'',url);
  }
  function enter(push=true) {
    if(typeof closeActivityDrawer==='function')closeActivityDrawer();
    internal=true;
    try {window.dispatchEvent(new CustomEvent('veya:chat-navigate'));} finally {internal=false;}
    shell.classList.remove('tasks-view');$('taskWorkspace').hidden=true;$('taskSidebar').hidden=true;
    shell.classList.add('widgets-view');workspace.hidden=false;$('widgetSidebar').hidden=true;
    for(const id of ['navHome','navTasks','railHome','railTasks']){$(id)?.classList.remove('is-selected','is-active');$(id)?.removeAttribute('aria-current');}
    for(const id of ['navWidgets','railWidgets']){$(id)?.classList.add(id==='navWidgets'?'is-selected':'is-active');$(id)?.setAttribute('aria-current','page');}
    if(typeof setSidebarCollapsed==='function')setSidebarCollapsed(true);
    route(push);render();void ensureDefaultBoards();
  }
  function leave() {workspace.hidden=true;$('widgetSidebar').hidden=true;shell.classList.remove('widgets-view');for(const id of ['navWidgets','railWidgets']){$(id)?.classList.remove('is-selected','is-active');$(id)?.removeAttribute('aria-current');}}
  async function ensureCatalog(){if(!catalog.length){const response=await fetch('/static/widget-catalog.json');if(!response.ok)throw Error('金融图表库暂不可用。');catalog=await response.json();}}
  // Keep canvas acceptance controls interactive while browsing components.
  async function library(){ $('widgetLibraryStatus').textContent='';$('widgetLibrary').show();try{await ensureCatalog();renderLibrary();}catch(error){$('widgetLibraryStatus').textContent=error.message;} }
  const symbolPicker=window.WidgetSymbolPicker?new window.WidgetSymbolPicker($('widgetAddForm'),$('widgetSymbol'),$('widgetParameterField')):null;
  function renderLibrary(){
    const visible=catalog.filter(c=>c.libraryVisible!==false&&!c.requiresDataSource);
    $('widgetCategories').innerHTML=['全部',...new Set(visible.map(c=>c.category))].map(c=>`<button type="button" data-category="${esc(c)}" aria-pressed="${category===c}">${esc(c)}</button>`).join('');
    const items=visible.filter(c=>category==='全部'||c.category===category);
    $('widgetLibraryList').innerHTML=items.map(c=>`<article class="widgetLibraryCard"><div><strong>${esc(c.title)}</strong><small>${esc(c.sourceLabel||(c.provider==='TradingView'?'TradingView':''))} · ${esc(c.description)}</small></div><button type="button" data-add-preset="${esc(c.id)}" aria-label="添加${esc(c.title)}" title="添加到当前面板">＋</button></article>`).join('');
  }
  function renderConfig(){
    const selected=catalog.find(c=>c.id===componentId),market=selected?.inputMode==='market',group=selected?.inputMode==='group';
    const input=$('widgetSymbol'),mode=selected?.inputMode||'symbol';
    if(input.dataset.mode&&input.dataset.mode!==mode){libraryInputs[input.dataset.mode]=input.value;input.value=libraryInputs[mode]||'';}input.dataset.mode=mode;
    $('widgetSymbolLabel').textContent=mode==='currencies'?'货币':mode==='broker'?'经纪商':market?(selected?.widget==='economic-calendar'?'地区':'市场'):group?'关注标的（可多个）':'关注标的';
    const directMarket=market&&selected?.provider==='TradingView';
    $('widgetSymbol').hidden=directMarket;$('widgetMarket').hidden=!directMarket;
    $('widgetParameterField').hidden=false;$('widgetAddForm').classList.remove('no-parameters');
    if(directMarket){const options=selected.scopeOptions||[['default',selected.defaultScope||'默认市场']];$('widgetMarket').innerHTML=options.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');const noParameters=options.length===1;$('widgetParameterField').hidden=noParameters;$('widgetAddForm').classList.toggle('no-parameters',noParameters);}
    $('widgetSymbol').required=!market&&mode!=='currencies'&&!selected?.allowEmptySymbols;
    $('widgetSymbol').placeholder=market?`留空使用：${selected.defaultScope}`:selected?.provider==='TradingView'?(group?'例如 NASDAQ:AAPL、NASDAQ:MSFT、NASDAQ:NVDA':'例如 NASDAQ:AAPL、HKEX:700'):'例如 AAPL、NVDA 或 MSFT';
    symbolPicker?.configure(['symbol','group'].includes(mode),group,selected?.provider==='TradingView'?['auto','us','hk','cn']:selected?.provider==='ashare'?['cn']:['us']);
    if(selected?.provider==='ashare')$('widgetSymbol').placeholder='例如 600519.SH、000001.SZ';
    if(mode==='data'){$('widgetParameterField').hidden=true;$('widgetSymbol').required=false;symbolPicker?.configure(false,false,[]);}
    if(mode==='currencies')$('widgetSymbol').placeholder='例如 USD、EUR、JPY；留空使用主要货币';
    if(mode==='broker'&&!input.value.trim())input.value=selected?.defaultSymbols?.[0]||'easymarkets';
    if(selected?.allowEmptySymbols)$('widgetSymbol').placeholder=mode==='broker'?'默认使用 easyMarkets，可直接添加':'留空查看全球市场，或输入自选标的名称 / 代码';
  }
  async function configureCard(card){
    if(card.status==='loading'){notice('请等待图表完成加载。');return;}
    try{await ensureCatalog();}catch(error){notice(error.message);return;}
    const component=catalog.find(c=>c.id===card.component);if(!component){notice('该图表暂不支持直接配置，可以选中后在底部输入调整。');return;}
    editingCardId=card.id;componentId=component.id;selectedCardId=card.id;updateSelection();
    renderConfig();if(symbolPicker?.enabled&&component.provider==='TradingView'){symbolPicker.select.value='auto';symbolPicker.placeholder();}$('widgetCardName').value=card.title;$('widgetSymbol').value=card.symbolInput||(card.parameters?.symbols||[]).join('、');
    if(component.inputMode==='market')$('widgetMarket').value=card.parameters?.market||'default';
    const intervals=component.widget==='advanced-chart'?[['1','1 分钟'],['5','5 分钟'],['15','15 分钟'],['30','30 分钟'],['60','1 小时'],['120','2 小时'],['240','4 小时'],['D','日线'],['W','周线'],['M','月线']]:component.widget==='technical-analysis'?[['1D','日线'],['1W','周线'],['1M','月线'],['1h','1 小时']]:[];
    $('widgetIntervalField').hidden=!intervals.length;$('widgetInterval').innerHTML=intervals.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
    if(card.parameters?.interval)$('widgetInterval').value=card.parameters.interval;
    $('widgetConfigError').textContent='';$('widgetConfig').showModal();
  }
  function ensureBoard(){if(current())return current();if(boards.length>=40)throw Error('最多保存 40 个 Widget。');const board={id:uid(),title:'我的 Widget',cards:[],messages:[]};boards.push(board);openIds.push(board.id);activeId=board.id;save();route();render();return board;}
  async function addPreset(component,button){
    let board;try{board=ensureBoard();}catch(error){$('widgetLibraryStatus').textContent=error.message;return;}
    if(board.cards.length>=60){$('widgetLibraryStatus').textContent='当前面板最多放置 60 张图表。';return;}
    if(jobs.has(board.id)||commandControllers.has(board.id)){$('widgetLibraryStatus').textContent='请等待当前看板操作完成。';return;}
    if(button)button.disabled=true;$('widgetLibraryStatus').textContent='';
    try{
      if(component.provider!=='TradingView'){
        undoByBoard.set(board.id,JSON.parse(JSON.stringify(board)));
        const symbols=component.defaultSymbols||[],request=symbols.length?`为 ${symbols.join('、')} 生成${component.title}；使用最新可用真实数据。`:`生成${component.title}，使用数据源当前覆盖期。`;
        const card=await generate(request,component,null,'default',board,{symbols});
        $('widgetLibraryStatus').textContent=card?.status==='ready'?'已加入 '+component.title:card?.error||'组件未生成，请重试。';return;
      }
      const response=await fetch('/api/widgets/presets/'+encodeURIComponent(component.id),{method:'POST'}),result=await response.json();
      if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'添加失败，请重试。');
      const url=safeUrl(result.url);if(!url)throw Error('图表地址不可用。');if(!boards.includes(board))return;
      undoByBoard.set(board.id,JSON.parse(JSON.stringify(board)));
      const card={id:uid(),title:result.title||component.title,url,status:'ready',component:component.id,parameters:result.parameters||{},market:result.parameters?.market||'default',request:(result.parameters?.symbols||[]).join(','),w:component.width||6,h:component.height||18,createdAt:new Date().toISOString()};
      place(board,card);board.cards.push(card);save();if(activeId===board.id)render();
      $('widgetLibraryStatus').textContent='已加入 '+component.title;
    }catch(error){$('widgetLibraryStatus').textContent=error.message;}finally{if(button)button.disabled=false;}
  }
  async function addTradingView(message, component, retryId, market='default',options={},board=current()) {if(!board)return;
    if(board.cards.length>=60&&!retryId){notice('当前看板最多放置 60 张图表，请新建看板继续。');return;}
    const widget=component.widget||component.id.slice(3),isMarket=['screener','crypto-mkt-screener','stock-heatmap','crypto-heatmap','market-overview','economic-calendar','top-stories','stock-market','etf-heatmap','market-summary','world-market-summary','economic-map'].includes(widget);
    const symbolMarket=options.signal?'auto':retryId?(board.cards.find(c=>c.id===retryId)?.symbolMarket||'auto'):(symbolPicker?.enabled?symbolPicker.select.value:'auto');
    const symbols=isMarket?[]:options.symbols||message.split(/[,，、;；\s]+/).map(s=>s.trim()).filter(Boolean);
    if(component.inputMode==='broker'&&(!symbols.length||(retryId&&symbols.some(s=>!/^[a-z0-9][a-z0-9-]{1,49}$/i.test(s))))){symbols.splice(0,symbols.length,...(component.defaultSymbols||['easymarkets']));}
    let card=retryId&&board.cards.find(c=>c.id===retryId);
    const previous=card?JSON.parse(JSON.stringify(card)):null;
    if(card){delete card.symbolInput;Object.assign(card,{status:'loading',error:'',url:'',loadingText:'正在加载 TradingView…',market,symbolMarket});}
    else {card={id:uid(),title:component.title,w:component.width||6,h:component.height||18,status:'loading',loadingText:'正在加载 TradingView…',url:'',request:message,component:component.id,market,symbolMarket};place(board,card);board.cards.push(card);}
    delete card.contentHeight;
    const chartParameters=Object.fromEntries(advancedChartParameters.filter(key=>options[key]!==undefined&&options[key]!==null).map(key=>[key,options[key]]));
    card.request=message;card.component=component.id;card.parameters={symbols,market,...chartParameters};
    save();if(activeId===board.id)render();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000),onAbort=()=>controller.abort();options.signal?.addEventListener('abort',onAbort,{once:true});
    try {
      const response=await fetch('/api/widgets/tradingview',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({widget,preset:component.preset||null,symbols,market,...chartParameters,theme:document.documentElement.dataset.theme==='light'?'light':'dark',language:'zh-CN',symbolMarket})});
      const result=await response.json();if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'组件添加失败，请重试。');
      const url=safeUrl(result.url);if(!url)throw Error('组件没有返回可用的地址。');
      if(!boards.includes(board)||!board.cards.includes(card))return;
      Object.assign(card,{url,title:card.customTitle?card.title:(result.title||component.title),status:'ready',createdAt:card.createdAt||new Date().toISOString(),refreshedAt:new Date().toISOString()});delete card.refreshError;
    } catch(error){if(boards.includes(board)&&board.cards.includes(card)){const detail=error.name==='AbortError'?'组件加载已停止或超时，请重试。':error.message;if(options.preserveOnError&&previous?.url)Object.assign(card,previous,{refreshError:detail});else {card.status='error';card.error=detail;}}}
    finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',onAbort);save();if(activeId===board.id)render();}
    return card;
  }
  async function generate(message, component=null, retryId=null, market='default',targetBoard=null,parameters={}) {
    if(component?.provider==='TradingView'||component?.id?.startsWith('tv-'))return addTradingView(message,component,retryId,market,parameters,targetBoard||current());

    const reasoningEffort=parameters.reasoningEffort||(typeof currentReasoningEffort==='string'?currentReasoningEffort:'low');
    const board=targetBoard||current();if(!board||(jobs.has(board.id)&&!targetBoard)){notice('当前看板正在生成，请稍候或切换看板。');return;}
    if(board.cards.length>=60&&!retryId){notice('当前看板最多放置 60 张图表，请新建看板继续。');return;}
    const controller=new AbortController(),onAbort=()=>controller.abort();parameters.signal?.addEventListener('abort',onAbort,{once:true});if(parameters.signal?.aborted)controller.abort();jobs.set(board.id,controller);
    let pending=retryId&&board.cards.find(c=>c.id===retryId);
    const previous=pending?JSON.parse(JSON.stringify(pending)):null;
    if(pending)Object.assign(pending,{status:'loading',error:'',url:'',request:message,component:component?.id||pending.component});
    else {pending={id:uid(),title:component?`${component.title} · ${message}`:'正在构建看板',w:component?.width||6,h:component?.height||18,status:'loading',url:'',request:message,component:component?.id||''};place(board,pending);board.cards.push(pending);}
    pending.parameters={...(pending.parameters||{}),...Object.fromEntries(Object.entries(parameters).filter(([key])=>['symbols','market','interval','studies'].includes(key)))};
    pending.market=market;
    const pendingId=pending.id;
    board.messages.push({role:'user',content:message});board.messages=board.messages.slice(-12);
    if(board.title==='我的看板'&&!component){const named=message.match(/(?:做|建|生成|创建)(?:一[个张])?(.{2,16}?看板)/),symbol=message.match(/\b[A-Z][A-Z0-9.-]{0,9}\b/);if(named)board.title=named[1];else if(symbol)board.title=symbol[0]+' 看板';}
    save();if(activeId===board.id)render();
    let final=null, failure='';
    const skill=component?.skill||(component?.provider==='business'?'business-chart-recall':''),script=component?.script||(component?.provider==='business'?component.id+'.py':'');
    const request=component?`只生成一个独立的「${component.title}」组件，选择 ${skill} 技能中的 ${script} 原生渲染器。用户完整需求：${message}`:`根据用户需求选择并生成一个独立组件：${message}`;
    const sourceContract=component?.requiresDataSource?'这是没有内置数据源的纯渲染组件：先根据需求选择数据/搜索技能或用户提供的数据，核实来源、时间范围和单位，必要时计算并把结构化数据传给指定渲染器。数据源只作上游步骤，不作为卡片交付；数据不足就说明缺口，不生成占位、示例或猜测数据。':'使用所选组件的内置真实数据源；不得用缓存示例冒充最新数据。';
    const question=`${request}\n这是 Widget 画布的组件交付请求。${sourceContract} 配置：${JSON.stringify(pending.parameters)}。请遵守项目技能路由，调用现有业务组件的原生脚本取真实数据；先完整阅读所选技能及组件 schema，按真实 CLI 契约执行，保留组件原生交互、主题、语言和数据来源。国内股票日线使用 a-share-data/historical_kline.py（单只A股、1d），不混用快照作历史OHLCV，不把指数或ETF冒充股票；AInvest公司财报、估值与评级只用于支持的美股公司，行情组件按资产契约选择。最终只交付所选的一个组件 HTML 到 outputs/generated，仅用一个 AIME_CHART 标记引用该最终组件。不要返回研究报告、数据源卡片、CSV/JSON、上游中间图、截图或整张看板外壳，不合并其他组件；不要生成无数据依据的内容。标题具体且基于已取得的数据。刷新时重新获取可更新的数据并保持原始范围与口径；若数据是用户提供的静态数据，使用原数据重渲染，不声称更新了来源。数据不可用时明确报错，不以其他标的或旧示例替代。`;
    try {
      const response=await fetch('/api/chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({question,agent:'mentora',reasoningEffort,sessionId:`widget-${board.id}-${pendingId}-${uid()}`,history:[],images:[],reasoningFramework:typeof DEFAULT_REASONING_FRAMEWORK==='string'?DEFAULT_REASONING_FRAMEWORK:'deepseek',inferenceModel:typeof DEFAULT_INFERENCE_MODEL==='string'?DEFAULT_INFERENCE_MODEL:'',themeMode:document.documentElement.dataset.theme==='light'?'light':'dark'})});
      if(!response.ok)throw Error(`生成请求失败（${response.status}）`);
      await readEventStream(response.body,(event,data)=>{
        if(event==='final')final=data;
        if(event==='error')failure=data.detail||'图表生成失败，请重试。';
        if(event==='status'||event==='progress'||event==='tool_step') {
          const status=streamedWidgetText(event,data);if(!status)return;
          setProgress(board,status);
          if(activeId===board.id){const p=canvas.querySelector(`[data-card="${CSS.escape(pendingId)}"] .widgetCardBody p`);if(p)p.textContent=status;}
        }
      });
      if(controller.signal.aborted)throw new DOMException('stopped','AbortError');
      const artifacts=final?(Array.isArray(final.reportArtifacts)&&final.reportArtifacts.length?final.reportArtifacts:[{url:final.reportUrl||final.htmlUrl,title:component?.title}]):[];
      const seen=new Set();const valid=artifacts.filter(a=>a&&safeUrl(a.url)&&!seen.has(safeUrl(a.url))&&seen.add(safeUrl(a.url)));
      if(!valid.length)throw Error(failure||String(final?.interpretation||'没有返回可用图表，请补充具体标的后重试。').replace(/\[\[.*?\]\]/g,'').slice(0,500));
      // Do not resurrect a card or board removed while its request was running.
      if(!boards.includes(board)||!board.cards.some(c=>c.id===pendingId))return;
      // The transport may retain intermediate tool artifacts. Only the final
      // response's selected component belongs on this canvas, never a source chart.
      const references=[...String(final.interpretation||'').matchAll(/\[\[AIME_CHART:([^\]\n]+)\]\]/g)].map(match=>match[1].trim().split('/').at(-1).split('?')[0]);
      const artifact=references.reverse().map(name=>valid.find(item=>[item.path,item.url].some(value=>String(value||'').split('/').at(-1).split('?')[0]===name))).find(Boolean)||valid.at(-1),now=new Date().toISOString();
      Object.assign(pending,{title:pending.customTitle?pending.title:String(artifact.title||artifact.label||component?.title||'可视化组件').slice(0,160),url:safeUrl(artifact.url),status:'ready',createdAt:pending.createdAt||now,refreshedAt:now});
      delete pending.error;delete pending.refreshError;delete pending.contentHeight;
      settle(board,pending);
      board.messages.push({role:'assistant',content:'已生成组件。'});
    } catch(error) {
      if(boards.includes(board)&&board.cards.includes(pending)){const detail=error.name==='AbortError'?'生成已停止，可以重新生成。':error.message;if(parameters.preserveOnError&&previous?.url)Object.assign(pending,previous,{refreshError:detail});else{pending.status='error';pending.error=detail;}}
    } finally {
      parameters.signal?.removeEventListener('abort',onAbort);if(jobs.get(board.id)===controller)jobs.delete(board.id);if(!commandControllers.has(board.id))progressByBoard.delete(board.id);save();if(activeId===board.id){render();if(pending.status==='error')notice(pending.error);}
    }
    return pending;
  }
  document.querySelectorAll('#widgetAdjustments').forEach(node => node.remove());
  const recommendationController=window.WidgetRecommendations?new window.WidgetRecommendations({workspace,prompt:$('widgetPrompt'),welcome:workspace.querySelector('.widgetSuggestions'),busy:()=>jobs.has(activeId)||commandControllers.has(activeId)}):null;
  function renderPromptHint(card){
    workspace.classList.toggle('has-widget-selection',!!card);
    const board=current();if(!board)return;
    let visibleContent='';
    if(card)try{visibleContent=canvas.querySelector(`[data-card="${CSS.escape(card.id)}"] iframe`)?.contentDocument?.body?.innerText?.slice(0,2500)||'';}catch{}
    recommendationController?.update({previousCard:card?(undoByBoard.get(activeId)?.cards.find(c=>c.id===card.id)||null):null,board:{id:board.id,title:board.title,cards:board.cards.map(c=>({id:c.id,title:c.title,component:c.component||'',url:c.url||'',request:c.request||'',x:c.x,y:c.y,w:c.w,h:c.h,parameters:c.parameters||{}}))},selectedCardId:card?.id||'',history:(board.chat||[]).slice(-6).map(({role,content})=>({role,content})),visibleContent});
  }
  function packCards(board, ordered) {
    let x = 0, y = 0, rowHeight = 0;
    for (const card of ordered) {
      if (x + card.w > 12) { y += rowHeight + 1; x = 0; rowHeight = 0; }
      card.x = x; card.y = y; x += card.w;
      rowHeight = Math.max(rowHeight, card.contentHeight ? Math.ceil(card.contentHeight / ROW) : card.h);
    }
    board.cards = ordered;
  }
  function applyLayoutRequest(message) {
    const board = current();
    if (!board?.cards.length) return false;
    const text = message.trim().replace(/[。！!？?，,\s]/g, '');
    const beautify = /^(?:帮我|请)?(?:美化|优化|整理)(?:一下)?(?:这个|我的|整个)?(?:页面|看板)?(?:布局)?(?:一下)?$/.test(text) || text === '重点图放大些';
    const compact = ['排得紧凑些','排得紧凑一些','紧凑一点','布局紧凑一点'].includes(text);
    const columns = /^(?:换成|改成|排成)(?:两列|双列|单列|一列)(?:排版|布局)?$/.test(text);
    const actions = {'卡片放宽些':'wide','卡片矮一点':'shorter','卡片高一点':'taller','往前放一位':'previous','往后放一位':'next','卡片占满一行':'full'};
    const action = actions[text], card = board.cards.find(c => c.id === selectedCardId);
    if (!beautify && !compact && !columns && !(action && card)) return false;
    if (jobs.has(activeId) || commandControllers.has(activeId)) return true;
    undoByBoard.set(board.id, JSON.parse(JSON.stringify(board)));
    const ordered = [...board.cards].sort((a,b) => a.y-b.y || a.x-b.x);
    if (beautify) {
      const hero = ordered.find(c => ['tv-advanced-chart','tv-intraday'].includes(c.component));
      if (hero) { ordered.splice(ordered.indexOf(hero),1); ordered.unshift(hero); }
      ordered.forEach(c => { c.w = c===hero || ['tv-ticker-tape','tv-symbol-info','tv-market-data'].includes(c.component) ? 12 : 6; });
    } else if (columns) ordered.forEach(c => { c.w = /两列|双列/.test(text) ? 6 : 12; });
    else if (action === 'previous' || action === 'next') {
      const i = ordered.indexOf(card), j = Math.max(0, Math.min(ordered.length-1, i+(action==='previous'?-1:1)));
      [ordered[i],ordered[j]] = [ordered[j],ordered[i]];
    } else if (action === 'wide' || action === 'full') card.w = action === 'full' ? 12 : Math.min(12,card.w+3);
    else if (action) {
      const height = card.contentHeight || card.h*ROW;
      card.manualHeight = true; delete card.contentHeight;
      card.h = clamp(Math.round(height/ROW)+(action==='taller'?3:-3),minRows(card),40);
    }
    packCards(board,ordered);
    const feedback=modificationFeedback(undoByBoard.get(board.id),board)||'当前布局已符合要求，无需重复调整。';
    selectedCardId='';save();render();
    notice(feedback);
    return true;
  }
  function modificationFeedback(before, board) {
    const changes=[],moved=[],oldCards=before.cards||[],oldById=new Map(oldCards.map(c=>[c.id,c]));
    const width=w=>w===12?'整行宽度':w===6?'半行宽度':`约占一行的 ${Math.round(w/12*100)}%`;
    const period=value=>({'1':'1分钟','5':'5分钟','15':'15分钟','30':'30分钟','60':'1小时','120':'2小时','240':'4小时','D':'日线','1D':'日线','W':'周线','1W':'周线','M':'月线','1M':'月线','1h':'1小时'}[value]||value);
    const chartStyle=value=>({'0':'美国线','1':'K线','2':'折线','3':'面积图','4':'砖型图','5':'卡吉图','6':'点数图','7':'新价线','8':'平均K线','9':'空心K线','10':'基准线'}[value]||value);
    for(const card of board.cards){
      const old=oldById.get(card.id),label=`「${card.title}」`;
      if(!old){changes.push(`新增${label}`);continue;}
      const details=[];
      if(old.title!==card.title)details.push(`标题由「${old.title}」改为${label}`);
      if(old.w!==card.w)details.push(`宽度改为${width(card.w)}`);
      const oldHeight=old.contentHeight||old.h*ROW,newHeight=card.contentHeight||card.h*ROW;
      if(oldHeight!==newHeight)details.push(`高度${newHeight<oldHeight?'缩小':'增大'}约 ${Math.abs(Math.round(newHeight-oldHeight))} 像素`);
      const prev=old.parameters||{},next=card.parameters||{};
      if(JSON.stringify(prev.symbols||[])!==JSON.stringify(next.symbols||[]))details.push(`标的改为 ${(next.symbols||[]).join('、')}`);
      if(prev.interval!==next.interval&&next.interval)details.push(`周期切换为${period(next.interval)}`);
      if(prev.market!==next.market&&next.market)details.push(`切换市场为${next.market}`);
      if(prev.style!==next.style&&next.style!==undefined)details.push(`图表样式改为${chartStyle(next.style)}`);
      if(JSON.stringify(prev.studies||[])!==JSON.stringify(next.studies||[]))details.push(`技术指标更新为 ${(next.studies||[]).map(value=>value.split('@')[0]).join('、')||'无'}`);
      if(JSON.stringify(prev.compareSymbols||[])!==JSON.stringify(next.compareSymbols||[]))details.push(`对比标的更新为 ${(next.compareSymbols||[]).join('、')||'无'}`);
      if(JSON.stringify(prev.watchlist||[])!==JSON.stringify(next.watchlist||[]))details.push(`观察列表更新为 ${(next.watchlist||[]).join('、')||'空'}`);
      if(old.component!==card.component)details.push('替换了图表类型');
      if(oldCards.findIndex(c=>c.id===card.id)!==board.cards.findIndex(c=>c.id===card.id))details.push(`移至第 ${board.cards.indexOf(card)+1} 位`);
      if(!details.length&&(old.x!==card.x||old.y!==card.y))moved.push(label);
      if(details.length)changes.push(`${label}：${details.join('，')}`);
    }
    for(const old of oldCards)if(!board.cards.some(c=>c.id===old.id))changes.push(`移除「${old.title}」`);
    if(before.title!==board.title)changes.unshift(`看板命名为「${board.title}」`);
    if(!changes.length&&moved.length)changes.push(`重新对齐 ${moved.length} 张卡片的位置并收紧间距`);
    return changes.length?`已完成调整：${changes.slice(0,4).join('；')}${changes.length>4?`；另有 ${changes.length-4} 项调整`:''}。`:'';
  }
  function updateSelection(){
    const board=current(),card=board?.cards.find(c=>c.id===selectedCardId);if(!card)selectedCardId='';
    $('widgetScope').textContent=card?`${card.title} ×`:'';
    $('widgetScope').hidden=!card;
    $('widgetScope').parentElement.hidden=!card&&!undoByBoard.has(activeId);
    const pending=commandControllers.has(activeId)||jobs.has(activeId);
    renderPromptHint(card);
    $('widgetUndo').hidden=!undoByBoard.has(activeId);$('widgetUndo').disabled=pending;
    $('widgetConfirm').hidden=!undoByBoard.has(activeId);$('widgetConfirm').disabled=pending;
    for(const node of canvas.children)node.classList.toggle('is-selected',node.dataset.card===selectedCardId);
  }
  async function runCommand(message){
    const board=current();if(!board||jobs.has(board.id)||commandControllers.has(board.id))return;
    if(board.cards.some(c=>c.status==='loading')){notice('请等待组件加载完成后再调整。');return;}
    const controller=new AbortController();commandControllers.set(board.id,controller);jobs.set(board.id,controller);
    const snapshot=JSON.parse(JSON.stringify(board)),selection=selectedCardId;
    const reasoningEffort=typeof currentReasoningEffort==='string'?currentReasoningEffort:'low';
    const history=(board.chat||[]).slice(-12).map(({role,content})=>({role,content}));
    board.chat=[...(board.chat||[]),{role:'user',content:message,scope:selection?board.cards.find(c=>c.id===selection)?.title:'整个看板'}].slice(-40);save();
    render();setProgress(board,'正在理解你的看板需求，梳理分析结构…');
    let reply='';
    try{
      const response=await fetch('/api/widgets/plan',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({message,history,reasoningEffort,selectedCardId:selection,board:{id:board.id,title:board.title,cards:board.cards.map(c=>({id:c.id,title:c.title,component:c.component||'',url:c.url||'',request:c.request||'',x:c.x,y:c.y,w:c.w,h:c.h,parameters:c.parameters||{}}))}})});
      const plan=await response.json();if(!response.ok)throw Error(typeof plan.detail==='string'?plan.detail:Array.isArray(plan.detail)?'看板数据校验失败，请刷新页面后重试。':'调整服务暂时不可用，请稍后重试。');
      if(Array.isArray(plan.components))for(const meta of plan.components){generationCatalog=generationCatalog.filter(c=>c.id!==meta.id);generationCatalog.push(meta);}
      if(!boards.includes(board))return;
      if(plan.actions?.length)undoByBoard.set(board.id,snapshot);
      if(!catalog.length){const result=await fetch('/static/widget-catalog.json');if(!result.ok)throw Error('图表库无法加载，请重试。');catalog=await result.json();}
      const actions=plan.actions||[];let actionIndex=0;
      for(const action of actions){
        actionIndex++;
        const label=action.title||componentFor(action.componentId)?.title||({'rename_board':'看板标题','remove':'移除组件','update':'调整组件'}[action.type])||'布局';
        setProgress(board,`正在执行 ${actionIndex}/${actions.length}：${label}`);
        if(controller.signal.aborted)throw new DOMException('stopped','AbortError');
        const card=board.cards.find(c=>c.id===action.cardId);
        if(action.type==='rename_board'){board.title=action.title;continue;}
        if(action.type==='remove'){board.cards=board.cards.filter(c=>c.id!==action.cardId);continue;}
        let target=card;
        if(action.type==='add'||action.parameters||action.componentId||action.request){
          const component=componentFor(action.componentId||card?.component);if(!component)throw Error('组件能力暂不可用，请刷新页面重试。');
          const parameters=action.parameters||{},text=component.provider==='TradingView'?(parameters.symbols?.join(',')||component.defaultScope||component.title):(action.request||message);
          const before=new Set(board.cards.map(c=>c.id));
          if(card){card.component=component.id;card.request=text;}
          await generate(text,component,card?.id||null,parameters.market||'default',board,{...parameters,reasoningEffort,signal:controller.signal});
          target=card?board.cards.find(c=>c.id===card.id):board.cards.find(c=>!before.has(c.id));
          if(target?.status==='error')throw Error(target.error);
          if(!controller.signal.aborted)jobs.set(board.id,controller);
        }
        if(target){if(action.layout)Object.assign(target,action.layout);if(action.title){target.title=action.title;target.customTitle=true;}}
      }
      settle(board,null);
      reply=modificationFeedback(snapshot,board)||plan.reply||'当前看板无需调整。';
      if(actions.length&&activeId===board.id)selectedCardId='';
      save();
    }catch(error){reply=error.name==='AbortError'?'调整已停止。':error.message;}
    finally{progressByBoard.delete(board.id);commandControllers.delete(board.id);if(jobs.get(board.id)===controller)jobs.delete(board.id);if(boards.includes(board)){board.chat=[...(board.chat||[]),{role:'assistant',content:reply||'调整已停止。'}].slice(-40);}save();if(activeId===board.id){render();notice(reply);}}
  }
  async function refreshBoard(){
    const board=current();if(!board?.cards.length||jobs.has(board.id)||commandControllers.has(board.id))return;
    const controller=new AbortController(),ids=board.cards.map(c=>c.id);let refreshed=0,failures=[];
    commandControllers.set(board.id,controller);refreshingBoards.add(board.id);render();
    try{
      await ensureGenerationCatalog();
      for(const id of ids){
        if(controller.signal.aborted||!boards.includes(board))break;
        const card=board.cards.find(c=>c.id===id);if(!card)continue;
        const component=componentFor(card.component),title=card.title;
        setProgress(board,`正在刷新 ${refreshed+failures.length+1}/${ids.length}：${title}`);
        if(!component&&card.component){failures.push(title+'：组件暂不可用');continue;}
        const result=await generate(card.request||(card.parameters?.symbols||[]).join(',')||title,component||null,card.id,card.market||card.parameters?.market||'default',board,{...(card.parameters||{}),signal:controller.signal,preserveOnError:true});
        if(result?.status==='ready'&&!result.refreshError)refreshed++;else failures.push(title+'：'+(result?.refreshError||result?.error||'未完成'));
      }
      if(refreshed===ids.length&&!controller.signal.aborted&&boards.includes(board))board.lastRefreshedAt=new Date().toISOString();
    }catch(error){failures.push(error.message);}
    finally{
      commandControllers.delete(board.id);refreshingBoards.delete(board.id);progressByBoard.delete(board.id);save();
      if(activeId===board.id){render();notice(controller.signal.aborted?`刷新已停止，已完成 ${refreshed}/${ids.length} 个组件。`:failures.length?`已刷新 ${refreshed}/${ids.length} 个组件；未成功的组件保留原内容。${failures.join('；')}`:'看板已刷新。');}
    }
  }
  if($('widgetRefresh'))$('widgetRefresh').onclick=refreshBoard;
  $('widgetConfirm').onclick=()=>{if(commandControllers.has(activeId)||jobs.has(activeId))return;undoByBoard.delete(activeId);selectedCardId='';updateSelection();notice('');save();};
  $('widgetScope').onclick=()=>{selectedCardId='';updateSelection();};
  $('widgetUndo').onclick=()=>{if(commandControllers.has(activeId))return;const previous=undoByBoard.get(activeId),board=current();if(!previous||!board)return;const chat=board.chat;Object.assign(board,JSON.parse(JSON.stringify(previous)));board.chat=[...(chat||[]),{role:'assistant',content:'已撤销上一次调整。'}].slice(-40);undoByBoard.delete(activeId);selectedCardId='';save();render();notice('已撤销上一次调整。');};
  function editName(action) {
    if(action==='new'&&boards.length>=40){notice('最多保存 40 个看板，请先整理已有看板。');return;}
    if(action==='new'){
      const board={id:uid(),title:'自定义',cards:[],messages:[]};
      boards.push(board);openIds.push(board.id);activeId=board.id;selectedCardId='';
      save();route();render();notice('');
      if(mobile()&&typeof setSidebarCollapsed==='function')setSidebarCollapsed(true);
      $('widgetPrompt').focus({preventScroll:true});return;
    }
    nameAction=action;$('widgetNameHeading').textContent=action==='new'?'新建 Widget':'重命名 Widget';$('widgetNameInput').value=action==='new'?'':current()?.title||'';$('widgetNameDialog').showModal();$('widgetNameInput').focus();
  }
  $('widgetNameDialog').addEventListener('close',()=>{
    if($('widgetNameDialog').returnValue!=='save')return;const title=$('widgetNameInput').value.trim();if(!title)return;
    selectedCardId='';if(nameAction==='new'){const board={id:uid(),title,cards:[],messages:[]};boards.push(board);openIds.push(board.id);activeId=board.id;}else if(current())current().title=title;
    save();route();render();if(mobile()&&typeof setSidebarCollapsed==='function')setSidebarCollapsed(true);
  });
  function activateBoard(id){if(!boards.some(b=>b.id===id))return;if(!openIds.includes(id))openIds.push(id);activeId=id;selectedCardId='';save();route();render();}
  function closeTab(id){const index=openIds.indexOf(id);openIds=openIds.filter(value=>value!==id);if(activeId===id)activeId=openIds[Math.min(index,openIds.length-1)]||'';selectedCardId='';save();route();render();}
  function deleteBoard(id){const board=boards.find(b=>b.id===id);if(!board||isSystemBoard(board))return;if(!confirm(`删除「${board.title}」及其中的图表？`))return;jobs.get(id)?.abort();commandControllers.get(id)?.abort();boards=boards.filter(b=>b.id!==id);closeTab(id);renderManager();}
  function renderManager(){$('widgetManagerList').innerHTML=boards.length?boards.map(board=>`<div class="widgetManagerRow"><button type="button" data-manage-open="${esc(board.id)}"><strong>${esc(board.title)}${isSystemBoard(board)?'（系统看板）':''}</strong><small>${board.cards.length} 张图表${openIds.includes(board.id)?' · 已打开':''}</small></button>${isSystemBoard(board)?'':`<button type="button" data-manage-delete="${esc(board.id)}" aria-label="删除 ${esc(board.title)}" title="删除">${trashIcon}</button>`}</div>`).join(''):'<p>还没有保存的 Widget</p>';}
  $('widgetNew').onclick=()=>editName('new');$('widgetRename').onclick=()=>editName('rename');$('widgetDelete').onclick=()=>deleteBoard(activeId);
  $('widgetManageOpen').onclick=()=>{renderManager();$('widgetManager').showModal();};$('widgetManagerClose').onclick=()=>$('widgetManager').close();$('widgetManagerNew').onclick=()=>{$('widgetManager').close();editName('new');};
  $('widgetManagerList').onclick=event=>{const open=event.target.closest('[data-manage-open]'),remove=event.target.closest('[data-manage-delete]');if(open){activateBoard(open.dataset.manageOpen);$('widgetManager').close();}if(remove)deleteBoard(remove.dataset.manageDelete);};
  $('widgetTabs').onclick=event=>{const close=event.target.closest('[data-close-tab]');if(close){closeTab(close.dataset.closeTab);return;}const button=event.target.closest('[data-board]');if(!button)return;if(button.dataset.board===activeId)editName('rename');else activateBoard(button.dataset.board);};
  function reorderTab(id,target){const from=openIds.indexOf(id),to=openIds.indexOf(target);if(from<0||to<0||from===to)return;openIds.splice(from,1);openIds.splice(to,0,id);save();render();}
  $('widgetTabs').addEventListener('dragstart',event=>{const tab=event.target.closest('[data-tab-id]');if(!tab)return;draggingTab=tab.dataset.tabId;event.dataTransfer?.setData('text/plain',draggingTab);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';tab.classList.add('is-dragging');});
  $('widgetTabs').addEventListener('dragover',event=>{if(draggingTab&&event.target.closest('[data-tab-id]'))event.preventDefault();});
  $('widgetTabs').addEventListener('drop',event=>{event.preventDefault();const target=event.target.closest('[data-tab-id]');if(target)reorderTab(draggingTab,target.dataset.tabId);draggingTab='';});
  $('widgetTabs').addEventListener('dragend',()=>{draggingTab='';$('widgetTabs').querySelectorAll('.is-dragging').forEach(node=>node.classList.remove('is-dragging'));});
  $('widgetTabs').addEventListener('keydown',event=>{if(event.key==='F2'){event.preventDefault();editName('rename');return;}if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const i=openIds.indexOf(activeId),next=openIds[(i+(event.key==='ArrowRight'?1:openIds.length-1))%openIds.length];if(event.altKey)reorderTab(activeId,next);else activateBoard(next);$('widgetTabs').querySelector('[aria-selected=true]')?.focus();});
  $('widgetSidebarLibrary').onclick=library;$('widgetLibraryOpen').onclick=library;$('widgetLibraryClose').onclick=()=>$('widgetLibrary').close();
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&$('widgetLibrary').open&&!document.querySelector('dialog:modal')){event.preventDefault();$('widgetLibrary').close();$('widgetSidebarLibrary').focus({preventScroll:true});}});
  $('widgetCategories').onclick=event=>{const b=event.target.closest('[data-category]');if(b){category=b.dataset.category;renderLibrary();}};
  $('widgetLibraryList').onclick=event=>{const button=event.target.closest('[data-add-preset]');if(button){const component=catalog.find(c=>c.id===button.dataset.addPreset);if(component)addPreset(component,button);}};
  $('widgetConfigClose').onclick=$('widgetConfigCancel').onclick=()=>$('widgetConfig').close();
  let resolvingSymbol=false;
  $('widgetAddForm').onsubmit=async event=>{
    event.preventDefault();if(resolvingSymbol)return;const board=current(),card=board?.cards.find(c=>c.id===editingCardId),component=catalog.find(c=>c.id===componentId);if(!card||!component)return;
    const title=$('widgetCardName').value.trim(),raw=$('widgetSymbol').value.trim();if(!title)return;
    if(jobs.has(activeId)||commandControllers.has(activeId)){$('widgetConfigError').textContent='请等待当前调整完成。';return;}
    resolvingSymbol=true;const submit=$('widgetAddForm').querySelector('button[type=submit]');submit.disabled=true;
    try{
      const resolved=symbolPicker?.enabled&&raw?await symbolPicker.resolve():raw;
      if(raw!==$('widgetSymbol').value.trim()||editingCardId!==card.id||!$('widgetConfig').open)return;
      const text=component.provider==='TradingView'?resolved:resolved.split(/[,，、;；]+/).map(symbol=>symbol.trim().split(':').at(-1)).join('、');
      const market=component.inputMode==='market'?$('widgetMarket').value:'default',symbols=component.inputMode==='market'?[]:text.split(/[,，、;；\s]+/).filter(Boolean);
      const previous=card.parameters||{};
      const retained=Object.fromEntries(advancedChartParameters.filter(key=>previous[key]!==undefined&&key!=='interval').map(key=>[key,previous[key]]));
      const parameters={symbols,market,...retained,...(!$('widgetIntervalField').hidden?{interval:$('widgetInterval').value}:{})};
      if(!symbols.length&&!['market','currencies'].includes(component.inputMode)&&!component.allowEmptySymbols)throw Error('请填写关注标的。');
      const same=JSON.stringify(previous.symbols||[])===JSON.stringify(symbols)&& (previous.market||'default')===market&&(previous.interval||'')===(parameters.interval||'');
      undoByBoard.set(board.id,JSON.parse(JSON.stringify(board)));
      if(!same){
        if(component.provider==='TradingView'){
          const response=await fetch('/api/widgets/tradingview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({widget:component.widget,preset:component.preset||null,...parameters,symbolMarket:symbolPicker?.enabled?symbolPicker.select.value:'auto',theme:document.documentElement.dataset.theme==='light'?'light':'dark',language:'zh-CN'})});
          const result=await response.json();if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'保存失败，请重试。');const url=safeUrl(result.url);if(!url)throw Error('图表地址不可用。');if(!boards.includes(board)||!board.cards.includes(card))return;
          Object.assign(card,{url,parameters,market,request:text,status:'ready'});delete card.contentHeight;
        }else{ $('widgetConfig').close();await generate(text,component,card.id,market,board,parameters);const updated=board.cards.find(c=>c.id===editingCardId);if(updated)Object.assign(updated,{parameters,title,customTitle:true,symbolInput:raw});save();if(activeId===board.id)render();return; }
      }
      if(!boards.includes(board)||!board.cards.includes(card))return;Object.assign(card,{title,customTitle:true,symbolInput:raw});save();render();$('widgetConfig').close();
    }catch(error){$('widgetConfigError').textContent=error.message;}finally{resolvingSymbol=false;submit.disabled=false;}
  };
  $('widgetForm').onsubmit=event=>{event.preventDefault();const text=$('widgetPrompt').value.trim();if(!text||jobs.has(activeId)||commandControllers.has(activeId))return;$('widgetPrompt').value='';updateComposer();if(!applyLayoutRequest(text))runCommand(text);};
  function updateComposer(){const input=$('widgetPrompt'),box=input.closest('.widgetComposerBox');if(typeof resizeComposerInput==='function')resizeComposerInput(input,box);else{input.style.height='38px';const height=Math.max(38,Math.min(120,input.scrollHeight));input.style.height=height+'px';input.style.overflowY=input.scrollHeight>height?'auto':'hidden';box.classList.toggle('is-multiline',input.value.includes('\n')||height>40);}$('widgetGenerate').classList.toggle('is-ready',!!input.value.trim());}
  $('widgetPrompt').oninput=updateComposer;
  $('widgetPrompt').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('widgetForm').requestSubmit();}};
  $('widgetStop').onclick=()=>{commandControllers.get(activeId)?.abort();jobs.get(activeId)?.abort();};
  workspace.addEventListener('click',event=>{const b=event.target.closest('[data-widget-prompt]');if(b){try{ensureBoard();}catch(error){notice(error.message);return;}selectedCardId='';updateSelection();$('widgetPrompt').value=b.dataset.widgetPrompt;updateComposer();$('widgetPrompt').focus({preventScroll:true});}});
  canvas.addEventListener('click',event=>{
    const el=event.target.closest('[data-card]');if(!el){selectedCardId='';updateSelection();return;}const board=current(),card=board.cards.find(c=>c.id===el.dataset.card);if(!card)return;
    if(!event.target.closest('button')){selectedCardId=card.id;updateSelection();}
    if(event.target.closest('[data-config]')){configureCard(card);return;}
    if(event.target.closest('[data-remove]')){board.cards=board.cards.filter(c=>c!==card);save();render();}
    if(event.target.closest('[data-open]')&&card.url)window.open(frameUrl(card),'_blank','noopener');
    if(event.target.closest('[data-retry]'))generate(card.request,catalog.find(c=>c.id===card.component)|| (card.component?{id:card.component,title:card.title}:null),card.id,card.market||'default');
    const size=event.target.closest('[data-size]');if(size){card.w=clamp(card.w+(size.dataset.size==='wide'?3:-3),3,12);settle(board,card);save();applyLayout();}
  });
  canvas.addEventListener('keydown',event=>{
    if(['Enter',' '].includes(event.key)&&event.target.classList.contains('widgetCardHeader')){event.preventDefault();selectedCardId=event.target.closest('[data-card]').dataset.card;updateSelection();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||event.target.closest('button'))return;
    const el=event.target.closest('[data-card]');if(!el)return;event.preventDefault();const board=current(),card=board.cards.find(c=>c.id===el.dataset.card),resize=event.target.classList.contains('widgetResize');
    if(resize){if(['ArrowUp','ArrowDown'].includes(event.key)){card.manualHeight=true;delete card.contentHeight;}card.w=clamp(card.w+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0),3,12);card.h=clamp(card.h+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0),minRows(card),40);event.target.setAttribute('aria-valuenow',card.w);}else {card.x=clamp(card.x+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0),0,12-card.w);card.y=Math.max(0,card.y+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0));}
    settle(board,card);save();applyLayout();
  });
  canvas.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('.widgetCardHeader,.widgetResize');if(!handle||event.target.closest('button')||event.button!==0)return;
    const el=handle.closest('[data-card]'),board=current(),card=board.cards.find(c=>c.id===el.dataset.card);if(!card)return;
    selectedCardId=card.id;updateSelection();event.preventDefault();const resize=handle.classList.contains('widgetResize'),start={px:event.clientX,py:event.clientY,x:card.x,y:card.y,w:card.w,h:card.h},unit=(canvas.clientWidth+GAP)/12;
    el.classList.add('is-moving');canvas.classList.add('is-interacting');handle.setPointerCapture(event.pointerId);
    const move=e=>{const dx=e.clientX-start.px,dy=e.clientY-start.py;
      if(resize){if(Math.abs(dy)>2){card.manualHeight=true;delete card.contentHeight;}card.w=mobile()?start.w:clamp(Math.round(start.w+dx/unit),3,12);card.h=clamp(Math.round(start.h+dy/ROW),minRows(card),40);}else {card.x=mobile()?0:clamp(Math.round(start.x+dx/unit),0,12-card.w);card.y=Math.max(0,Math.round(start.y+dy/ROW));}
      applyLayout();
    };
    const end=e=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);el.classList.remove('is-moving');canvas.classList.remove('is-interacting');settle(board,card);save();applyLayout();renderPromptHint(card);};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.data?.type!=='ashare-live-meta')return;
    const frame=[...canvas.querySelectorAll('iframe')].find(f=>f.contentWindow===event.source);
    const node=frame?.closest('[data-card]'),board=current(),card=board?.cards.find(c=>c.id===node?.dataset.card);
    if(!card||ashareMinuteSymbol(card)!==event.data.symbol)return;
    let changed=false;
    if(event.data.name&&!card.customTitle){const title=String(event.data.name).slice(0,60)+' · 分钟行情';if(card.title!==title){card.title=title;node.querySelector('.widgetCardTitle').textContent=title;frame.title=title;changed=true;}}
    const height=Number(event.data.height)+64;
    if(!card.manualHeight&&Number.isFinite(height)&&height>=200&&height<=1600&&Math.abs((card.contentHeight||0)-height)>1){card.contentHeight=height;card.h=Math.ceil(height/ROW);changed=true;}
    if(changed){save();applyLayout();}
  });
  const artifactDialog=$('widgetAddArtifactDialog'),artifactForm=$('widgetAddArtifactForm'),artifactBoard=$('widgetAddArtifactBoard'),artifactNewField=$('widgetAddArtifactNewField'),artifactNewName=$('widgetAddArtifactNewName'),artifactError=$('widgetAddArtifactError');
  function openArtifactDialog(detail={}){
    const url=safeUrl(detail.url);if(!url||!artifactDialog)return;
    pendingArtifact={url,title:String(detail.title||'可视化组件').trim().slice(0,160)||'可视化组件',trigger:detail.trigger};
    artifactBoard.innerHTML=boards.map(board=>`<option value="${esc(board.id)}">${esc(board.title)}（${board.cards.length}）</option>`).join('')+'<option value="__new__">新建看板</option>';
    artifactBoard.value=current()?.id||boards[0]?.id||'__new__';artifactNewField.hidden=artifactBoard.value!=='__new__';artifactNewName.required=!artifactNewField.hidden;artifactNewName.disabled=artifactNewField.hidden;artifactNewName.value='';artifactError.textContent='';artifactDialog.showModal();
  }
  artifactBoard?.addEventListener('change',()=>{artifactNewField.hidden=artifactBoard.value!=='__new__';artifactNewName.required=artifactBoard.value==='__new__';artifactNewName.disabled=artifactNewField.hidden;artifactError.textContent='';if(!artifactNewField.hidden)artifactNewName.focus();});
  $('widgetAddArtifactCancel')?.addEventListener('click',()=>artifactDialog.close());
  artifactForm?.addEventListener('submit',event=>{
    event.preventDefault();if(!pendingArtifact)return;
    let board=boards.find(item=>item.id===artifactBoard.value);
    if(artifactBoard.value==='__new__'){
      const title=artifactNewName.value.trim();if(!title){artifactError.textContent='请输入新看板名称。';artifactNewName.focus();return;}
      if(boards.length>=40){artifactError.textContent='最多保存 40 个看板。';return;}
      board={id:uid(),title:title.slice(0,48),cards:[],messages:[]};boards.push(board);openIds.push(board.id);
    }
    if(!board){artifactError.textContent='请选择一个看板。';return;}
    if(board.cards.length>=60){artifactError.textContent='该看板已达到 60 个组件上限。';return;}
    if(board.cards.some(card=>safeUrl(card.url)===pendingArtifact.url)){artifactError.textContent='这个组件已经在该看板中。';return;}
    const card={id:uid(),title:pendingArtifact.title,url:pendingArtifact.url,status:'ready',component:'',request:pendingArtifact.title,parameters:{},x:0,y:0,w:12,h:18,customTitle:true,importedFromConversation:true,createdAt:new Date().toISOString()};
    place(board,card);board.cards.push(card);if(!openIds.includes(board.id))openIds.push(board.id);save();
    if(board.id===activeId&&!workspace.hidden)render();
    pendingArtifact.trigger?.classList.add('is-added');pendingArtifact.trigger?.setAttribute('title',`已添加到 ${board.title}`);pendingArtifact.trigger?.setAttribute('aria-label',`已添加到 ${board.title}`);
    artifactDialog.close();pendingArtifact=null;
  });
  window.addEventListener('mentora:add-artifact-to-widget',event=>openArtifactDialog(event.detail));
  document.addEventListener('click',event=>{if(event.target.closest('#navWidgets,#railWidgets'))enter();else if(event.target.closest('#navTasks,#railTasks,#dayCustomizeTasks'))leave();});
  window.addEventListener('veya:chat-navigate',()=>{if(!internal)leave();});
  window.addEventListener('popstate',()=>{if(new URL(location.href).searchParams.get('tab')==='widgets'){const id=new URL(location.href).searchParams.get('board');if(boards.some(b=>b.id===id)){activeId=id;if(!openIds.includes(id))openIds.push(id);}enter(false);}else leave();});
  new ResizeObserver(()=>applyLayout()).observe(canvas);
  new MutationObserver(()=>{for(const frame of canvas.querySelectorAll('iframe')){const card=current()?.cards.find(c=>c.id===frame.closest('[data-card]').dataset.card);if(card)frame.src=frameUrl(card);}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  load();
  if(repairBoardTitles())save();
  if(new URL(location.href).searchParams.get('tab')==='widgets'){const id=new URL(location.href).searchParams.get('board');if(boards.some(b=>b.id===id)){activeId=id;if(!openIds.includes(id))openIds.push(id);}enter(false);}
})();
