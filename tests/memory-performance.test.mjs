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
test('animation stops offscreen, on a memory hover, and when leaving the character page',async()=>{
 const h=setup();try{
 assert.equal(h.frames.size,1);h.observer([{isIntersecting:false}]);assert.equal(h.frames.size,0);
 h.observer([{isIntersecting:true}]);assert.equal(h.frames.size,1);
 h.scene.querySelector('.chMemoryWord').dispatchEvent(new h.w.Event('pointerenter'));assert.equal(h.frames.size,0);
 h.scene.querySelector('.chMemoryWord').dispatchEvent(new h.w.Event('pointerleave'));assert.equal(h.frames.size,1);
 h.workspace.hidden=true;await Promise.resolve();assert.equal(h.frames.size,0);
 h.workspace.hidden=false;await Promise.resolve();assert.equal(h.frames.size,1);
 h.workspace.dispatchEvent(new h.w.Event('scroll'));assert.equal(h.frames.size,0);
 }finally{h.dom.window.close();}
});

test('memory details are escaped, available on hover/focus, and have no native title popup',()=>{
 const h=setup();try{
 h.api.setFacts([{id:'safe',label:'旅行',text:'喜欢海边 <img src=x>',quote:'想去看看海',weight:3}]);
 const word=h.scene.querySelector('.chMemoryWord');assert.equal(word.hasAttribute('title'),false);
 word.dispatchEvent(new h.w.Event('pointerenter'));
 const tip=h.w.document.querySelector('.chMemoryTooltip');assert.equal(tip.hidden,false);assert.match(tip.textContent,/喜欢海边 <img src=x>/);assert.equal(tip.querySelector('img'),null);
 word.dispatchEvent(new h.w.Event('pointerleave'));assert.equal(tip.hidden,true);
 word.focus();assert.equal(tip.hidden,false);
 }finally{h.dom.window.close();}
});
test('fullscreen reuses the existing star scene and restores it on exit or navigation',async()=>{
 const h=setup();try{
 const host=h.w.document.getElementById('cloud'),expand=host.querySelector('.chNebulaExpand'),word=h.scene.querySelector('.chMemoryWord');
 expand.click();const dialog=h.w.document.querySelector('.chNebulaDialog');assert.equal(dialog.hasAttribute('open'),true);assert(dialog.contains(h.scene));assert.equal(h.scene.querySelector('.chMemoryWord'),word);
 dialog.querySelector('button').click();assert.equal(dialog.hasAttribute('open'),false);assert(host.contains(h.scene));
 expand.click();h.workspace.hidden=true;await Promise.resolve();assert.equal(dialog.hasAttribute('open'),false);assert(host.contains(h.scene));assert.equal(h.frames.size,0);
 }finally{h.dom.window.close();}
});
test('perspective produces varied depths and staggers labels around their star anchors',()=>{
 const h=setup();try{
 const words=[...h.scene.querySelectorAll('.chMemoryWord')];
 assert(new Set(words.map(w=>w.style.opacity)).size>10);assert(new Set(words.map(w=>w.style.filter)).size>5);
 assert(words.every(w=>w.querySelector('.chMemoryStar')));assert(new Set(words.map(w=>w.querySelector('.chMemoryWordText').style.transform)).size>2);
 }finally{h.dom.window.close();}
});
