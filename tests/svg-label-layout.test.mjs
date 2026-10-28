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
