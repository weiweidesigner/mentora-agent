import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../app/static/widgets.js',import.meta.url),'utf8');
const homeSource=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../app/static/widget-catalog.json',import.meta.url),'utf8'));
const tick=()=>new Promise(r=>setTimeout(r,15));
function setup({storage,reply,plan,blocked=false,symbolResults=[],generationCatalog=catalog}={}) {
 const dom=new JSDOM(html,{url:'https://example.com/mentora/?tab=widgets',runScripts:'outside-only'}),w=dom.window;
 w.ResizeObserver=class{observe(){}};w.CSS={escape:x=>x};w.matchMedia=()=>({matches:false});w.confirm=()=>true;
 w.HTMLDialogElement.prototype.show=w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(value){this.open=false;this.returnValue=value;this.dispatchEvent(new w.Event('close'));};
 if(storage)w.localStorage.setItem('mentora-widget-boards-v1',JSON.stringify(storage));
 if(blocked)Object.defineProperty(w,'localStorage',{get(){throw Error('blocked');}});
 const calls=[];w.fetch=async(url,options)=>{calls.push({url,options});if(url.startsWith('/api/widgets/symbols?'))return{ok:true,json:async()=>({results:symbolResults})};if(url==='/api/widgets/generation-catalog')return{ok:true,json:async()=>generationCatalog};if(url.includes('catalog'))return{ok:true,json:async()=>catalog};if(url==='/api/widgets/plan')return{ok:true,json:async()=>typeof plan==='function'?plan(JSON.parse(options.body)):plan||{reply:'已添加图表。',actions:[{type:'add',componentId:'cash_flow',parameters:{symbols:['AAPL']}}]}};if(url.startsWith('/api/widgets/presets/'))return{ok:true,json:async()=>({url:'/generated/preset.html',title:'苹果预制图表',parameters:{symbols:['NASDAQ:AAPL'],market:'default'}})};if(url==='/api/widgets/tradingview')return{ok:true,json:async()=>({url:'/generated/direct-tv.html',title:'TradingView 直接添加',mode:'direct'})};return{ok:true,body:reply};};
 w.readEventStream=async(body,callback)=>{if(typeof body==='function')await body(callback);else callback('final',{reportArtifacts:[{url:'/generated/real-kline.html',title:'苹果近期股价'},{url:'/generated/real-revenue.html',title:'苹果营收构成'}],interpretation:'真实研究结果'});};
 w.eval(homeSource.slice(homeSource.indexOf('function formatInsight(')));
 w.eval(homeSource.slice(homeSource.indexOf('function resizeComposerInput('),homeSource.indexOf('function ensureCurrentSession(')));
 w.eval(readFileSync(new URL('../app/static/widget-symbol-picker.js',import.meta.url),'utf8'));w.eval(source);return {dom,w,d:w.document,calls};
}
function submit(w,d,text){d.querySelector('#widgetPrompt').value=text;d.querySelector('#widgetForm').dispatchEvent(new w.Event('submit',{cancelable:true}));}
test('catalogue refers only to existing data-backed components',()=>{assert.ok(catalog.some(c=>c.id==='ashare-kline'));assert.ok(!catalog.some(c=>c.requiresDataSource));const widgets=JSON.parse(readFileSync(new URL('../app/skills/trading-view-chart/widgets.json',import.meta.url),'utf8'));assert.equal(new Set(catalog.filter(c=>c.provider==='TradingView').map(c=>c.widget)).size,Object.keys(widgets).length);for(const c of catalog){if(c.provider==='TradingView')assert.ok(widgets[c.widget]);else assert.ok(readFileSync(new URL(`../app/skills/${c.skill}/scripts/${c.script}`,import.meta.url),'utf8').length);assert.ok(c.category);}});
test('generation uses the real research stream, persists separate charts and keyboard resize avoids overlap',async()=>{
 const{dom,w,d,calls}=setup();assert.equal(d.querySelector('#widgetWorkspace').hidden,false);assert.ok(d.querySelector('.shell').classList.contains('widgets-view'));assert.equal(d.querySelector('#widgetSidebar').hidden,true);assert.ok(d.querySelector('#widgetWorkspace .widgetTopbar #widgetTabs'));assert.equal(d.querySelector('#widgetBoardTitle').textContent,'我的 Widget');
 submit(w,d,'帮我看看苹果的近期经营和股价');await tick();
 assert.ok(calls.some(c=>c.url==='/api/widgets/plan'));const body=JSON.parse(calls.find(c=>c.url==='/api/chat/stream').options.body);assert.match(body.question,/原生脚本取真实数据/);
 assert.equal(d.querySelectorAll('.widgetCard iframe').length,1);assert.match(d.querySelector('.widgetCard iframe').src,/share-artifact\/real-revenue.html/);
 const resize=d.querySelector('.widgetResize');resize.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 const data=JSON.parse(w.localStorage.getItem('mentora-widget-boards-v1')),cards=data.boards[0].cards;assert.equal(cards[0].w,7);
 assert.equal(cards.length,1);assert.equal(cards[0].component,'cash_flow');
 assert.equal(d.querySelector('#widgetEmpty').hidden,true);dom.window.close();
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




function twoCards(){return {activeId:'board',boards:[{id:'board',title:'观察看板',messages:[],cards:[{id:'one',title:'苹果行情',component:'tv-advanced-chart',url:'/generated/one.html',status:'ready',x:0,y:0,w:6,h:18,parameters:{symbols:['NASDAQ:AAPL'],interval:'D'}},{id:'two',title:'筛选器',component:'tv-screener',url:'/generated/two.html',status:'ready',x:6,y:0,w:6,h:18,parameters:{market:'default'}}]}]};}
function configuredMarketData(){
 const storage=twoCards();storage.boards[0].cards[0].component='tv-market-data';
 storage.boards[0].cards[0].parameters={symbols:['NASDAQ:AAPL'],market:'default',config:{symbolsGroups:[{name:'保留分组',symbols:[{name:'NASDAQ:AAPL',displayName:'自定义苹果'}]}],isTransparent:false,extraOfficialOption:{enabled:true}}};
 const generationCatalog=catalog.map(item=>item.id!=='tv-market-data'?item:{...item,settingsSchema:{fullConfigEditor:true,fields:[{key:'symbolsGroups',type:'json',label:'分组',scope:'config'},{key:'isTransparent',type:'boolean',label:'透明背景',scope:'config',default:false},{key:'followTheme',type:'boolean',label:'跟随主题',default:true}]}});
 return {storage,generationCatalog};
}
test('TradingView settings patch preserves groups, display names and optional nested config',async()=>{
 const s=setup(configuredMarketData());s.d.querySelector('[data-card="one"] [data-config]').click();await tick();
 assert.match(s.d.querySelector('[data-setting-key="symbolsGroups"]').value,/自定义苹果/);
 s.d.querySelector('[data-setting-key="isTransparent"]').checked=true;
 s.d.querySelector('#widgetAddForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await tick();await tick();
 const body=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/tradingview').options.body);
 assert.equal(body.config.symbolsGroups[0].symbols[0].displayName,'自定义苹果');
 assert.equal(body.config.symbolsGroups[0].name,'保留分组');assert.equal(body.config.isTransparent,true);
 assert.deepEqual(body.config.extraOfficialOption,{enabled:true});s.dom.window.close();
});
test('complete TradingView config editor replaces removed keys and accepts newly documented options',async()=>{
 const s=setup(configuredMarketData());s.d.querySelector('[data-card="one"] [data-config]').click();await tick();
 const config={symbolsGroups:[{name:'新分组',symbols:[{name:'NASDAQ:MSFT',displayName:'微软别名'}]}],newOfficialOption:{values:[1,2]}};
 s.d.querySelector('[data-full-config]').value=JSON.stringify(config);
 s.d.querySelector('#widgetAddForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await tick();await tick();
 const body=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/tradingview').options.body);
 assert.deepEqual(body.config,config);s.dom.window.close();
});
test('invalid JSON keeps the TradingView settings dialog open without submitting',async()=>{
 const s=setup(configuredMarketData());s.d.querySelector('[data-card="one"] [data-config]').click();await tick();
 s.d.querySelector('[data-full-config]').value='{broken';
 s.d.querySelector('#widgetAddForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await tick();
 assert.equal(s.d.querySelector('#widgetConfig').open,true);assert.match(s.d.querySelector('#widgetConfigError').textContent,/JSON/);
 assert.equal(s.calls.filter(c=>c.url==='/api/widgets/tradingview').length,0);s.dom.window.close();
});
test('title-only edits retain full TradingView config without recreating the widget',async()=>{
 const initial=configuredMarketData(),s=setup(initial);s.d.querySelector('[data-card="one"] [data-config]').click();await tick();
 s.d.querySelector('#widgetCardName').value='只改标题';
 s.d.querySelector('#widgetAddForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await tick();await tick();
 assert.equal(s.calls.filter(c=>c.url==='/api/widgets/tradingview').length,0);
 const card=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1')).boards[0].cards[0];
 assert.deepEqual(card.parameters.config,initial.storage.boards[0].cards[0].parameters.config);s.dom.window.close();
});
test('legacy no-MA sentinel is migrated before the board reaches the planner',async()=>{
 const storage={activeId:'board',boards:[{id:'board',title:'苹果',messages:[],cards:[{id:'chart',title:'MACD · NASDAQ:AAPL',component:'kline',url:'/generated/aapl.html',status:'ready',x:0,y:0,w:12,h:22,parameters:{symbols:['AAPL'],interval:'1d',ma:[0],subIndicators:['MACD']}}]}]};
 const s=setup({storage,plan:{reply:'无需调整。',actions:[]}});submit(s.w,s.d,'调整 MACD 颜色');await tick();await tick();
 const request=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/plan').options.body);
 assert.deepEqual(request.board.cards[0].parameters.ma,[]);
 const saved=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));
 assert.deepEqual(saved.boards[0].cards[0].parameters.ma,[]);s.dom.window.close();
});
test('adding an overlay preserves a line main series instead of falling back to candlesticks',async()=>{
 const storage={activeId:'board',boards:[{id:'board',title:'苹果',messages:[],cards:[{id:'chart',title:'AAPL',component:'kline',url:'/generated/aapl.html',status:'ready',x:0,y:0,w:12,h:22,parameters:{symbols:['AAPL'],interval:'1d',klineType:'line',ma:[],subIndicators:['MACD']}}]}]};
 const s=setup({storage,plan:{reply:'已添加均线。',actions:[{type:'update',cardId:'chart',componentId:'kline',parameters:{ma:[5,20]}}]}});
 s.d.querySelector('[data-card="chart"] .widgetCardHeader').click();submit(s.w,s.d,'添加 MA5 和 MA20');await tick();await tick();
 const card=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1')).boards[0].cards[0];
 assert.equal(card.parameters.klineType,'line');assert.deepEqual(card.parameters.ma,[5,20]);
 assert.equal(s.calls.some(c=>c.url==='/api/chat/stream'),false);s.dom.window.close();
});
test('card selection scopes model edits, applies parameter changes directly, and undo restores the board',async()=>{
 const s=setup({storage:twoCards(),plan:{reply:'已改为微软周线。',actions:[{type:'update',cardId:'one',componentId:'tv-advanced-chart',parameters:{symbols:['NASDAQ:MSFT'],interval:'W'},layout:{w:12,x:0}}]}});
 s.d.querySelector('[data-card="one"] .widgetCardHeader').click();assert.match(s.d.querySelector('#widgetScope').textContent,/苹果行情/);
 submit(s.w,s.d,'改为微软周线并加宽');await tick();await tick();
 const request=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/plan').options.body);assert.equal(request.selectedCardId,'one');
 assert.equal(s.calls.some(c=>c.url==='/api/chat/stream'),false);
 const direct=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/tradingview').options.body);assert.equal(direct.interval,'W');assert.deepEqual(direct.symbols,['NASDAQ:MSFT']);
 assert.equal(s.d.querySelector('#widgetUndo').hidden,false);s.d.querySelector('#widgetUndo').click();
 const data=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(data.boards[0].cards[0].w,6);assert.equal(data.boards[0].cards[0].parameters.symbols[0],'NASDAQ:AAPL');s.dom.window.close();
});
test('advanced chart prompt forwards and persists every supported toolbar control',async()=>{
 const controls={
  symbols:['NASDAQ:MSFT'],interval:'30',style:'2',studies:['RSI@tv-basicstudies'],
  compareSymbols:['NASDAQ:NVDA'],watchlist:['NASDAQ:AAPL','NASDAQ:MSFT','NASDAQ:NVDA'],timezone:'Asia/Shanghai',
  allowSymbolChange:false,showDrawingToolbar:true,showTopToolbar:false,showLegend:false,showVolume:false,
  showDetails:true,showHotlist:true,showDateRanges:true,showCalendar:true,saveImage:false,
  config:{style:'2',studies:['STD;EMA',{id:'MASimple@tv-basicstudies',inputs:{length:20}}],hide_volume:true},
 };
 const s=setup({storage:twoCards(),plan:{reply:'已更新高级图表。',actions:[{type:'update',cardId:'one',componentId:'tv-advanced-chart',parameters:controls}]}});
 s.d.querySelector('[data-card="one"] .widgetCardHeader').click();submit(s.w,s.d,'改成30分钟折线并把图表控制都调整好');await tick();await tick();
 const direct=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/tradingview').options.body);
 for(const [key,value] of Object.entries(controls))assert.deepEqual(direct[key],value);
 const card=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1')).boards[0].cards.find(card=>card.id==='one');
 for(const [key,value] of Object.entries(controls))assert.deepEqual(card.parameters[key],value);
 s.dom.window.close();
});
test('imported TradingView artifacts retain complete Skill config on hydration',async()=>{
 const s=setup({storage:twoCards()}),frame=s.d.querySelector('[data-card="one"] iframe');
 const config={symbol:'NASDAQ:AAPL',interval:'D',style:'2',studies:['STD;EMA'],hide_volume:true,compareSymbols:['NASDAQ:MSFT'],disabled_features:['mouse_wheel_scroll']};
 frame.contentDocument.open();frame.contentDocument.write('<html><body><script id="tv-config" type="application/json">'+JSON.stringify({widget:'advanced-chart',config})+'</script></body></html>');frame.contentDocument.close();
 frame.dispatchEvent(new s.w.Event('load'));await tick();
 const card=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1')).boards[0].cards.find(c=>c.id==='one');
 assert.deepEqual(card.parameters.config,config);
 s.dom.window.close();
});
test('layout-only command preserves live iframe elements and the scope can return to the whole board',async()=>{
 const s=setup({storage:twoCards(),plan:{reply:'已改为上下排列。',actions:[{type:'update',cardId:'one',layout:{x:0,y:0,w:12}},{type:'update',cardId:'two',layout:{x:0,y:19,w:12}}]}});
 const detached=[];const observer=new s.w.MutationObserver(records=>records.forEach(r=>detached.push(...r.removedNodes)));observer.observe(s.d.querySelector('#widgetCanvas'),{childList:true});
 const original=s.d.querySelector('[data-card="two"] iframe');s.d.querySelector('[data-card="one"] .widgetCardHeader').click();s.d.querySelector('#widgetScope').click();assert.equal(s.d.querySelector('#widgetScope').textContent,'');assert.equal(s.d.querySelector('#widgetScope').hidden,true);
 submit(s.w,s.d,'上下排列');await tick();await tick();assert.equal(s.d.querySelector('[data-card="two"] iframe'),original);assert.equal(detached.length,0);observer.disconnect();
 assert.equal(s.calls.some(c=>c.url==='/api/widgets/tradingview'||c.url==='/api/chat/stream'),false);s.dom.window.close();
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




test('old ticker strips become compact, pull following cards up, and remain resizeable after migration',()=>{
 const storage=twoCards();Object.assign(storage.boards[0].cards[0],{component:'tv-ticker-tape',w:12,h:18});Object.assign(storage.boards[0].cards[1],{x:0,y:19,w:12});
 const s=setup({storage});assert.equal(s.d.querySelector('[data-card="one"]').style.height,'144px');assert.equal(s.d.querySelector('[data-card="two"]').style.top,'168px');
 s.d.querySelector('[data-card="one"] .widgetResize').dispatchEvent(new s.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
 const saved=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(saved.boards[0].cards[0].h,7);s.dom.window.close();const r=setup({storage:saved});assert.equal(r.d.querySelector('[data-card="one"]').style.height,'168px');r.dom.window.close();
});

function linkedBoard(){const data=twoCards();data.boards[0].cards.push({id:'list',title:'CRCL / TLT / HOOD',component:'tv-market-data',url:'/generated/list.html',status:'ready',x:0,y:40,w:12,h:18,parameters:{symbols:['NYSE:CRCL','NASDAQ:TLT','NASDAQ:HOOD']}});data.boards[0].cards[0].parameters.interval='W';return data;}
test('intrinsic TradingView cards use measured pixels and move neighbours when content grows',async()=>{
 const storage={activeId:'board',boards:[{id:'board',title:'尺寸检查',cards:[
  {id:'quote',title:'报价',w:6,h:18,x:0,y:0,status:'ready',component:'tv-single-ticker',url:'/generated/quote.html'},
  {id:'next',title:'下方图表',w:6,h:18,x:0,y:19,status:'ready',component:'tv-advanced-chart',url:'/generated/chart.html'},
 ]}]};
 const {dom,w,d}=setup({storage});await tick();
 let reportHeight;
 w.installTradingViewSurface=(frame,callback)=>{reportHeight=callback;frame.closest('.widgetCard').classList.add('is-tradingview');};
 const frame=d.querySelector('[data-card="quote"] iframe');
 frame.dispatchEvent(new w.Event('load'));reportHeight(69,true);
 assert.equal(d.querySelector('[data-card="quote"]').style.height,'109px');
 reportHeight(620,true);
 const board=JSON.parse(w.localStorage.getItem('mentora-widget-boards-v1')).boards[0];
 const quote=board.cards.find(c=>c.id==='quote'),next=board.cards.find(c=>c.id==='next');
 assert.equal(quote.contentHeight,660);assert(next.y>=quote.y+quote.h);
 assert.equal(d.querySelector('[data-card="quote"]').style.height,'660px');
 dom.window.close();
});


test('canvas composer replaces the sidebar and retains follow-up history',async()=>{
 const s=setup({storage:twoCards(),plan:{reply:'需要哪张图表？',actions:[]}});
 assert.equal(s.d.querySelector('#widgetSidebar').hidden,true);assert.ok(s.d.querySelector('#widgetWorkspace > .widgetComposerArea #widgetForm'));
 submit(s.w,s.d,'增加对比');await tick();await tick();submit(s.w,s.d,'第一张');await tick();await tick();
 const requests=s.calls.filter(c=>c.url==='/api/widgets/plan').map(c=>JSON.parse(c.options.body));
 assert.equal(requests[1].history[0].content,'增加对比');assert.match(s.d.querySelector('#widgetStatus').textContent,/需要哪张/);s.dom.window.close();
});
test('drawer plus adds a hosted preset without parameters or a model call',async()=>{
 for(const id of ['tv-advanced-chart','tv-forex-screener']){
  const s=setup();s.d.querySelector('#widgetSidebarLibrary').click();await tick();
  assert.equal(s.d.querySelector('#widgetLibrary #widgetAddForm'),null);
  s.d.querySelector(`[data-add-preset="${id}"]`).click();await tick();
  assert.ok(s.calls.some(c=>c.url==='/api/widgets/presets/'+id));
  assert.equal(s.calls.some(c=>['/api/chat/stream','/api/widgets/plan'].includes(c.url)),false);
  assert.equal(s.d.querySelectorAll('.widgetCard iframe').length,1);assert.equal(s.d.querySelector('#widgetLibrary').open,true);
  const stored=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(stored.boards[0].cards[0].component,id);s.dom.window.close();
 }
});
test('configuration changes the selected card and title without changing another card',async()=>{
 const s=setup({storage:twoCards()});s.d.querySelector('[data-card="one"] [data-config]').click();await tick();
 assert.equal(s.d.querySelector('#widgetConfig').open,true);assert.equal(s.d.querySelector('#widgetSymbol').value,'NASDAQ:AAPL');
 s.d.querySelector('#widgetSymbol').value='NASDAQ:MSFT';s.d.querySelector('#widgetCardName').value='微软周线';s.d.querySelector('#widgetInterval').value='W';
 s.d.querySelector('#widgetAddForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await tick();
 const body=JSON.parse(s.calls.find(c=>c.url==='/api/widgets/tradingview').options.body);assert.deepEqual(body.symbols,['NASDAQ:MSFT']);assert.equal(body.interval,'W');
 const data=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(data.boards[0].cards[0].title,'微软周线');assert.equal(data.boards[0].cards[1].url,'/generated/two.html');
 assert.equal(s.d.querySelector('#widgetConfig').open,false);s.dom.window.close();
});
test('closing a tab retains its board and manager reopens it; deleting removes it',async()=>{
 const data=twoCards();data.boards.push({id:'other',title:'另一个',cards:[],messages:[]});const s=setup({storage:data});
 s.d.querySelector('[data-close-tab="board"]').click();let stored=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));
 assert.equal(stored.boards.length,2);assert.deepEqual(stored.openIds,['other']);assert.equal(stored.activeId,'other');
 s.d.querySelector('#widgetManageOpen').click();s.d.querySelector('[data-manage-open="board"]').click();
 assert.equal(s.d.querySelector('#widgetTabs [aria-selected=true]').textContent,'观察看板');
 s.d.querySelector('#widgetManageOpen').click();s.d.querySelector('[data-manage-delete="other"]').click();
 stored=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.equal(stored.boards.length,1);assert.equal(stored.boards[0].id,'board');s.dom.window.close();
});
test('active tab renames on click; tab drag order persists after reload',()=>{
 const data=twoCards();data.boards.push({id:'other',title:'另一个',cards:[],messages:[]});const s=setup({storage:data});
 s.d.querySelector('[data-board="board"]').click();assert.equal(s.d.querySelector('#widgetNameDialog').open,true);
 s.d.querySelector('#widgetNameInput').value='股票观察';s.d.querySelector('#widgetNameDialog').close('save');
 const start=new s.w.Event('dragstart',{bubbles:true});Object.defineProperty(start,'dataTransfer',{value:{setData(){}}});
 s.d.querySelector('[data-tab-id="board"]').dispatchEvent(start);s.d.querySelector('[data-tab-id="other"]').dispatchEvent(new s.w.Event('drop',{bubbles:true,cancelable:true}));
 const stored=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));assert.deepEqual(stored.openIds,['other','board']);assert.equal(stored.boards[0].title,'股票观察');s.dom.window.close();
 const next=setup({storage:stored});assert.equal(next.d.querySelector('.widgetTab').dataset.tabId,'other');next.dom.window.close();
});
test('all tabs may close without deleting content and a plus preset reopens a usable canvas',async()=>{
 const s=setup({storage:twoCards()});s.d.querySelector('[data-close-tab="board"]').click();assert.equal(s.d.querySelector('#widgetPrompt').disabled,true);assert.equal(s.d.querySelectorAll('.widgetCard').length,0);
 s.d.querySelector('#widgetSidebarLibrary').click();await tick();s.d.querySelector('[data-add-preset="tv-advanced-chart"]').click();await tick();
 assert.equal(s.d.querySelectorAll('.widgetCard').length,1);assert.equal(s.d.querySelector('#widgetPrompt').disabled,false);s.dom.window.close();
});
test('card actions expose only config and supplied trash icons; title-only edits keep iframe',async()=>{
 const s=setup({storage:twoCards()});const card=s.d.querySelector('[data-card="one"]'),frame=card.querySelector('iframe');
 assert.equal(card.querySelectorAll('.widgetCardActions button').length,2);assert.equal(card.querySelectorAll('.widgetCardActions svg').length,2);assert.equal(card.querySelector('.widgetCardActions').textContent,'');
 card.querySelector('[data-config]').click();await tick();s.d.querySelector('#widgetCardName').value='新标题';s.d.querySelector('#widgetAddForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await tick();
 assert.equal(s.d.querySelector('[data-card="one"] iframe'),frame);assert.equal(s.calls.some(c=>c.url==='/api/widgets/tradingview'),false);s.dom.window.close();
});


test('native financial configuration resolves a keyword to the native stock code',async()=>{
 const data=twoCards();data.boards[0].cards[0].component='cash_flow';data.boards[0].cards[0].parameters={symbols:['AAPL'],market:'default'};
 const s=setup({storage:data,symbolResults:[{name:'微软',code:'MSFT',symbol:'NASDAQ:MSFT',market:'us'}]});
 s.d.querySelector('[data-card="one"] [data-config]').click();await tick();
 assert.equal(s.d.querySelector('.widgetSymbolMarketField').hidden,true);
 s.d.querySelector('#widgetSymbol').value='微软';s.d.querySelector('#widgetAddForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await tick();await tick();
 const lookup=s.calls.find(c=>c.url.startsWith('/api/widgets/symbols?'));assert.match(lookup.url,/market=us/);
 const request=JSON.parse(s.calls.find(c=>c.url==='/api/chat/stream').options.body);assert.match(request.question,/用户完整需求：MSFT/);assert.doesNotMatch(request.question,/用户完整需求：NASDAQ:MSFT/);s.dom.window.close();
});
test('native kline visual settings patch the live iframe without regeneration',async()=>{
 const data=twoCards();Object.assign(data.boards[0].cards[0],{component:'kline',url:'/generated/kline.html',request:'分析 AAPL 日线趋势',parameters:{symbols:['AAPL'],market:'default',interval:'1d',ma:[5,10,20,60],subIndicators:['VOL','MACD']}});
 const parameters={symbols:['AAPL'],market:'default',interval:'1d',ma:[8,21,55],subIndicators:['VOL','RSI'],maColors:['#ef4444','#22c55e','#3b82f6'],maLineWidth:2.4,annotationStyles:[{text:'颈线',color:'#f97316',lineStyle:'dashed',lineWidth:3}],pineStyles:[{title:'EMA',kind:'plot',color:'#8b5cf6',width:2}]};
 const s=setup({storage:data,plan:{reply:'已更新图表样式。',actions:[{type:'update',cardId:'one',componentId:'kline',parameters}]}}),frame=s.d.querySelector('[data-card="one"] iframe'),messages=[];
 frame.contentWindow.postMessage=(message,origin)=>messages.push({message,origin});
 s.d.querySelector('[data-card="one"] .widgetCardHeader').click();submit(s.w,s.d,'把均线和现有颈线改下样式');await tick();await tick();
 assert.equal(s.calls.some(c=>c.url==='/api/chat/stream'),false);
 assert.equal(s.d.querySelector('[data-card="one"] iframe'),frame);
 assert(messages.some(item=>item.message.type==='mentora:kline-config'&&item.message.patch.maLineWidth===2.4));
 const card=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1')).boards[0].cards[0];
 assert.deepEqual(card.parameters.ma,[8,21,55]);assert.equal(card.url,'/generated/kline.html');s.dom.window.close();
});
test('new evidence-based drawing request reaches research even when drawingTools can update live',async()=>{
 const data=twoCards();Object.assign(data.boards[0].cards[0],{component:'kline',url:'/generated/kline.html',request:'分析 AAPL 日线趋势',parameters:{symbols:['AAPL'],interval:'1d',klineType:'line',ma:[5],drawingTools:false}});
 const s=setup({storage:data,plan:{reply:'正在识别双底并画线',actions:[{type:'update',cardId:'one',componentId:'kline',parameters:{symbols:['AAPL'],interval:'1d',klineType:'line',ma:[5],drawingTools:true},request:'基于原图行情识别双底，标记两个低点和颈线',requiresGeneration:true}]}});
 s.d.querySelector('[data-card="one"] .widgetCardHeader').click();submit(s.w,s.d,'画出双底');await tick();await tick();
 const call=s.calls.find(c=>c.url==='/api/chat/stream');assert.ok(call);
 const body=JSON.parse(call.options.body);assert.match(body.question,/双底/);assert.match(body.question,/klineType|line/);
 assert.equal(JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1')).boards[0].cards.filter(c=>c.id==='one').length,1);
 s.dom.window.close();
});
test('native kline exposes schema-driven parameters and persists them when regenerated',async()=>{
 const data=twoCards();Object.assign(data.boards[0].cards[0],{component:'kline',request:'分析 AAPL 日线趋势',parameters:{symbols:['AAPL'],market:'default',interval:'1d',ma:[5,10,20,60],subIndicators:['VOL','MACD']}});
 const settingsSchema={version:1,renderer:'business-chart-recall/kline.py',fields:[
  {key:'interval',label:'周期',type:'select',default:'1d',options:[['1d','1d'],['1w','1w']]},
  {key:'ma',label:'均线周期',type:'integer-list',default:[5,10,20,60],min:1,max:1000},
  {key:'subIndicators',label:'副图指标',type:'multi-select',default:['VOL','MACD'],options:[['VOL','VOL'],['MACD','MACD'],['RSI','RSI']]},
  {key:'fromDate',label:'开始日期',type:'date'},
  {key:'drawingTools',label:'显示画线标记工具',type:'boolean',default:true},
 ]};
 const generationCatalog=catalog.map(item=>item.id==='kline'?{...item,settingsSchema}:item);
 const s=setup({storage:data,generationCatalog,symbolResults:[{name:'苹果',code:'AAPL',symbol:'NASDAQ:AAPL',market:'us'}]});
 s.d.querySelector('[data-card="one"] [data-config]').click();await tick();await tick();
 assert.equal(s.d.querySelector('[data-setting-key="ma"]').value,'5,10,20,60');
 assert.equal(s.d.querySelector('[data-setting-key="interval"]').value,'1d');
 s.d.querySelector('[data-setting-key="ma"]').value='5,13,34';
 s.d.querySelector('[data-setting-key="interval"]').value='1w';
 s.d.querySelector('[data-setting-key="fromDate"]').value='2025-01-01';
 s.d.querySelector('[data-setting-key="drawingTools"]').checked=false;
 s.d.querySelector('#widgetAddForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));await tick();await tick();
 const request=JSON.parse(s.calls.find(c=>c.url==='/api/chat/stream').options.body);
 assert.match(request.question,/\"ma\":\[5,13,34\]/);assert.match(request.question,/\"fromDate\":\"2025-01-01\"/);
 const card=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1')).boards[0].cards[0];
 assert.deepEqual(card.parameters.ma,[5,13,34]);assert.equal(card.parameters.interval,'1w');assert.equal(card.parameters.drawingTools,false);
 s.dom.window.close();
});
