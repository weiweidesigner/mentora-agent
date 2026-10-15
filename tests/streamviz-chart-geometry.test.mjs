import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/skills/streamviz/assets/chart-geometry.js',import.meta.url),'utf8');
test('responsive plot preserves data, fits negative peaks and endpoints, and keeps labels round and unscaled',()=>{
 const d=new JSDOM('<div class="chartbox"><svg class="line" viewBox="0 0 1000 298" preserveAspectRatio="none"><text x="0" y="38" font-size="11">95</text><polyline points="46,0 127,-11.62 1000,281"/><circle cx="1000" cy="281" r="3.5" fill="red"/></svg></div><div class="xl"><span style="left:100%">10-15</span></div>',{runScripts:'outside-only'}),w=d.window;
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
 const d=new JSDOM('<div class="chartbox"><svg class="hist" viewBox="0 0 1000 238" preserveAspectRatio="none"><rect x="50" y="30" width="50" height="200"/><text x="75" y="24" font-size="12" text-anchor="middle">2000</text></svg></div>',{runScripts:'outside-only'}),w=d.window;
 w.document.querySelector('svg').getBoundingClientRect=()=>({width:624,height:240});w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(w.document.querySelector('.chartbox').style.overflowX,'auto');assert.equal(w.document.querySelector('.sv-geometry').style.minWidth,'624px');assert.equal(w.document.querySelector('span').style.fontSize,'12px');w.close();
});
