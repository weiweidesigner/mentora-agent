import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const script=readFileSync(new URL('../app/static/portfolio.js',import.meta.url),'utf8');
async function render(watchlist){
 const dom=new JSDOM('<main class="shell"><nav><button id="railHome"></button><button id="railWidgets"></button><button id="navWidgets"></button></nav><section id="taskWorkspace"></section><section id="widgetWorkspace"></section></main>',{url:'https://example.com/mentora/?tab=portfolio',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.setInterval=()=>1;w.clearInterval=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.fetch=async url=>({ok:true,json:async()=>url.endsWith('/workflow')?{watchlist}:url.endsWith('/opportunities')?{items:[]}:{initial:1e6,cash:1e6,equity:1e6,marketValue:0,positions:[],trades:[],plans:[],history:[],settings:{},valuationComplete:true,scan:{},strategies:[]}});
 w.eval(script);await new Promise(r=>setTimeout(r,30));return dom;
}
test('workflow backtests remain visible without inventing a JEV decision or fill',async()=>{
 const dom=await render([{symbol:'AAPL',name:'Apple',observationAction:'pending',reason:'工作流「自选研究」：已更新真实执行结果',backtests:[{status:'computed',strategy:'trend',totalReturn:12.3,maxDrawdown:-4,trades:3,winRate:66.7}],workflowExecution:{title:'自选研究',tools:['portfolio-backtest'],updated:'2026-10-25T10:00:00Z',backtests:[{status:'computed',strategy:'trend',totalReturn:12.3,maxDrawdown:-4,trades:3,winRate:66.7}]}}]);
 try{
 const row=dom.window.document.querySelector('.pfWatchTable tbody tr');
 assert(row);assert.match(row.textContent,/自选研究.*12.3%/s);
 assert.equal(row.querySelector('.pfWatchTrade').textContent,'未下单');
 assert.match(row.querySelector('.pfWatchJev').textContent,/未生成/);
 }finally{dom.window.close();}
});
test('workflow JEV observation displays actual watch decision and confidence',async()=>{
 const dom=await render([{symbol:'AAPL',name:'Apple',observationAction:'watch',reason:'工作流「最新研究」：需要价格确认',confidence:.62,directionAssessment:{action:'watch',confidence:.62,assessedAt:'2026-10-25T10:00:00Z'},decisionAt:'2026-10-25T10:00:00Z',decision:'watch',workflowExecution:{title:'最新研究',tools:['portfolio-jev'],updated:'2026-10-25T10:00:00Z',backtests:[],decision:{action:'watch',modelAction:'watch',confidence:.62,actionConfidences:{watch:.62},factorLabel:'需要价格确认'}}}]);
 try{
 const row=dom.window.document.querySelector('.pfWatchTable tbody tr');
 assert.equal(row.querySelector('.pfWatchAction').textContent,'观察');
 assert.equal(row.querySelector('.pfWatchJev').textContent,'62%');
 assert.equal(row.querySelector('.pfWatchTrade').textContent,'未下单');
 assert.match(row.textContent,/需要价格确认/);
 }finally{dom.window.close();}
});
test('newer canonical decisions retain priority over older workflow evidence',async()=>{
 const dom=await render([{symbol:'AAPL',decisionAt:'2026-10-26T10:00:00Z',decision:'buy',buyConfidence:.85,workflowExecution:{title:'旧研究',tools:['portfolio-jev'],updated:'2026-10-25T10:00:00Z',backtests:[],decision:{action:'watch',confidence:.62}}}]);
 try{assert.equal(dom.window.document.querySelector('.pfWatchJev').textContent,'85%');}finally{dom.window.close();}
});
