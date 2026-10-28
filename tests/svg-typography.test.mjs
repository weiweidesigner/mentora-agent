import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/skills/streamviz/assets/svg-typography.js',import.meta.url),'utf8');
test('axis and data text keep authored pixel size while geometry stays responsive',()=>{
 const dom=new JSDOM('<div><svg viewBox="0 0 720 300"><polyline points="56,68.5 700,247.9"/><text x="40" y="44" style="font-size:11px">30,500</text><text x="700" y="234" style="font-size:12px">27,722</text></svg></div>',{runScripts:'outside-only'});
 const w=dom.window,svg=w.document.querySelector('svg');let scale=2,resize;
 Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:720,height:300}}});svg.getScreenCTM=()=>({a:scale,b:0,c:0,d:scale});
 for(const t of svg.querySelectorAll('text'))t.getScreenCTM=svg.getScreenCTM;
 w.ResizeObserver=class{constructor(fn){resize=fn;}observe(){}};w.requestAnimationFrame=fn=>fn();
 w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const labels=[...svg.querySelectorAll('text')];assert.equal(parseFloat(labels[0].style.fontSize)*scale,11);assert.equal(parseFloat(labels[1].style.fontSize)*scale,12);
 scale=.75;resize();assert(Math.abs(parseFloat(labels[0].style.fontSize)*scale-11)<.001);assert(Math.abs(parseFloat(labels[1].style.fontSize)*scale-12)<.001);
 assert.equal(svg.querySelector('polyline').getAttribute('points'),'56,68.5 700,247.9');assert.equal(labels[1].getAttribute('x'),'700');dom.window.close();
});
test('dense date axes retain all dates and reserve local scroll width',()=>{
 const dom=new JSDOM('<div><svg viewBox="0 0 720 300"><polyline points="56,68 700,240"/><g text-anchor="middle"><text x="332" y="284" style="font-size:11px;text-anchor:middle">2026-02</text><text x="378" y="284" style="font-size:11px;text-anchor:middle">2026-03</text><text x="424" y="284" style="font-size:11px;text-anchor:middle">2026-04</text></g></svg></div>',{runScripts:'outside-only'});
 const w=dom.window,svg=w.document.querySelector('svg');Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:720,height:300}}});svg.getScreenCTM=()=>({a:1,b:0,c:0,d:1});
 for(const t of svg.querySelectorAll('text')){t.getScreenCTM=svg.getScreenCTM;t.getBoundingClientRect=()=>({width:50});}
 w.requestAnimationFrame=fn=>fn();w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(svg.style.minWidth,'908px');assert.equal(svg.parentElement.style.overflowX,'auto');assert.equal(svg.querySelectorAll('text').length,3);assert(svg.textContent.includes('2026-03'));dom.window.close();
});
