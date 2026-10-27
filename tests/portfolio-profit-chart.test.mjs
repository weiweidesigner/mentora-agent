import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const code=readFileSync(new URL('../app/static/portfolio.js',import.meta.url),'utf8');
async function setup(history){
 const dom=new JSDOM('<main class="shell"><button id="railHome"></button><button id="railWidgets"></button><button id="navWidgets"></button><section id="taskWorkspace"></section><section id="widgetWorkspace"></section></main>',{url:'https://example.com/mentora/?tab=portfolio&portfolioView=returns',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[];w.setInterval=()=>1;w.clearInterval=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const account={initial:1000,equity:1080,totalReturn:8,cash:1000,marketValue:80,unrealized:-20,realized:100,positions:[],trades:[],plans:[],history,settings:{},valuationComplete:true,scan:{}};
 w.fetch=async(url,options={})=>{calls.push([url,options]);return{ok:true,json:async()=>url.endsWith('/workflow')?{watchlist:[],preferences:{},strategies:{}}:url.endsWith('/opportunities')?{items:[]}:account};};
 w.eval(code);await new Promise(resolve=>setTimeout(resolve,30));return{dom,w,d:w.document,calls};
}
const history=[{day:'2026-10-16',equity:1000},{day:'2026-10-17',equity:980},{day:'2026-10-26',equity:900},{day:'2026-10-27',equity:1080}];

test('profit curve spans the chart, clips signed line and area at zero and preserves actual date spacing',async()=>{
 const s=await setup(history);try{
  const svg=s.d.querySelector('.pfProfitPlot svg');assert(svg);assert.equal(svg.getAttribute('preserveAspectRatio'),'none');
  const zero=Number(svg.dataset.zeroY);assert(zero>0&&zero<180);
  const above=svg.querySelector('#pfProfitAbove rect'),below=svg.querySelector('#pfProfitBelow rect');
  assert.equal(Number(above.getAttribute('height')),zero);assert.equal(Number(below.getAttribute('y')),zero);assert.equal(Number(below.getAttribute('height'))+zero,180);
  for(const [sign,id] of [['Positive','Above'],['Negative','Below']]){
   const region=svg.querySelector('.pfProfit'+sign);assert.equal(region.getAttribute('clip-path'),'url(#pfProfit'+id+')');assert(region.querySelector('.pfProfitArea'));assert.equal(region.querySelector('.pfProfitLine').getAttribute('vector-effect'),'non-scaling-stroke');
  }
  const points=[...svg.querySelector('.pfProfitLine').getAttribute('d').matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
  assert.equal(points.length,history.length);assert.equal(points[0][0],2);assert.equal(points.at(-1)[0],998);assert(Math.abs(points[1][0]-(2+996/11))<.001);
  assert(points[1][1]>zero&&points.at(-1)[1]<zero);
  assert.deepEqual([...s.d.querySelectorAll('.pfProfitDates span')].map(el=>el.textContent),['2026-10-16','2026-10-27']);
  const chart=svg.closest('.pfCard');assert.equal(chart.querySelector('.pfSubtle'),null);assert.doesNotMatch(chart.textContent,/仅绘制实际|暂未计分红|完整市场税费/);
  assert.equal(s.calls.some(([url,options])=>/\/plans(?:\/|$)|\/execute$|\/workflow\/run$/.test(url)&&options.method==='POST'),false);
 }finally{s.w.close();}
});

test('current returns and historical returns use signed gain and loss classes',async()=>{
 const s=await setup(history);try{
  assert(s.d.querySelector('.pfHero.pfGain'));const metrics=s.d.querySelectorAll('.pfMetrics strong');assert(metrics[0].classList.contains('pfLoss'));assert(metrics[1].classList.contains('pfGain'));
  const rows=[...s.d.querySelectorAll('.pfTable tbody tr')];assert(rows[0].children[2].classList.contains('pfGain'));assert(rows[0].children[3].classList.contains('pfGain'));assert(rows[1].children[2].classList.contains('pfLoss'));assert(rows[1].children[3].classList.contains('pfLoss'));assert.equal(rows.at(-1).children[3].className,'');
 }finally{s.w.close();}
});

for(const [name,values] of [['positive',[5,10]],['negative',[-10,-5]],['zero',[0,0]]])test('profit handles '+name+' series without invalid SVG coordinates',async()=>{
 const s=await setup(values.map((v,i)=>({day:'2026-10-'+(26+i),equity:1000+v})));try{
  const svg=s.d.querySelector('.pfProfitPlot svg');assert(svg);assert.doesNotMatch(svg.outerHTML,/NaN|Infinity/);
  if(name==='zero'){assert(svg.querySelector('.pfProfitFlat'));assert.equal(svg.querySelector('.pfProfitArea'),null);}
  else assert.equal(svg.querySelectorAll('.pfProfitArea').length,2);
 }finally{s.w.close();}
});

test('insufficient history retains an honest empty state',async()=>{
 for(const rows of [[],history.slice(0,1)]){const s=await setup(rows);try{assert.equal(s.d.querySelector('.pfProfitPlot'),null);assert.match(s.d.querySelector('#pfPanel').textContent,/首次更新行情|首次收益估值/);}finally{s.w.close();}}
});
