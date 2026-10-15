import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../app/static/widgets.js',import.meta.url),'utf8');
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
 w.eval(source);return {dom,w,d:w.document,calls};
}
function submit(w,d,text){d.querySelector('#widgetPrompt').value=text;d.querySelector('#widgetForm').dispatchEvent(new w.Event('submit',{cancelable:true}));}
test('catalogue refers only to existing native business components',()=>{assert.ok(!catalog.some(c=>['kline','multi_intraday'].includes(c.id)));const widgets=JSON.parse(readFileSync(new URL('../app/skills/trading-view-chart/widgets.json',import.meta.url),'utf8'));assert.equal(catalog.filter(c=>c.provider==='TradingView').length,Object.keys(widgets).length);for(const c of catalog){if(c.provider==='TradingView')assert.ok(widgets[c.widget]);else assert.ok(readFileSync(new URL(`../app/skills/business-chart-recall/scripts/${c.id}.py`,import.meta.url),'utf8').length);assert.ok(c.category);}});
test('generation uses the real research stream, persists separate charts and keyboard resize avoids overlap',async()=>{
 const{dom,w,d,calls}=setup();assert.equal(d.querySelector('#widgetWorkspace').hidden,false);assert.ok(d.querySelector('.shell').classList.contains('widgets-view'));assert.equal(d.querySelector('#widgetSidebar').hidden,false);assert.ok(d.querySelector('#widgetSidebar #widgetTabs'));assert.equal(d.querySelector('#widgetBoardTitle').textContent,'我的看板');
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
 const original=s.d.querySelector('[data-card="two"] iframe');s.d.querySelector('[data-card="one"] .widgetCardHeader').click();s.d.querySelector('#widgetScope').click();assert.equal(s.d.querySelector('#widgetScope').textContent,'整个看板');
 submit(s.w,s.d,'上下排列');await tick();await tick();assert.equal(s.d.querySelector('[data-card="two"] iframe'),original);
 assert.equal(s.calls.some(c=>c.url==='/api/widgets/tradingview'||c.url==='/api/chat/stream'),false);s.dom.window.close();
});
test('library has no search or hosting notice and no field for parameter-free components',async()=>{
 const s=setup();s.d.querySelector('#widgetSidebarLibrary').click();await tick();assert.equal(s.d.querySelector('#widgetLibrary h2').textContent,'图表库');assert.equal(s.d.querySelector('#widgetSearch'),null);assert.equal(s.d.querySelector('#widgetLibraryNote'),null);
 s.d.querySelector('[data-component="tv-crypto-heatmap"]').click();assert.equal(s.d.querySelector('#widgetParameterField').hidden,true);s.d.querySelector('[data-component="tv-screener"]').click();assert.equal(s.d.querySelector('#widgetParameterField').hidden,false);assert.equal(s.d.querySelector('#widgetMarket').hidden,false);s.dom.window.close();
});
