import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/skills/streamviz/assets/chart-geometry.js',import.meta.url),'utf8');
test('responsive plot preserves data, fits negative peaks and endpoints, and keeps labels round and unscaled',()=>{
 const d=new JSDOM('<div class="chartbox"><svg class="line" viewBox="0 0 1000 298" preserveAspectRatio="none"><text x="0" y="38" font-size="11">95</text><polyline points="46,0 127,-11.62 1000,281"/><circle cx="1000" cy="281" r="3.5" fill="red"/></svg></div><div class="xl"><span style="left:100%">10-15</span></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
 const svg=w.document.querySelector('svg');svg.getBoundingClientRect=()=>({width:1600,height:220});
 w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const box=svg.getAttribute('viewBox').split(' ').map(Number);
 assert(box[1]<-11.62);assert(box[0]+box[2]>1000);
 assert.equal(svg.querySelector('polyline').getAttribute('points'),'46,0 127,-11.62 1000,281');
 assert.equal(svg.querySelector('text'),null);assert.equal(svg.parentNode.querySelector('span').style.fontSize,'11px');
 const dot=svg.parentNode.querySelectorAll('span')[1];assert.equal(dot.style.width,dot.style.height);
 assert(parseFloat(dot.style.left)<100);assert(parseFloat(w.document.querySelector('.xl span').style.left)<100);
 w.close();
});
test('dense histogram scrolls within its chart and retains unscaled data labels',()=>{
 const d=new JSDOM('<div class="chartbox"><svg class="hist" viewBox="0 0 1000 238" preserveAspectRatio="none"><rect x="50" y="30" width="50" height="200"/><text x="75" y="24" font-size="12" text-anchor="middle">2000</text></svg></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
 w.document.querySelector('svg').getBoundingClientRect=()=>({width:624,height:240});w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(w.document.querySelector('.chartbox').style.overflowX,'auto');assert.equal(w.document.querySelector('.sv-geometry').style.minWidth,'624px');assert.equal(w.document.querySelector('span').style.fontSize,'12px');w.close();
});

test('signed ranked bars reserve both value ends and move categories outside negative marks',()=>{
 const d=new JSDOM('<div><svg viewBox="0 0 720 150"><rect x="150" y="30" width="531" height="20"/><rect x="69" y="65" width="81" height="20"/><rect x="22" y="100" width="128" height="20"/><text x="140" y="44">MU</text><text x="689" y="44" text-anchor="end">+2.29% · 924.40</text><text x="140" y="79">PLTR</text><text x="61" y="79" text-anchor="end">-0.35% · 198.14</text><text x="140" y="114">NFLX</text><text x="14" y="114" text-anchor="end">-0.55% · 63.55</text></svg></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=d.window,svg=w.document.querySelector('svg');
 // JSDOM lacks SVG measurement; browser QA also checks the real saved report.
 Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:720,height:150}}});
 for(const node of svg.querySelectorAll('rect,text'))for(const key of ['x','y','width','height']){
   const n=Number(node.getAttribute(key));Object.defineProperty(node,key,{value:{baseVal:node.tagName==='text'?[{value:n}]:{value:n}}});
 }
 for(const t of svg.querySelectorAll('text'))t.getBBox=()=>({x:Number(t.getAttribute('x'))-(t.getAttribute('text-anchor')==='end'?100:0),width:100,y:0,height:12});
 svg.getBBox=()=>({x:-150,y:0,width:940,height:150});
 const before=[...svg.querySelectorAll('rect')].map(r=>r.outerHTML),text=svg.textContent;
 w.requestAnimationFrame=fn=>fn();w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(svg.dataset.svBarLayout,'true');assert.equal(svg.textContent,text);
 assert.deepEqual([...svg.querySelectorAll('rect')].map(r=>r.outerHTML),before);
 assert.equal(svg.querySelectorAll('text')[1].getAttribute('text-anchor'),'start');
 assert(Number(svg.querySelector('text').getAttribute('x'))< -86);
 assert(Number(svg.getAttribute('viewBox').split(' ')[0])< -150);
 assert.equal(svg.parentElement.style.overflowX,'auto');assert(parseFloat(svg.style.minWidth)>720);w.close();
});
