import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const bridge=readFileSync(new URL('../app/skills/business-chart-recall/assets/kline-pine-bridge.js',import.meta.url),'utf8');
const adapter=readFileSync(new URL('../app/static/kline-pine.js',import.meta.url),'utf8');
const tick=(ms=25)=>new Promise(resolve=>setTimeout(resolve,ms));
const sourceCode='//@version=5\nindicator("Existing Pine", overlay=true)\nplot(ta.sma(close, 5))';
function setup(path='/mentora/share-artifact/test.html',overlays=[{period:'1d',sourceCode}]){
 const dom=new JSDOM('<div class="kline-component"><div class="kline-title">Test</div><div class="chart-host"></div></div>',{url:'https://example.com'+path,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 w.eval(`const root=document.querySelector('.kline-component');const config={code:'TEST'};let activePeriod='1d',activeIndex=-1;const dataByPeriod={'1d':[{time:1000,open:10,high:12,low:9,close:11,volume:10},{time:2000,open:11,high:13,low:10,close:12,volume:20}],'1w':[{time:3000,open:10,high:13,low:9,close:12,volume:30},{time:4000,open:12,high:14,low:11,close:13,volume:40}]};function bars(){return dataByPeriod[activePeriod];}const strokes=[];let range=[];const ctx=new Proxy({strokeStyle:'',stroke(){strokes.push(this.strokeStyle);}},{get:(target,key)=>key in target?target[key]:()=>{}});function fmtPrice(n){return String(n);}function draw(){range=pineRange(0,1);drawPineLayer({main:{x:0,y:0,w:100,h:100},slice:{start:0,end:1},xOf:i=>i*50,priceScale:{y:v=>100-v}});}window.changePeriod=()=>{activePeriod='1w';draw();};window.inspect=()=>({range,strokes});${bridge}\nwindow.setEmbedded=outputs=>{config.pineOverlays=outputs;draw();};window.replaceBars=()=>{dataByPeriod[activePeriod]=dataByPeriod[activePeriod].map(row=>({...row,close:row.close+0.1}));draw();};draw();`);
 const root=w.document.querySelector('.kline-component');
 const configScript=w.document.createElement('script');configScript.type='text/plain';configScript.textContent='const config = '+JSON.stringify({code:'TEST',pineOverlays:overlays})+';';w.document.body.append(configScript);
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
test('minimal editor evaluates current bars and re-evaluates period changes',async()=>{
 const s=setup(),calls=[];try{
  s.w.fetch=async(url,opts)=>{calls.push([url,opts]);const payload=JSON.parse(opts.body);return {ok:true,text:async()=>JSON.stringify({period:payload.period,timestamps:payload.rows.map(r=>r.time),plots:[{title:'MA',values:[11,12],color:'#123456'}],hlines:[],barCount:2})};};
  s.w.eval(adapter);s.w.eval(adapter);assert.equal(s.root.querySelectorAll('.kline-pine').length,1);
  assert.equal(s.root.querySelector('[data-code]').value,sourceCode);
  assert.equal(s.root.querySelectorAll('.kline-pine button').length,1);
  assert.equal(s.root.querySelector('[data-code-state],.kline-pine-bar,[data-action=copy],[data-action=clear]'),null);
  assert.equal(s.root.querySelector('[data-status]').hidden,true);
  s.root.querySelector('[data-action=run]').click();await tick();
  assert.equal(calls[0][0],'https://example.com/mentora/api/portfolio/pine/plot'.replace('https://example.com',''));
  assert.equal(JSON.parse(calls[0][1].body).rows[0].close,11);
  assert.equal(calls[0][1].headers['X-Veya-Portfolio'],'1');assert.equal(s.root.dataset.pineSeries,'1');
  s.w.changePeriod();await tick(300);assert.equal(JSON.parse(calls.at(-1)[1].body).period,'1w');
  assert.equal(s.root.querySelector('[data-status]').hidden,true);
  assert.ok(calls.every(([url])=>url.endsWith('/pine/plot')));
 }finally{s.close();}
});
test('period switch during first calculation cancels stale result and retries new bars',async()=>{
 const s=setup(),calls=[];try{
  s.w.fetch=async(url,opts)=>{calls.push(JSON.parse(opts.body));if(calls.length===1)return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(new s.w.DOMException('abort','AbortError'))));const p=calls.at(-1);return{ok:true,text:async()=>JSON.stringify({period:p.period,timestamps:p.rows.map(r=>r.time),plots:[],hlines:[{price:10}],barCount:2})};};
  s.w.eval(adapter);s.root.querySelector('[data-action=run]').click();s.w.changePeriod();await tick(300);
  assert.equal(calls.length,2);assert.equal(calls[1].period,'1w');assert.equal(s.root.dataset.pineSeries,'1');
 }finally{s.close();}
});
test('code icon switches views, highlights editable source safely and retains errors',async()=>{
 const s=setup();try{
  s.w.eval(adapter);const toggle=s.root.querySelector('.kline-code-toggle'),editor=s.root.querySelector('[data-code]'),panel=s.root.querySelector('.kline-pine');
  assert.equal(panel.hidden,true);assert.equal(s.root.querySelector('summary'),null);toggle.click();assert.equal(panel.hidden,false);assert.equal(s.root.dataset.pineView,'code');
  editor.value='//@version=5\nindicator("<img src=x>", overlay=true)\nplot(ta.ema(close, 5))';editor.dispatchEvent(new s.w.Event('input'));
  assert(s.root.querySelector('.pine-token-function'));assert.equal(panel.querySelector('img'),null);
  toggle.click();toggle.click();assert.match(editor.value,/ta.ema/);
  s.w.fetch=async()=>({ok:false,text:async()=>'<html>Error</html>'});s.root.querySelector('[data-action=run]').click();await tick();
  assert.equal(panel.hidden,false);assert.match(panel.textContent,/返回格式异常/);assert.equal(s.root.querySelector('[data-action=run]').disabled,false);
  assert.equal(panel.querySelector('[data-status]').hidden,false);
 }finally{s.close();}
});
test('ordinary charts and receipts without real Pine source have no editor or code icon',()=>{
 for(const overlays of [[],[{period:'1d',codeHash:'a'.repeat(64)}],[{sourceCode:'  \n'}]]){
  const s=setup('/mentora/share-artifact/plain.html',overlays);try{
   s.w.eval(adapter);assert.equal(s.root.querySelector('.kline-code-toggle,.kline-pine'),null);
   assert.equal(s.root.dataset.pineUi,undefined);assert.equal(s.w.document.querySelector('[data-kline-pine-style]'),null);
  }finally{s.close();}
 }
});
test('static inspiration cases use the host API rather than a nested static path',async()=>{
 const s=setup('/mentora/static/cases/inspiration/kline/case.html');try{
  let called='';s.w.fetch=async url=>{called=url;return{ok:false,json:async()=>({detail:'fixture'})};};
  s.w.eval(adapter);s.root.querySelector('[data-action=run]').click();await tick();
  assert.equal(called,'/mentora/api/portfolio/pine/plot');
 }finally{s.close();}
});
test('precomputed Skill outputs render offline, clear, and hide on live data replacement',()=>{
 const s=setup();try{
  s.w.setEmbedded([{period:'1d',plots:[{title:'Skill MA',values:[null,12],color:'#123456',style:'line'}],hlines:[]}]);
  assert.equal(s.root.dataset.pineSeries,'1');assert.match(s.root.querySelector('.kline-pine-legend').textContent,/Skill MA 12/);
  s.w.replaceBars();
  assert.equal(s.root.dataset.pineSeries,'0');
  s.root.klinePine.clear();assert.equal(s.root.dataset.pineSeries,'0');
 }finally{s.close();}
});
