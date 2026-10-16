import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../app/static/widgets.js',import.meta.url),'utf8');
const homeSource=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../app/static/widget-catalog.json',import.meta.url),'utf8'));
const tick=()=>new Promise(r=>setTimeout(r,15));
function setup({storage,reply,plan,blocked=false}={}) {
 const dom=new JSDOM(html,{url:'https://example.com/mentora/?tab=widgets',runScripts:'outside-only'}),w=dom.window;
 w.ResizeObserver=class{observe(){}};w.CSS={escape:x=>x};w.matchMedia=()=>({matches:false});w.confirm=()=>true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(value){this.open=false;this.returnValue=value;this.dispatchEvent(new w.Event('close'));};
 if(storage)w.localStorage.setItem('mentora-widget-boards-v1',JSON.stringify(storage));
 if(blocked)Object.defineProperty(w,'localStorage',{get(){throw Error('blocked');}});
 const calls=[];w.fetch=async(url,options)=>{calls.push({url,options});if(url.includes('catalog'))return{ok:true,json:async()=>catalog};if(url==='/api/widgets/plan')return{ok:true,json:async()=>typeof plan==='function'?plan(JSON.parse(options.body)):plan||{reply:'已添加图表。',actions:[{type:'add',componentId:'cash_flow',parameters:{symbols:['AAPL']}}]}};if(url==='/api/widgets/tradingview')return{ok:true,json:async()=>({url:'/generated/direct-tv.html',title:'TradingView 直接添加',mode:'direct'})};return{ok:true,body:reply};};
 w.readEventStream=async(body,callback)=>{if(typeof body==='function')await body(callback);else callback('final',{reportArtifacts:[{url:'/generated/real-kline.html',title:'苹果近期股价'},{url:'/generated/real-revenue.html',title:'苹果营收构成'}],interpretation:'真实研究结果'});};
 w.eval(homeSource.slice(homeSource.indexOf('function formatInsight(')));
 w.eval(homeSource.slice(homeSource.indexOf('function resizeComposerInput('),homeSource.indexOf('function ensureCurrentSession(')));
 w.eval(source);return {dom,w,d:w.document,calls};
}
function submit(w,d,text){d.querySelector('#widgetPrompt').value=text;d.querySelector('#widgetForm').dispatchEvent(new w.Event('submit',{cancelable:true}));}
test('catalogue refers only to existing native business components',()=>{assert.ok(!catalog.some(c=>['kline','multi_intraday'].includes(c.id)));const widgets=JSON.parse(readFileSync(new URL('../app/skills/trading-view-chart/widgets.json',import.meta.url),'utf8'));assert.equal(new Set(catalog.filter(c=>c.provider==='TradingView').map(c=>c.widget)).size,Object.keys(widgets).length);for(const c of catalog){if(c.provider==='TradingView')assert.ok(widgets[c.widget]);else assert.ok(readFileSync(new URL(`../app/skills/business-chart-recall/scripts/${c.id}.py`,import.meta.url),'utf8').length);assert.ok(c.category);}});
test('generation uses the real research stream, persists separate charts and keyboard resize avoids overlap',async()=>{
 const{dom,w,d,calls}=setup();assert.equal(d.querySelector('#widgetWorkspace').hidden,false);assert.ok(d.querySelector('.shell').classList.contains('widgets-view'));assert.equal(d.querySelector('#widgetSidebar').hidden,false);assert.ok(d.querySelector('#widgetWorkspace .widgetTopbar #widgetTabs'));assert.equal(d.querySelector('#widgetBoardTitle').textContent,'我的看板');
 submit(w,d,'帮我看看苹果的近期经营和股价');await tick();
 assert.equal(calls[0].url,'/api/widgets/plan');const body=JSON.parse(calls.find(c=>c.url==='/api/chat/stream').options.body);assert.match(body.question,/原生脚本取真实数据/);
 assert.equal(d.querySelectorAll('.widgetCard iframe').length,2);assert.match(d.querySelector('.widgetCard iframe').src,/share-artifact\/real-kline.html/);
 const resize=d.querySelector('.widgetResize');resize.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 const data=JSON.parse(w.localStorage.getItem('mentora-widget-boards-v1')),cards=data.boards[0].cards;assert.equal(cards[0].w,7);
 const[a,b]=cards;assert.ok(a.x>=b.x+b.w||a.x+a.w<=b.x||a.y>=b.y+b.h||a.y+a.h<=b.y);
 assert.equal(d.querySelector('#widgetEmpty').hidden,true);dom.window.close();
});
test('manual library preserves selected component and symbol in request',async()=>{
 const{dom,w,d,calls}=setup();d.querySelector('#widgetSidebarLibrary').click();await tick();
 d.querySelector('[data-component="cash_flow"]').click();d.querySelector('#widgetSymbol').value='MSFT';d.querySelector('#widgetAddForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 const body=JSON.parse(calls.find(c=>c.url==='/api/chat/stream').options.body);assert.match(body.question,/MSFT/);assert.match(body.question,/cash_flow.py/);assert.match(body.question,/只生成指定的一张/);dom.window.close();
});
test('independent boards keep results when switching during generation and survive reload',async()=>{
 let finish;const wait=new Promise(r=>finish=r);const {dom,w,d}=setup({reply:async cb=>{await wait;cb('final',{reportArtifacts:[{url:'/generated/board-one.html'}]});}});
 submit(w,d,'第一张看板');await tick();d.querySelector('#widgetNew').click();d.querySelector('#widgetNameInput').value='另一张看板';d.querySelector('#widgetNameDialog').close('save');
 assert.equal(d.querySelectorAll('.widgetCard').length,0);finish();await tick();assert.equal(d.querySelectorAll('.widgetCard').length,0);
 const stored=JSON.parse(w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(stored.boards[0].cards.length,1);assert.equal(stored.boards[1].cards.length,0);dom.window.close();
 const next=setup({storage:stored});assert.equal(next.d.querySelectorAll('.widgetCard').length,0);next.d.querySelector('[data-board]').click();assert.equal(next.d.querySelectorAll('.widgetCard iframe').length,1);next.dom.window.close();
});
test('unsafe URLs are rejected, unfinished jobs show retry, storage denial remains usable',()=>{
 const storage={activeId:'one',boards:[{id:'one',title:'test',cards:[{id:'c',x:0,y:0,w:6,h:18,url:'https://evil.test/chart.html',status:'loading'}]}]};
 const s=setup({storage});assert.equal(s.d.querySelectorAll('.widgetCard iframe').length,0);assert.match(s.d.querySelector('.widgetCardBody').textContent,/中断/);assert.ok(s.d.querySelector('[data-retry]'));s.dom.window.close();
 const b=setup({blocked:true});assert.equal(b.d.querySelector('#widgetWorkspace').hidden,false);b.dom.window.close();
});
test('empty or failed output is visible and never inserts fabricated charts',async()=>{
 const s=setup({reply:async cb=>cb('error',{detail:'数据源暂不可用'})});submit(s.w,s.d,'看看 NVDA');await tick();assert.equal(s.d.querySelectorAll('.widgetCard iframe').length,0);assert.match(s.d.querySelector('.widgetCardBody').textContent,/数据源暂不可用/);assert.ok(s.d.querySelector('[data-retry]'));s.dom.window.close();
});

test('manual TradingView screener adds directly without any chat or model request',async()=>{
 const {dom,w,d,calls}=setup();d.querySelector('#widgetSidebarLibrary').click();await tick();d.querySelector('[data-component="tv-screener"]').click();
 assert.equal(d.querySelector('#widgetSymbol').hidden,true);d.querySelector('#widgetMarket').value='hongkong';
 d.querySelector('#widgetAddForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 assert.equal(calls.some(c=>c.url==='/api/chat/stream'),false);const body=JSON.parse(calls.find(c=>c.url==='/api/widgets/tradingview').options.body);assert.equal(body.widget,'screener');assert.equal(body.market,'hongkong');assert.deepEqual(body.symbols,[]);assert.equal(d.querySelectorAll('.widgetCard iframe').length,1);dom.window.close();
});
test('manual TradingView quote-list preserves multiple symbols and uses direct endpoint',async()=>{
 const {dom,w,d,calls}=setup();d.querySelector('#widgetSidebarLibrary').click();await tick();
 d.querySelector('[data-category="行情观察"]').click();d.querySelector('[data-component="tv-market-data"]').click();d.querySelector('#widgetSymbol').value='NASDAQ:AAPL,NASDAQ:NVDA';
 d.querySelector('#widgetAddForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 assert.equal(calls.some(c=>c.url==='/api/chat/stream'),false);const body=JSON.parse(calls.find(c=>c.url==='/api/widgets/tradingview').options.body);assert.equal(body.widget,'market-data');assert.deepEqual(body.symbols,['NASDAQ:AAPL','NASDAQ:NVDA']);
 d.querySelector('#widgetSidebarLibrary').click();await tick();d.querySelector('[data-category="宏观分析"]').click();assert.equal(d.querySelector('#widgetSymbol').value,'');
 d.querySelector('[data-category="行情观察"]').click();d.querySelector('[data-component="tv-market-data"]').click();assert.equal(d.querySelector('#widgetSymbol').value,'NASDAQ:AAPL,NASDAQ:NVDA');dom.window.close();
});

function twoCards(){return {activeId:'board',boards:[{id:'board',title:'观察看板',messages:[],cards:[{id:'one',title:'苹果行情',component:'tv-advanced-chart',url:'/generated/one.html',status:'ready',x:0,y:0,w:6,h:18,parameters:{symbols:['NASDAQ:AAPL'],interval:'D'}},{id:'two',title:'筛选器',component:'tv-screener',url:'/generated/two.html',status:'ready',x:6,y:0,w:6,h:18,parameters:{market:'default'}}]}]};}
test('card selection scopes model edits, applies parameter changes directly, and undo restores the board',async()=>{
 const s=setup({storage:twoCards(),plan:{reply:'已改为微软周线。',actions:[{type:'update',cardId:'one',componentId:'tv-advanced-chart',parameters:{symbols:['NASDAQ:MSFT'],interval:'W'},layout:{w:12,x:0}}]}});
 s.d.querySelector('[data-card="one"] .widgetCardHeader').click();assert.match(s.d.querySelector('#widgetScope').textContent,/已选/);
 submit(s.w,s.d,'改为微软周线并加宽');await tick();await tick();
 const request=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/plan').options.body);assert.equal(request.selectedCardId,'one');
 assert.equal(s.calls.some(c=>c.url==='/api/chat/stream'),false);
 const direct=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/tradingview').options.body);assert.equal(direct.interval,'W');assert.deepEqual(direct.symbols,['NASDAQ:MSFT']);
 assert.equal(s.d.querySelector('#widgetUndo').hidden,false);s.d.querySelector('#widgetUndo').click();
 const data=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(data.boards[0].cards[0].w,6);assert.equal(data.boards[0].cards[0].parameters.symbols[0],'NASDAQ:AAPL');s.dom.window.close();
});
test('layout-only command preserves live iframe elements and the scope can return to the whole board',async()=>{
 const s=setup({storage:twoCards(),plan:{reply:'已改为上下排列。',actions:[{type:'update',cardId:'one',layout:{x:0,y:0,w:12}},{type:'update',cardId:'two',layout:{x:0,y:19,w:12}}]}});
 const detached=[];const observer=new s.w.MutationObserver(records=>records.forEach(r=>detached.push(...r.removedNodes)));observer.observe(s.d.querySelector('#widgetCanvas'),{childList:true});
 const original=s.d.querySelector('[data-card="two"] iframe');s.d.querySelector('[data-card="one"] .widgetCardHeader').click();s.d.querySelector('#widgetScope').click();assert.equal(s.d.querySelector('#widgetScope').textContent,'');assert.equal(s.d.querySelector('#widgetScope').hidden,true);
 submit(s.w,s.d,'上下排列');await tick();await tick();assert.equal(s.d.querySelector('[data-card="two"] iframe'),original);assert.equal(detached.length,0);observer.disconnect();
 assert.equal(s.calls.some(c=>c.url==='/api/widgets/tradingview'||c.url==='/api/chat/stream'),false);s.dom.window.close();
});
test('library has no search or hosting notice and no field for parameter-free components',async()=>{
 const s=setup();s.d.querySelector('#widgetSidebarLibrary').click();await tick();assert.equal(s.d.querySelector('#widgetLibrary h2').textContent,'图表库');assert.equal(s.d.querySelector('#widgetSearch'),null);assert.equal(s.d.querySelector('#widgetLibraryNote'),null);
 s.d.querySelector('[data-component="tv-crypto-heatmap"]').click();assert.equal(s.d.querySelector('#widgetParameterField').hidden,true);s.d.querySelector('[data-component="tv-screener"]').click();assert.equal(s.d.querySelector('#widgetParameterField').hidden,false);assert.equal(s.d.querySelector('#widgetMarket').hidden,false);s.dom.window.close();
});

test('single-scope widgets hide the field and submit default after switching from another market',async()=>{
 for(const component of catalog.filter(c=>c.provider==='TradingView'&&c.inputMode==='market'&&(!c.scopeOptions||c.scopeOptions.length===1))){
  const s=setup();s.d.querySelector('#widgetSidebarLibrary').click();await tick();
  s.d.querySelector('[data-component="tv-screener"]').click();s.d.querySelector('#widgetMarket').value='china';
  s.d.querySelector(`[data-component="${component.id}"]`).click();
  assert.equal(s.d.querySelector('#widgetParameterField').hidden,true,component.id);
  assert.equal(s.d.querySelector('#widgetMarket').value,'default',component.id);
  assert.doesNotMatch(s.d.querySelector('#widgetSymbolLabel').textContent,/可选/);
  s.d.querySelector('#widgetAddForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await tick();
  const body=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/tradingview').options.body);
  assert.equal(body.market,'default');assert.deepEqual(body.symbols,[]);s.dom.window.close();
 }
});

test('sidebar chat persists per board, forwards follow-up history and keeps board tabs above the canvas',async()=>{
 const s=setup({storage:twoCards(),plan:{reply:'想放大哪张卡片？',actions:[]}});
 assert.ok(s.d.querySelector('#widgetSidebar #widgetForm'));assert.equal(s.d.querySelector('#widgetWorkspace #widgetForm'),null);assert.match(s.d.querySelector('.widgetChatHeader').textContent,/Mentora Widget/);
 submit(s.w,s.d,'把它放大一点');await tick();await tick();assert.match(s.d.querySelector('#widgetChatLog').textContent,/把它放大一点/);assert.match(s.d.querySelector('#widgetChatLog').textContent,/想放大哪张卡片/);
 submit(s.w,s.d,'第一张');await tick();await tick();const requests=s.calls.filter(c=>c.url==='/api/widgets/plan').map(c=>JSON.parse(c.options.body));assert.equal(requests[1].history[0].content,'把它放大一点');assert.equal(requests[1].history[1].role,'assistant');
 const storage=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(storage.boards[0].chat.length,4);
 s.d.querySelector('#widgetNew').click();s.d.querySelector('#widgetNameInput').value='新页签';s.d.querySelector('#widgetNameDialog').close('save');assert.equal(s.d.querySelector('#widgetTabs [aria-selected=true]').textContent,'新页签');assert.doesNotMatch(s.d.querySelector('#widgetChatLog').textContent,/第一张/);
 s.d.querySelector('[data-board="board"]').click();assert.match(s.d.querySelector('#widgetChatLog').textContent,/第一张/);s.dom.window.close();
 const restored=setup({storage});assert.match(restored.d.querySelector('#widgetChatLog').textContent,/第一张/);restored.dom.window.close();
});


test('TradingView detail links can open independent tabs without inheriting the board sandbox',()=>{
 const s=setup({storage:twoCards()});
 const frame=s.d.querySelector('[data-card="one"] iframe');
 const permissions=frame.getAttribute('sandbox').split(/\s+/);
 assert.ok(permissions.includes('allow-popups'));
 assert.ok(permissions.includes('allow-popups-to-escape-sandbox'));
 assert.ok(!permissions.includes('allow-top-navigation'));
 s.dom.window.close();
});
test('mobile chat opener stays open and an edited title survives iframe loading and reload',async()=>{
 const s=setup({storage:twoCards(),plan:{reply:'已修改标题。',actions:[{type:'update',cardId:'one',title:'科技股行情'}]}});
 s.w.setSidebarCollapsed=value=>s.d.querySelector('.shell').classList.toggle('sidebar-open',!value);
 s.d.addEventListener('click',e=>{if(!e.target.closest('#appSidebar'))s.w.setSidebarCollapsed(true);});
 s.d.querySelector('#widgetChatToggle').click();assert.ok(s.d.querySelector('.shell').classList.contains('sidebar-open'));
 s.d.querySelector('[data-card="one"] .widgetCardHeader').click();submit(s.w,s.d,'标题改成科技股行情');await tick();await tick();
 const storage=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(storage.boards[0].cards[0].customTitle,true);
 s.dom.window.close();const r=setup({storage});const frame=r.d.querySelector('[data-card="one"] iframe');frame.contentDocument.title='原有标题';frame.dispatchEvent(new r.w.Event('load'));assert.equal(r.d.querySelector('[data-card="one"] .widgetCardTitle').textContent,'科技股行情');r.dom.window.close();
});


test('widget chat uses home bubbles, safe Markdown, and the shared multiline composer',()=>{
 const storage=twoCards();storage.boards[0].chat=[{role:'user',content:'看一下苹果\n保留换行 <img src=x onerror=alert(1)>'},{role:'assistant',content:'**已添加**\n\n- 苹果走势\n- 微软走势\n\n<script>alert(1)</script>'}];
 const s=setup({storage});
 const user=s.d.querySelector('#widgetChatLog .message.user .bubble.userBubble');
 assert.match(user.textContent,/保留换行/);assert.equal(user.querySelector('img'),null);
 const answer=s.d.querySelector('#widgetChatLog .message.assistant .assistantBubble .streamingAnswer');
 assert.equal(answer.querySelector('strong').textContent,'已添加');assert.equal(answer.querySelectorAll('li').length,2);assert.equal(answer.querySelector('script'),null);
 assert.equal(s.d.querySelector('.widgetMessageAuthor'),null);
 const input=s.d.querySelector('#widgetPrompt');input.style.lineHeight='24px';input.style.padding='7px 0';Object.defineProperty(input,'scrollHeight',{get:()=>90});
 input.value='第一行\n第二行';input.dispatchEvent(new s.w.Event('input'));
 assert.equal(input.closest('.composerBox').classList.contains('is-multiline'),true);assert.equal(input.style.height,'90px');
 input.dispatchEvent(new s.w.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));assert.equal(s.calls.some(c=>c.url==='/api/widgets/plan'),false);s.dom.window.close();
});
test('old ticker strips become compact, pull following cards up, and remain resizeable after migration',()=>{
 const storage=twoCards();Object.assign(storage.boards[0].cards[0],{component:'tv-ticker-tape',w:12,h:18});Object.assign(storage.boards[0].cards[1],{x:0,y:19,w:12});
 const s=setup({storage});assert.equal(s.d.querySelector('[data-card="one"]').style.height,'144px');assert.equal(s.d.querySelector('[data-card="two"]').style.top,'168px');
 s.d.querySelector('[data-card="one"] .widgetResize').dispatchEvent(new s.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
 const saved=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(saved.boards[0].cards[0].h,7);s.dom.window.close();const r=setup({storage:saved});assert.equal(r.d.querySelector('[data-card="one"]').style.height,'168px');r.dom.window.close();
});

function linkedBoard(){const data=twoCards();data.boards[0].cards.push({id:'list',title:'CRCL / TLT / HOOD',component:'tv-market-data',url:'/generated/list.html',status:'ready',x:0,y:40,w:12,h:18,parameters:{symbols:['NYSE:CRCL','NASDAQ:TLT','NASDAQ:HOOD']}});data.boards[0].cards[0].parameters.interval='W';return data;}
test('quote-list symbol selection updates single-symbol TradingView cards and preserves the list, market, layout, interval and undo',async()=>{
 const s=setup({storage:linkedBoard()});const source=s.d.querySelector('[data-card="list"] iframe'),market=s.d.querySelector('[data-card="two"] iframe');
 s.d.querySelector('[data-link-symbol="NYSE:CRCL"]').click();await tick();await tick();
 const direct=s.calls.filter(c=>c.url==='/api/widgets/tradingview');assert.equal(direct.length,1);const body=JSON.parse(direct[0].options.body);assert.deepEqual(body.symbols,['NYSE:CRCL']);assert.equal(body.interval,'W');
 assert.equal(s.calls.some(c=>c.url==='/api/widgets/plan'||c.url==='/api/chat/stream'),false);assert.equal(s.d.querySelector('[data-card="list"] iframe'),source);assert.equal(s.d.querySelector('[data-card="two"] iframe'),market);
 let data=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(data.boards[0].focusSymbol,'NYSE:CRCL');assert.equal(data.boards[0].cards[0].w,6);assert.equal(data.boards[0].cards[0].parameters.interval,'W');assert.equal(s.d.querySelector('[data-link-symbol="NYSE:CRCL"]').getAttribute('aria-pressed'),'true');
 s.d.querySelector('#widgetUndo').click();data=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(data.boards[0].cards[0].parameters.symbols[0],'NASDAQ:AAPL');assert.notEqual(data.boards[0].focusSymbol,'NYSE:CRCL');s.dom.window.close();
});
test('list-only boards create one detail chart and reuse it for subsequent selections',async()=>{
 const data=linkedBoard();data.boards[0].cards=data.boards[0].cards.filter(c=>c.id==='list');const s=setup({storage:data});
 s.d.querySelector('[data-link-symbol="NYSE:CRCL"]').click();await tick();await tick();
 assert.equal(s.d.querySelectorAll('.widgetCard').length,2);s.d.querySelector('[data-link-symbol="NASDAQ:HOOD"]').click();await tick();await tick();
 const payloads=s.calls.filter(c=>c.url==='/api/widgets/tradingview').map(c=>JSON.parse(c.options.body));assert.deepEqual(payloads.map(p=>p.symbols),[['NYSE:CRCL'],['NASDAQ:HOOD']]);assert.equal(s.d.querySelectorAll('.widgetCard').length,2);s.dom.window.close();
});
test('legacy list metadata can be recovered from its own saved TradingView document',()=>{
 const data=linkedBoard();delete data.boards[0].cards[2].parameters;const s=setup({storage:data});const frame=s.d.querySelector('[data-card="list"] iframe'),config=frame.contentDocument.createElement('script');config.id='tv-config';config.type='application/json';config.textContent=JSON.stringify({widget:'market-data',config:{symbolsGroups:[{symbols:[{name:'NYSE:CRCL'}]}]}});frame.contentDocument.open();frame.contentDocument.write('<!doctype html><html><head></head><body></body></html>');frame.contentDocument.close();frame.contentDocument.body.append(config);frame.dispatchEvent(new s.w.Event('load'));assert.ok(s.d.querySelector('[data-link-symbol="NYSE:CRCL"]'));s.dom.window.close();
});


test('symbol switching leaves chat unchanged and migrates only exact legacy assistant notices',async()=>{
 const data=linkedBoard(),notice='已切换到 CRCL，更新了 5 个单标的组件。';data.boards[0].chat=[{role:'user',content:notice},{role:'assistant',content:'你可以继续调整图表。'},{role:'assistant',content:notice},{role:'assistant',content:'已切换到 TLT，更新了 5 个单标的组件。'}];
 const s=setup({storage:data});const before=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1')).boards[0].chat;assert.equal(before.length,2);assert.equal(before[0].role,'user');assert.equal(before[0].content,notice);
 s.d.querySelector('[data-link-symbol="NYSE:CRCL"]').click();assert.equal(s.d.querySelector('#widgetChatLog .is-pending'),null);await tick();await tick();
 const after=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1')).boards[0].chat;assert.deepEqual(after,before);assert.doesNotMatch(s.d.querySelector('#widgetChatLog').textContent,/已切换到 TLT/);s.dom.window.close();
});

test('intraday is a single-symbol library preset and remains intraday during symbol linking',async()=>{
 const data=linkedBoard();data.boards[0].cards[0].component='tv-intraday';data.boards[0].cards[0].parameters={symbols:['NASDAQ:AAPL']};const s=setup({storage:data});
 s.d.querySelector('[data-link-symbol="NYSE:CRCL"]').click();await tick();await tick();const body=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/tradingview').options.body);assert.equal(body.widget,'symbol-overview');assert.equal(body.preset,'intraday');assert.deepEqual(body.symbols,['NYSE:CRCL']);
 s.d.querySelector('#widgetSidebarLibrary').click();await tick();s.d.querySelector('[data-component="tv-intraday"]').click();s.d.querySelector('#widgetSymbol').value='NASDAQ:HOOD';s.d.querySelector('#widgetAddForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await tick();assert.equal(JSON.parse(s.calls.filter(c=>c.url==='/api/widgets/tradingview').at(-1).options.body).preset,'intraday');s.dom.window.close();
});

test('currency, broker and default global lists submit without stock lookup',async()=>{
 for(const [id,category,input,expected] of [
  ['tv-forex-cross-rates','外汇市场','',[]],
  ['tv-forex-table','外汇市场','USD、EUR、JPY',['USD','EUR','JPY']],
  ['tv-broker-rating','交易服务','easymarkets',['easymarkets']],
  ['tv-market-data','行情观察','',[]],
 ]){
  const {dom,w,d,calls}=setup();d.querySelector('#widgetSidebarLibrary').click();await tick();
  const component=catalog.find(c=>c.id===id);
  d.querySelector(`[data-category="${component.category}"]`).click();
  d.querySelector(`[data-component="${id}"]`).click();
  d.querySelector('#widgetSymbol').value=input;
  d.querySelector('#widgetAddForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  const request=calls.find(c=>c.url==='/api/widgets/tradingview');assert.ok(request,id);
  assert.deepEqual(JSON.parse(request.options.body).symbols,expected,id);
  assert.equal(calls.some(c=>c.url.startsWith('/api/widgets/symbols')),false,id);
  dom.window.close();
 }
});

test('forex and crypto screener entries preserve presets with no redundant market input',async()=>{
 for(const preset of ['forex','crypto-pairs']){
  const {dom,w,d,calls}=setup();d.querySelector('#widgetSidebarLibrary').click();await tick();
  const component=catalog.find(c=>c.preset===preset);
  d.querySelector(`[data-category="${component.category}"]`).click();
  d.querySelector(`[data-component="${component.id}"]`).click();
  assert.equal(d.querySelector('#widgetParameterField').hidden,true);
  d.querySelector('#widgetAddForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  const body=JSON.parse(calls.find(c=>c.url==='/api/widgets/tradingview').options.body);
  assert.equal(body.preset,preset);assert.deepEqual(body.symbols,[]);dom.window.close();
 }
});
