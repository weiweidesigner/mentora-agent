import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const script=readFileSync(new URL('../app/static/portfolio.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,20));
function setup(fail=false,workflow={}){
 const dom=new JSDOM('<main class="shell"><nav><button id="railHome"></button><button id="railWidgets"></button><button id="navWidgets"></button></nav><section id="taskWorkspace"></section><section id="widgetWorkspace"></section></main>',{url:'https://example.com/mentora/?tab=portfolio',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[];w.setInterval=()=>1;w.clearInterval=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.fetch=async(url,opts)=>{calls.push([url,opts]);return{ok:!fail,json:async()=>fail?{detail:'行情暂不可用'}:url.endsWith('/workflow')?workflow:url.endsWith('/opportunities')?{items:[]}:{initial:1e6,cash:1e6,equity:1e6,marketValue:0,unrealized:0,realized:0,totalReturn:0,positions:[],trades:[],plans:[],history:[],settings:{maxPositionPct:15,riskPct:.5,reservePct:20,stopPct:5,slippageBps:10,fee:0,automatic:false},valuationComplete:true,scan:{},universeCount:0,scannedCount:0,validCount:0,strategies:[],serverTime:'2026-10-16T07:00:00Z'}};};
 w.eval(script);return{dom,w,calls};
}
test('SOP task cards link directly to their exact scheduled task, with controls outside the link',async()=>{
 const s=setup(false,{tasks:[{id:'event-task',title:'事件催化找股',_portfolioKind:'events',enabled:false},{id:'quant-task',title:'量化回测找股',_portfolioKind:'quant',enabled:false}]});await tick();s.w.document.querySelector('[data-pf-view="decisions"]').click();
 for(const [kind,id] of [['events','event-task'],['quant','quant-task']]){
  const node=s.w.document.querySelector(`[data-sop-node="${kind}"]`),link=node.querySelector('a.pfSopNodeMain');
  assert.ok(link);assert.equal(new URL(link.href).searchParams.get('task'),id);assert.equal(new URL(link.href).searchParams.get('tab'),'tasks');
  assert.equal(link.querySelector('button'),null);assert.equal(link.hasAttribute('data-pf-sop-open'),false);
  assert.ok(node.querySelector('[data-pf-sop-settings]'));assert.ok(node.querySelector('[data-pf-sop-toggle]'));
 }
 assert.ok(s.w.document.querySelector('[data-sop-node="profile"] button.pfSopNodeMain'));s.dom.window.close();
});
