import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/kline-data-bridge.js',import.meta.url),'utf8');
const row=day=>({time:`2026-01-${String(day).padStart(2,'0')}`,open:10,high:14,low:9,close:12,volume:100});
const tick=()=>new Promise(setImmediate);
function setup(extra={}){
 const dom=new JSDOM('<main><canvas></canvas></main>',{url:'https://example.com/mentora/share-artifact/test.html'}),w=dom.window;
 const calls=[],replies=[],microtasks=[];
 const c={document:w.document,location:w.location,URLSearchParams,AbortController,setTimeout,clearTimeout,queueMicrotask:fn=>microtasks.push(fn),
  config:{code:'AAPL',language:'zh',sources:{},...extra},root:w.document.querySelector('main'),canvas:w.document.querySelector('canvas'),
  dataByPeriod:{'1d':[row(10),row(11),row(12)]},lazyPagesByPeriod:{},activePeriod:'1d',activeIndex:-1,viewEnd:null,visibleCount:null,
  normTime:v=>typeof v==='number'?v:Date.parse(v),getLayout:()=>({}),
  fetch:(url)=>{calls.push(url);return new Promise((resolve,reject)=>replies.push({resolve,reject}));},
  bars:()=>c.dataByPeriod[c.activePeriod]||[],embeddedMaybeLoadPreviousPage:()=>false,
  embeddedVisibleSlice:(list)=>{if(c.viewEnd===null)c.viewEnd=list.length-1;if(c.visibleCount===null)c.visibleCount=3;return {start:Math.max(0,c.viewEnd-c.visibleCount+1),end:c.viewEnd};},
  embeddedSwitchPeriod:period=>{c.activePeriod=period;c.viewEnd=null;c.visibleCount=null;c.draw();},
  draw:()=>{if(c.bars().length)c.visibleSlice(c.bars(),{});}
 };
 vm.createContext(c);vm.runInContext(source,c);
 const respond=async(index,period,rows,hasMore=true)=>{replies[index].resolve({ok:true,json:async()=>({period,rows,source:'ainvest',hasMore})});await tick();};
 return {c,calls,replies,microtasks,respond};
}
test('missing period fetches once; quick tab switches cannot paint a stale response',async()=>{
 const {c,calls,respond}=setup();c.switchPeriod('1w');c.switchPeriod('1w');assert.equal(calls.length,1);
 assert.match(calls[0],/^\/mentora\/api\/kline\/history\?/);
 c.switchPeriod('1h');assert.equal(calls.length,2);
 await respond(0,'1w',[row(1),row(2)]);assert.equal(c.activePeriod,'1h');assert.equal(c.root.dataset.klinePeriod,'1h');
 await respond(1,'1h',[row(3),row(4)]);assert.equal(c.root.dataset.klineBars,'2');
 c.switchPeriod('1w');assert.equal(calls.length,2);assert.equal(c.root.dataset.klineBars,'2');
});
test('failure exposes retry, preserves saved data, and retry can recover',async()=>{
 const {c,replies,calls,respond}=setup();c.switchPeriod('1w');replies[0].reject(new Error('offline'));await tick();
 assert.equal(c.root.dataset.klineStatus,'error');assert.equal(c.dataByPeriod['1d'].length,3);
 c.root.querySelector('button').click();assert.equal(calls.length,2);await respond(1,'1w',[row(1)]);
 assert.equal(c.root.dataset.klineStatus,'ready');
});
test('sector tabs fetch their exact period and market with a centered loading state',async()=>{
 const {c,calls,respond}=setup({code:'861077',market:'89'});
 for(const [index,period] of ['1m','1w','1M','1h','2h','4h'].entries()){
  c.switchPeriod(period);
  const url=new URL(calls[index],'https://example.com');
  assert.equal(url.searchParams.get('market'),'89');assert.equal(url.searchParams.get('symbol'),'861077');assert.equal(url.searchParams.get('period'),period);
  assert.equal(c.activePeriod,period);assert.equal(c.root.getAttribute('aria-busy'),'true');
  assert.equal(c.canvas.style.visibility,'hidden');
  const status=c.root.querySelector('.kline-data-state');
  assert.equal(status.parentElement,c.canvas.parentElement);assert.equal(status.style.position,'absolute');
  assert(status.querySelector('.kline-history-spinner'));assert.equal(status.textContent,'');
  await respond(index,period,[row(index+1),row(index+2)]);
  assert.equal(c.root.dataset.klineStatus,'ready');assert.equal(c.canvas.style.visibility,'');assert.equal(c.root.getAttribute('aria-busy'),'false');
 }
 c.switchPeriod('1w');assert.equal(calls.length,6);
});
test('date range changes initial view without filtering history or limiting merges',()=>{
 const {c}=setup({fromDate:'2026-01-10',toDate:'2026-01-11'});
 c.draw();assert.equal(c.visibleCount,2);assert.equal(c.viewEnd,1);assert.equal(c.dataByPeriod['1d'].length,3);
 c.mergeHistory('1d',[row(8),row(9),row(12)]);
 assert.equal(c.dataByPeriod['1d'].length,5);assert.equal(c.viewEnd,3);assert.equal(c.visibleCount,2);
});
test('history paging merges duplicates and keeps the same visible right candle',async()=>{
 const {c,respond,calls}=setup();c.draw();c.viewEnd=1;c.visibleCount=2;
 const request=c.requestHistory('1d',Date.parse(row(10).time),'before');
 await respond(0,'1d',[row(8),row(9),row(10)]);await request;
 assert.equal(c.dataByPeriod['1d'].length,5);assert.equal(c.dataByPeriod['1d'][c.viewEnd].time,row(11).time);
 assert.equal(c.visibleCount,2);assert.match(calls[0],/cursor=/);
});
