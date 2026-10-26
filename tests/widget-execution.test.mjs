import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const code=readFileSync(new URL('../app/static/widgets.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../app/static/widget-catalog.json',import.meta.url),'utf8'));
const tick=()=>new Promise(r=>setTimeout(r,20));
function setup(cards=[],plan={reply:'已完成',actions:[{type:'rename_board',title:'新看板'}]}){
 const dom=new JSDOM(html,{url:'https://example.com/?tab=widgets',runScripts:'outside-only'}),w=dom.window;
 w.ResizeObserver=class{observe(){}};w.CSS={escape:x=>x};
 w.localStorage.setItem('mentora-widget-boards-v1',JSON.stringify({defaultsVersion:1,activeId:'b',boards:[{id:'b',title:'原看板',cards}]}));
 w.fetch=async(url,options)=>({ok:true,json:async()=>url.includes('catalog')?catalog:url==='/api/widgets/plan'?(typeof plan==='function'?await plan(options):plan):{url:'/generated/new.html',title:'新图表'}});
 w.eval(code);return{dom,w,d:w.document,board:()=>JSON.parse(w.localStorage.getItem('mentora-widget-boards-v1')).boards[0]};
}
function submit(s){s.d.querySelector('#widgetPrompt').value='创建看板';s.d.querySelector('#widgetForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));}
test('execution exposes animated progress and completion can be confirmed or undone',async()=>{
 let finish;const pending=new Promise(r=>finish=r);const s=setup([],()=>pending);submit(s);await tick();
 assert.equal(s.d.querySelector('#widgetStop').hidden,false);assert(s.d.querySelector('#widgetStop .widgetExecutionRing'));
 assert(s.d.querySelector('#widgetStatus').classList.contains('is-thinking'));
 finish({reply:'已完成',actions:[{type:'rename_board',title:'新看板'}]});await tick();await tick();
 assert.equal(s.board().title,'新看板');assert.equal(s.d.querySelector('#widgetConfirm').hidden,false);
 assert.equal(s.d.querySelector('#widgetStop').hidden,true);assert(!s.d.querySelector('#widgetStatus').classList.contains('is-thinking'));
 s.d.querySelector('#widgetConfirm').click();assert.equal(s.d.querySelector('#widgetConfirm').hidden,true);assert.equal(s.d.querySelector('#widgetUndo').hidden,true);assert.equal(s.d.querySelector('#widgetStatus').hidden,true);assert.equal(s.board().title,'新看板');s.dom.window.close();
 const undo=setup();submit(undo);await tick();undo.d.querySelector('#widgetUndo').click();assert.equal(undo.board().title,'原看板');undo.dom.window.close();
});
test('selected card reuses its scope chip as the only visible thinking message',async()=>{
 let finish;const pending=new Promise(r=>finish=r),card={id:'one',title:'上证指数日线',component:'kline',status:'ready',url:'/generated/one.html',parameters:{symbols:['000001.SH']},x:0,y:0,w:12,h:22};
 const s=setup([card],()=>pending);s.d.querySelector('[data-card="one"] .widgetCardHeader').click();submit(s);await tick();
 assert.equal(s.d.querySelector('#widgetStatus').hidden,true);
 assert(s.d.querySelector('#widgetScope').classList.contains('is-thinking'));
 assert.match(s.d.querySelector('#widgetScope').textContent,/正在理解你的看板需求/);
 finish({reply:'请补充线条颜色。',actions:[]});await tick();await tick();
 assert(!s.d.querySelector('#widgetScope').classList.contains('is-thinking'));
 assert.match(s.d.querySelector('#widgetScope').textContent,/上证指数日线/);
 assert.equal(s.d.querySelector('#widgetStatus').textContent,'请补充线条颜色。');s.dom.window.close();
});
test('quote lists do not render symbol tabs or change other components',()=>{
 const list={id:'list',title:'列表',component:'tv-market-data',status:'ready',url:'/generated/list.html',parameters:{symbols:['NASDAQ:AAPL','NASDAQ:MSFT']},x:0,y:0,w:12,h:18};
 const s=setup([list]);assert.equal(s.d.querySelector('[data-link-symbol], [data-link-all], .widgetSymbolLinks'),null);assert(s.d.querySelector('[data-card="list"] iframe'));s.dom.window.close();
});
test('quote table height grows with actual symbol rows and grouped headings',()=>{
 const runtime=readFileSync(new URL('../app/static/tradingview-surface.js',import.meta.url),'utf8');
 for(const [groups,expected] of [[[{symbols:[{},{},{}]}],194],[[{symbols:[{},{}]},{symbols:[{},{}]}],294]]){
  const dom=new JSDOM('<iframe></iframe>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,frame=w.document.querySelector('iframe'),doc=frame.contentDocument;
  doc.body.innerHTML='<main><div class="stage"><div id="mount"></div></div></main><script id="tv-config" type="application/json">'+JSON.stringify({widget:'market-data',config:{symbolsGroups:groups}})+'</script>';
  w.eval(runtime);w.installTradingViewSurface(frame);
  assert.equal(doc.querySelector('.stage').style.getPropertyValue('--tv-content-height'),expected+'px');
  assert.equal(doc.documentElement.dataset.tvSized,'true');frame.tradingViewSurfaceCleanup();dom.window.close();
 }
});
test('new board opens an empty canvas immediately and gets a generated title from its request',async()=>{
 let requested;
 const s=setup([],options=>{requested=JSON.parse(options.body);return {reply:'已创建',actions:[{type:'rename_board',title:'科技股趋势对比看板'}]};});
 s.d.querySelector('#widgetNameDialog').showModal=()=>{throw Error('new board must not open naming dialog');};
 s.d.querySelector('#widgetNew').click();
 let saved=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));
 const id=saved.activeId;
 assert.equal(saved.boards.find(b=>b.id===id).title,'自定义');
 assert.equal(saved.boards.find(b=>b.id===id).cards.length,0);
 assert.equal(s.d.activeElement.id,'widgetPrompt');
 submit(s);await tick();await tick();
 assert.equal(requested.board.title,'自定义');
 saved=JSON.parse(s.w.localStorage.getItem('mentora-widget-boards-v1'));
 assert.equal(saved.boards.find(b=>b.id===id).title,'科技股趋势对比看板');
 assert.equal(saved.boards.find(b=>b.id==='b').title,'原看板');s.dom.window.close();
});
test('successful card edits clear selection and report the concrete change',async()=>{
 const card={id:'one',title:'苹果技术分析',component:'tv-technical-analysis',status:'ready',url:'/generated/one.html',parameters:{symbols:['NASDAQ:AAPL']},x:0,y:0,w:6,h:18};
 const s=setup([card]);s.d.querySelector('[data-card="one"] .widgetCardHeader').click();
 assert.equal(s.d.querySelector('#widgetScope').hidden,false);
 s.d.querySelector('#widgetPrompt').value='卡片矮一点';s.d.querySelector('#widgetForm').dispatchEvent(new s.w.Event('submit',{cancelable:true}));
 assert.equal(s.d.querySelector('#widgetScope').hidden,true);
 assert.equal(s.d.querySelector('.widgetCard.is-selected'),null);
 assert(s.d.querySelector('#widgetPrompt').placeholder);
 assert.match(s.d.querySelector('#widgetStatus').textContent,/苹果技术分析.*高度缩小约 72 像素/);
 s.d.querySelector('#widgetUndo').click();assert.equal(s.board().cards[0].h,18);s.dom.window.close();
 const api=setup([card],{reply:'已调整布局。',actions:[{type:'update',cardId:'one',layout:{w:12}}]});
 api.d.querySelector('[data-card="one"] .widgetCardHeader').click();submit(api);await tick();await tick();
 assert.equal(api.d.querySelector('#widgetScope').hidden,true);
 assert.match(api.d.querySelector('#widgetStatus').textContent,/苹果技术分析.*整行宽度/);api.dom.window.close();
});
test('clarification keeps the selected scope and shows the model question',async()=>{
 const s=setup([{id:'one',title:'苹果技术分析',component:'tv-technical-analysis',status:'ready',url:'/generated/one.html',x:0,y:0,w:6,h:18}],{reply:'想改为哪个周期？',actions:[]});
 s.d.querySelector('[data-card="one"] .widgetCardHeader').click();submit(s);await tick();await tick();
 assert.equal(s.d.querySelector('#widgetScope').hidden,false);assert.equal(s.d.querySelector('#widgetStatus').textContent,'想改为哪个周期？');s.dom.window.close();
});
