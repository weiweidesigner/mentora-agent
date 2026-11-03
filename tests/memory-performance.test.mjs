import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/memory-sphere.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM('<main id="characterWorkspace"><div id="cloud"></div></main>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const frames=new Map();let id=0,observer,svgWrites=0;
 w.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};w.cancelAnimationFrame=id=>frames.delete(id);
 w.matchMedia=()=>({matches:false,addEventListener(){}});
 w.IntersectionObserver=class{constructor(fn){observer=fn;}observe(){}};
 const attr=w.Element.prototype.setAttribute;w.Element.prototype.setAttribute=function(...args){if(this.tagName==='circle')svgWrites++;return attr.apply(this,args);};
 w.eval(source);const api=w.MentoraMemorySphere(w.document.getElementById('cloud'));
 const facts=Array.from({length:40},(_,i)=>({id:String(i),label:'记忆'+i,text:'内容'+i,weight:3}));api.setFacts(facts);observer([{isIntersecting:true}]);svgWrites=0;
 return {dom,w,api,facts,frames,observer,scene:w.document.querySelector('.chMemorySphere'),workspace:w.document.querySelector('main'),step(time){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));},get svgWrites(){return svgWrites;}};
}
test('steady animation does not rewrite stars or text layout, and unchanged facts preserve DOM',()=>{
 const h=setup();try{
 const word=h.scene.querySelector('.chMemoryWord'),before=word.style.transform;
 for(let i=0;i<60;i++)h.step(i*1000/60+1);
 assert.equal(h.svgWrites,0);assert.equal(word.style.left,'50%');assert.equal(word.style.top,'50%');assert.notEqual(word.style.transform,before);
 h.api.setFacts(h.facts);assert.equal(h.scene.querySelector('.chMemoryWord'),word);
 }finally{h.dom.window.close();}
});
test('animation stops offscreen, on hover, and when leaving the character page',async()=>{
 const h=setup();try{
 assert.equal(h.frames.size,1);h.observer([{isIntersecting:false}]);assert.equal(h.frames.size,0);
 h.observer([{isIntersecting:true}]);assert.equal(h.frames.size,1);
 h.scene.dispatchEvent(new h.w.Event('pointerenter'));assert.equal(h.frames.size,0);
 h.scene.dispatchEvent(new h.w.Event('pointerleave'));assert.equal(h.frames.size,1);
 h.workspace.hidden=true;await Promise.resolve();assert.equal(h.frames.size,0);
 h.workspace.hidden=false;await Promise.resolve();assert.equal(h.frames.size,1);
 h.workspace.dispatchEvent(new h.w.Event('scroll'));assert.equal(h.frames.size,0);
 }finally{h.dom.window.close();}
});
