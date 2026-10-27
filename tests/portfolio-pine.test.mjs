import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/portfolio.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,20));
const code='//@version=5\nstrategy("Test")\nstrategy.entry("L", strategy.long)';
const old='def signal(context):\n    return "hold"';
async function setup(){
 const dom=new JSDOM('<main class="shell"><button id="railHome"></button><section id="taskWorkspace"></section><section id="widgetWorkspace"></section></main>',{url:'https://example.com/?tab=portfolio',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],state={enabled:['trend','custom:one'],customStrategies:[{id:'custom:one',name:'Original',description:'买入突破',code:old}]};
 const workflow={strategies:structuredClone(state),tasks:[],decisions:[],preferences:{}};
 const account={initial:1000,cash:1000,equity:1000,marketValue:0,positions:[],trades:[],plans:[],history:[],settings:{},valuationComplete:true,scan:{}};
 w.TextDecoder=TextDecoder;w.confirm=()=>true;w.setInterval=()=>1;w.clearInterval=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let controller;
 w.fetch=async(url,opts)=>{
  calls.push([url,opts]);
  if(url.endsWith('/strategies/generate'))return {ok:true,body:new ReadableStream({start(c){controller=c;opts.signal.addEventListener('abort',()=>c.error(new DOMException('aborted','AbortError')));}})};
  if(url.endsWith('/strategies')&&opts?.method==='PUT'){Object.assign(state,JSON.parse(opts.body));return {ok:true,json:async()=>structuredClone(state)};}
  return {ok:true,json:async()=>url.endsWith('/workflow')?workflow:url.endsWith('/opportunities')?{items:[]}:account};
 };
 w.eval(source);await tick();const d=w.document;d.querySelector('[data-pf-view=strategies]').click();
 return {dom,w,d,calls,state,send:event=>controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n')),close:()=>controller.close()};
}
test('initial layout displays saved code and keeps delete beside add',async()=>{
 const s=await setup();try{
  assert.ok(s.d.querySelector('[name=customCode]'));
  assert.equal(s.d.querySelector('[data-pf-strategy=show-code]'),null);
  assert.equal(s.d.querySelector('[data-pf-strategy=add]').nextElementSibling.dataset.pfStrategy,'remove');
  assert.equal(s.d.querySelector('[name=customCode]').value,old);
  assert.equal(s.d.querySelector('[data-pf-strategy=generate]').textContent,'重新生成');
  assert.equal(s.d.querySelector('[name=strategyDescription]').placeholder,'描述你的策略逻辑，比如“目前处于筑底，有望回升”');
  assert.doesNotMatch(s.d.querySelector('#pfStrategyForm').textContent,/保存配置|保存方案|用自然语言描述策略/);
 }finally{s.w.close();}
});
test('real deltas stream into visible editor; completion confirms auto-save and regenerate',async()=>{
 const s=await setup();try{
  s.d.querySelector('[data-pf-strategy=generate]').click();await tick();
  assert.ok(s.d.querySelector('[name=customCode]'));
  const payload=JSON.parse(s.calls.find(([u])=>u.endsWith('/generate'))[1].body);
  assert.equal(payload.id,'custom:one');assert.equal(payload.name,'Original');
  s.send({type:'delta',text:code.slice(0,20)});await tick();
  assert.equal(s.d.querySelector('[name=customCode]').value,code.slice(0,20));
  assert.equal(s.state.customStrategies[0].code,old);
  const settings={...s.state,customStrategies:[{...s.state.customStrategies[0],code}]};
  s.send({type:'delta',text:code.slice(20)});s.send({type:'complete',code,settings});s.close();await tick();
  assert.equal(s.d.querySelector('[name=customCode]').value,code);
  assert.equal(s.d.querySelector('[data-pf-strategy=generate]').textContent,'重新生成');
  assert.equal(s.d.querySelector('#pfStrategyStatus').hidden,true);
  assert.equal(s.calls.filter(([u,o])=>u.endsWith('/strategies')&&o?.method==='PUT').length,0);
 }finally{s.w.close();}
});
test('incomplete generation and cancellation do not replace old code',async()=>{
 for(const cancel of [false,true]){
  const s=await setup();try{
   s.d.querySelector('[data-pf-strategy=generate]').click();await tick();s.send({type:'delta',text:'broken'});await tick();
   if(cancel)s.d.querySelector('[data-pf-strategy=cancel]').click();else s.close();
   await tick();assert.equal(s.d.querySelector('[name=customCode]').value,old);
   assert.equal(s.d.querySelector('[data-pf-strategy=generate]').disabled,false);
   assert.equal(s.state.customStrategies[0].code,old);
  }finally{s.w.close();}
 }
});
test('metadata stays draft until generation; choices and deletion persist without empty drafts',async()=>{
 const s=await setup();try{
  let input=s.d.querySelector('[name=strategyName]');input.value='Renamed';input.dispatchEvent(new s.w.Event('change',{bubbles:true}));await tick();
  assert.equal(s.state.customStrategies[0].name,'Original');
  assert.equal(s.d.querySelector('[name=strategyName]').value,'Renamed');
  s.d.querySelector('[data-pf-strategy=add]').click();
  assert.ok(s.d.querySelector('[name=customCode]'));
  assert.equal(s.d.querySelector('[data-pf-strategy=show-code]'),null);
  const checkbox=s.d.querySelector('[name=enabled][value=reversion]');checkbox.checked=true;checkbox.dispatchEvent(new s.w.Event('change',{bubbles:true}));await tick();
  assert.equal(s.state.customStrategies.length,1);assert.ok(s.state.enabled.includes('reversion'));
  s.d.querySelector('[data-pf-strategy-select="custom:one"]').click();
  s.d.querySelector('[data-pf-strategy=remove]').click();await tick();
  assert.equal(s.state.customStrategies.length,0);assert.equal(s.state.enabled.includes('custom:one'),false);
  assert.equal(s.calls.some(([u,o])=>/\/(orders|execute|plans)(\/|$)/.test(u)&&o?.method==='POST'),false);
 }finally{s.w.close();}
});
test('copy code shows success only after clipboard write succeeds',async()=>{
 for(const fails of [false,true]){
  const s=await setup();try{
   let copied='';
   Object.defineProperty(s.w.navigator,'clipboard',{value:{writeText:async text=>{if(fails)throw Error('denied');copied=text;}}});
   s.d.querySelector('[data-pf-strategy=copy]').click();await tick();
   const toast=s.d.querySelector('.pfToast');
   assert.equal(toast.hidden,false);
   assert.equal(toast.textContent,fails?'复制失败，请在代码区域手动复制':'复制成功');
   assert.equal(copied,fails?'':old);
  }finally{s.w.close();}
 }
});
