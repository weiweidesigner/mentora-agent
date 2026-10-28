import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const source=readFileSync(new URL('../app/skills/streamviz/assets/svg-label-layout.js',import.meta.url),'utf8');
test('line labels fit completely without changing values or series geometry, including after fonts load',async()=>{
 const d=new JSDOM('<svg viewBox="0 0 460 300"><polyline points="44,150 440,136.2"/><g><text x="446" y="140">+0.53%</text><text x="446" y="208">-2.07%</text></g></svg>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=d.window,svg=w.document.querySelector('svg'),geometry=svg.innerHTML;
 let right=488,resize;svg.getBBox=()=>({x:20,y:10,width:right-20,height:286});
 w.ResizeObserver=class{constructor(fn){resize=fn;}observe(){}};
 let ready;w.document.fonts={ready:new Promise(resolve=>{ready=resolve;})};w.requestAnimationFrame=fn=>fn();
 w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(svg.getAttribute('viewBox'),'0 0 492 300');assert.equal(svg.innerHTML,geometry);
 right=504;ready();await Promise.resolve();assert.equal(svg.getAttribute('viewBox'),'0 0 508 300');
 resize();assert.equal(svg.getAttribute('viewBox'),'0 0 508 300');assert.equal(svg.innerHTML,geometry);w.close();
});
test('an already fitting plot keeps its original viewport',()=>{
 const d=new JSDOM('<svg viewBox="0 0 500 300"><polyline points="40,50 400,100"/><text x="410" y="100">+1.80%</text></svg>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=d.window,svg=w.document.querySelector('svg');svg.getBBox=()=>({x:20,y:10,width:460,height:280});w.requestAnimationFrame=fn=>fn();w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(svg.getAttribute('viewBox'),'0 0 500 300');w.close();
});

test('endpoint label lane belongs inside the grid and x axis, without moving data or date ticks',()=>{
 const d=new JSDOM('<svg viewBox="0 0 460 300"><g><line x1="44" x2="440" y1="20" y2="20"/><line x1="44" x2="440" y1="280" y2="280"/></g><line x1="44" x2="44" y1="20" y2="280"/><polyline points="44,150 440,136.2"/><text x="440" y="296" text-anchor="middle">10/27</text><text x="446" y="140">+0.53%</text></svg>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=d.window,svg=w.document.querySelector('svg'),date=svg.querySelector('text');
 date.getBBox=()=>({x:425,y:285,width:30,height:12});svg.querySelector('text:last-child').getBBox=()=>({x:446,y:128,width:48,height:14});
 svg.getBBox=()=>({x:20,y:10,width:Math.max(494,Number(svg.querySelector('line').getAttribute('x2')))-20,height:288});
 w.requestAnimationFrame=fn=>fn();w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 for(const line of [...svg.querySelectorAll('line')].slice(0,2))assert.equal(line.getAttribute('x2'),'502');
 assert.equal(svg.querySelectorAll('line')[2].getAttribute('x2'),'44');
 assert.equal(date.getAttribute('x'),'440');assert.equal(date.textContent,'10/27');assert.equal(svg.querySelector('polyline').getAttribute('points'),'44,150 440,136.2');
 assert.equal(svg.querySelector('text:last-child').textContent,'+0.53%');assert.equal(svg.getAttribute('viewBox'),'0 0 506 302');w.close();
});

test('borderless chart crops unused horizontal canvas while retaining all marks and axis labels',()=>{
 const d=new JSDOM('<main data-aime-streamviz-root><div data-sv-card data-sv-unframed="true"><svg viewBox="0 0 720 300"><polyline points="56,68.5 700,247.9"/><text x="48" y="44" text-anchor="end">30,500</text><text x="700" y="284">2026-10</text></svg></div></main>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=d.window,svg=w.document.querySelector('svg'),original=svg.innerHTML;svg.getBBox=()=>({x:25,y:10,width:690,height:288});svg.getScreenCTM=()=>({a:2,b:0,c:0,d:2});w.requestAnimationFrame=fn=>fn();w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(svg.getAttribute('viewBox'),'24.5 0 691 302');assert.equal(svg.innerHTML,original);d.window.close();
});
