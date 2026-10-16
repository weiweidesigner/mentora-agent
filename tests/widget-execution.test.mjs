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
test('all restores the original individual symbols and survives reload',async()=>{
 const chart=(id,symbol)=>({id,title:id,component:'tv-advanced-chart',status:'ready',url:'/generated/'+id+'.html',parameters:{symbols:[symbol]},request:symbol,x:0,y:id==='a'?20:40,w:6,h:18});
 const list={id:'list',title:'列表',component:'tv-market-data',status:'ready',url:'/generated/list.html',parameters:{symbols:['NASDAQ:AAPL','NASDAQ:MSFT','NASDAQ:NVDA']},x:0,y:0,w:12,h:18};
 const s=setup([list,chart('a','NASDAQ:AAPL'),chart('b','NASDAQ:MSFT')]);
 assert.equal(s.d.querySelector('[data-link-all]').getAttribute('aria-pressed'),'true');
 s.d.querySelector('[data-link-symbol="NASDAQ:NVDA"]').click();await tick();await tick();
 assert.deepEqual(s.board().cards.slice(1).map(c=>c.parameters.symbols[0]),['NASDAQ:NVDA','NASDAQ:NVDA']);
 const stored=s.board();s.dom.window.close();const reload=setup(stored.cards);reload.d.querySelector('[data-link-all]').click();await tick();
 assert.deepEqual(reload.board().cards.slice(1).map(c=>c.parameters.symbols[0]),['NASDAQ:AAPL','NASDAQ:MSFT']);
 assert.equal(reload.board().cards[1].url,'/generated/a.html');reload.dom.window.close();
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
