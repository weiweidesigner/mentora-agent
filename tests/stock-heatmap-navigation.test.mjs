import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const script=readFileSync(new URL('../app/skills/business-chart-recall/scripts/stock_heatmap.py',import.meta.url),'utf8').match(/JS=r"""([\s\S]*?)"""/)[1];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const stock={code:'185:AAA',symbol:'AAA',name:'Alpha',sector:'89:861077',sectorName:'Technology',metrics:{'size:absolute_change_pct':1,'color:day':1}};
 const p={stocks:[stock],sectors:[],themes:[],universes:{sp500:[stock.code]},loaded:{universe:'sp500',themes:false},universe:'sp500',dimension:'sector',groupBy:'none'};
 const cfg={colors:{day:{label:['Day','日涨跌幅'],extent:3}},sizes:{absolute_change_pct:['Change','涨跌幅']},fundamentals:[]};
 const dom=new JSDOM('<main><div class="heatmap-toolbar"><div class="heatmap-dimensions"></div><div class="heatmap-controls"></div></div><div class="heatmap-breadcrumb" hidden></div><div class="heatmap-map-wrap"><div class="heatmap-map"></div><div class="heatmap-empty" hidden></div><div class="heatmap-loading" hidden></div></div><div class="heatmap-scale-bar"></div><div class="heatmap-scale-labels"></div><button class="heatmap-depth-button"></button></main><script id="component-data" type="application/json"></script><script id="heatmap-config" type="application/json"></script>',{url:'https://example.com/mentora/share-artifact/test.html',runScripts:'outside-only'});
 const w=dom.window,d=w.document,requests=[];
 d.getElementById('component-data').textContent=JSON.stringify(p);d.getElementById('heatmap-config').textContent=JSON.stringify(cfg);
 w.ResizeObserver=class{observe(){}};w.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:440,left:0,top:0,right:800,bottom:440});
 w.fetch=url=>new Promise((resolve,reject)=>requests.push({url,resolve:data=>resolve({ok:true,json:async()=>data}),reject}));
 d.documentElement.lang='en';w.eval(script);
 const tab=name=>[...d.querySelectorAll('[role=tab]')].find(e=>e.textContent===name);
 return {w,d,requests,tab,selected:()=>d.querySelector('[role=tab][aria-selected=true]').textContent};
}
test('tab switches synchronously, clears previous plot and shows central loading until data arrives',async()=>{
 const s=setup();try{
 assert(s.d.querySelector('.heatmap-cell'));
 s.tab('Theme').click();
 assert.equal(s.selected(),'Theme');assert.equal(s.d.querySelector('.heatmap-loading').hidden,false);
 assert.equal(s.d.querySelector('.heatmap-empty').hidden,true);assert.equal(s.d.querySelectorAll('.heatmap-cell').length,0);
 s.requests[0].resolve({themes:[{code:'89:865220',name:'Theme data',metrics:{'color:day':2,'size:absolute_change_pct':2}}]});await tick();
 assert.equal(s.d.querySelector('.heatmap-loading').hidden,true);assert(s.d.querySelector('.heatmap-cell').textContent.includes('Theme data'));
 }finally{s.w.close()}
});
test('switching back during a request cannot be overwritten by its late response',async()=>{
 const s=setup();try{
 s.tab('Theme').click();s.tab('Sector').click();assert.equal(s.selected(),'Sector');await tick();
 assert.equal(s.d.querySelector('.heatmap-loading').hidden,true);assert(s.d.querySelector('.heatmap-cell').textContent.includes('AAA'));
 s.requests[0].resolve({themes:[]});await tick();assert.equal(s.selected(),'Sector');assert(s.d.querySelector('.heatmap-cell').textContent.includes('AAA'));
 }finally{s.w.close()}
});
test('failed selection stays selected and permits retry with central loading',async()=>{
 const s=setup();try{
 s.tab('Theme').click();s.requests[0].reject(Error('offline'));await tick();
 assert.equal(s.selected(),'Theme');assert.equal(s.d.querySelector('.heatmap-loading').hidden,true);assert.equal(s.d.querySelector('.heatmap-load-status').hidden,false);
 s.tab('Theme').click();assert.equal(s.requests.length,2);assert.equal(s.d.querySelector('.heatmap-loading').hidden,false);assert.equal(s.d.querySelector('.heatmap-load-status').hidden,true);
 s.requests[1].resolve({themes:[]});await tick();assert.equal(s.d.querySelector('.heatmap-loading').hidden,true);
 }finally{s.w.close()}
});
