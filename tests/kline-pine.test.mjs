import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const bridge=readFileSync(new URL('../app/skills/business-chart-recall/assets/kline-pine-bridge.js',import.meta.url),'utf8');
const adapter=readFileSync(new URL('../app/static/kline-pine.js',import.meta.url),'utf8');
const tick=(ms=25)=>new Promise(resolve=>setTimeout(resolve,ms));
function setup(){
 const dom=new JSDOM('<div class="kline-component"><div class="kline-title">Test</div><div class="chart-host"></div></div>',{url:'https://example.com/mentora/share-artifact/test.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 w.eval(`const root=document.querySelector('.kline-component');const config={code:'TEST'};let activePeriod='1d',activeIndex=-1;const dataByPeriod={'1d':[{time:1000,open:10,high:12,low:9,close:11,volume:10},{time:2000,open:11,high:13,low:10,close:12,volume:20}],'1w':[{time:3000,open:10,high:13,low:9,close:12,volume:30},{time:4000,open:12,high:14,low:11,close:13,volume:40}]};function bars(){return dataByPeriod[activePeriod];}const strokes=[];let range=[];const ctx=new Proxy({strokeStyle:'',stroke(){strokes.push(this.strokeStyle);}},{get:(target,key)=>key in target?target[key]:()=>{}});function fmtPrice(n){return String(n);}function draw(){range=pineRange(0,1);drawPineLayer({main:{x:0,y:0,w:100,h:100},slice:{start:0,end:1},xOf:i=>i*50,priceScale:{y:v=>100-v}});}window.changePeriod=()=>{activePeriod='1w';draw();};window.inspect=()=>({range,strokes});${bridge}\ndraw();`);
 const root=w.document.querySelector('.kline-component');
 return {dom,w,root,close:()=>w.close()};
}
test('bridge aligns exact timestamps, preserves NA and native annotations, rejects stale periods',()=>{
 const s=setup();try{
  const snapshot=s.root.klinePine.snapshot();
  const result={period:'1d',timestamps:[1000,2000],plots:[{title:'MA',values:[null,12],color:'#123456'}],hlines:[{title:'Support',price:8,color:'#abcdef'}]};
  assert.equal(s.root.klinePine.apply(result,snapshot.key),true);
  assert.deepEqual(Array.from(s.w.inspect().range),[12,8]);
  assert.match(s.root.querySelector('.kline-pine-legend').textContent,/MA 12.*Support 8/);
  assert.ok(s.w.inspect().strokes.includes('#abcdef'));
  assert.equal(s.root.klinePine.apply({...result,timestamps:[2000,1000]},snapshot.key),false);
  s.w.changePeriod();assert.equal(s.root.dataset.pineSeries,'0');
  assert.equal(s.root.klinePine.apply(result,snapshot.key),false);
  s.root.klinePine.clear();assert.equal(s.root.dataset.pineSeries,'0');
 }finally{s.close();}
});
test('UI evaluates current bars, re-evaluates period changes, clears only overlays and copies code',async()=>{
 const s=setup(),calls=[];try{
  let clipboard='';Object.defineProperty(s.w.navigator,'clipboard',{value:{writeText:async value=>{clipboard=value;}}});
  s.w.fetch=async(url,opts)=>{calls.push([url,opts]);const payload=JSON.parse(opts.body);return {ok:true,json:async()=>({period:payload.period,timestamps:payload.rows.map(r=>r.time),plots:[{title:'MA',values:[11,12],color:'#123456'}],hlines:[],barCount:2})};};
  s.w.eval(adapter);s.w.eval(adapter);assert.equal(s.root.querySelectorAll('.kline-pine').length,1);
  s.root.querySelector('[data-action=run]').click();await tick();
  assert.equal(calls[0][0],'https://example.com/mentora/api/portfolio/pine/plot'.replace('https://example.com',''));
  assert.equal(JSON.parse(calls[0][1].body).rows[0].close,11);
  assert.equal(calls[0][1].headers['X-Veya-Portfolio'],'1');assert.equal(s.root.dataset.pineSeries,'1');
  s.w.changePeriod();await tick(300);assert.equal(JSON.parse(calls.at(-1)[1].body).period,'1w');
  s.root.querySelector('[data-action=copy]').click();await tick();assert.match(clipboard,/\/\/@version=5/);assert.match(s.root.textContent,/复制成功/);
  s.root.querySelector('[data-action=clear]').click();assert.equal(s.root.dataset.pineSeries,'0');
  assert.ok(calls.every(([url])=>url.endsWith('/pine/plot')));
 }finally{s.close();}
});
test('period switch during first calculation cancels stale result and retries new bars',async()=>{
 const s=setup(),calls=[];try{
  s.w.fetch=async(url,opts)=>{calls.push(JSON.parse(opts.body));if(calls.length===1)return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(new s.w.DOMException('abort','AbortError'))));const p=calls.at(-1);return{ok:true,json:async()=>({period:p.period,timestamps:p.rows.map(r=>r.time),plots:[],hlines:[{price:10}],barCount:2})};};
  s.w.eval(adapter);s.root.querySelector('[data-action=run]').click();s.w.changePeriod();await tick(300);
  assert.equal(calls.length,2);assert.equal(calls[1].period,'1w');assert.equal(s.root.dataset.pineSeries,'1');
 }finally{s.close();}
});
test('generation streams real deltas and does not run incomplete code or save settings',async()=>{
 const s=setup(),calls=[];try{
  let controller;s.w.TextDecoder=TextDecoder;
  s.w.fetch=async(url,opts)=>{calls.push(url);return{ok:true,body:new ReadableStream({start(c){controller=c;}})};};
  s.w.eval(adapter);s.root.querySelector('[data-description]').value='画均线';s.root.querySelector('[data-action=generate]').click();await tick();
  controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({type:'delta',text:'//@version=5\n'})+'\n\n'));await tick();
  assert.equal(s.root.querySelector('[data-code]').value,'//@version=5\n');assert.equal(calls.length,1);
  controller.close();await tick();assert.match(s.root.querySelector('[data-code]').value,/我的画线/);assert.match(s.root.textContent,/未完整生成/);
 }finally{s.close();}
});
