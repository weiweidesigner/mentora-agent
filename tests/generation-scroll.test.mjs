import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const code=readFileSync(new URL('../app/static/generation-scroll.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM('<div id="messages"><article></article></div><textarea></textarea>',{runScripts:'outside-only'}),w=dom.window,m=w.document.querySelector('#messages');
 let height=1000;const callbacks=[];w.requestAnimationFrame=fn=>{callbacks.push(fn);return callbacks.length;};
 Object.defineProperties(m,{scrollHeight:{get:()=>height},clientHeight:{get:()=>400}});m.scrollTo=({top})=>{m.scrollTop=top;m.dispatchEvent(new w.Event('scroll'));};
 w.eval(code);const follow=w.createGenerationScrollFollow(m),article=m.querySelector('article');
 const flush=()=>{while(callbacks.length)callbacks.shift()();};
 return {w,dom,m,follow,article,flush,grow:()=>{height+=100;follow.changed();}};
}
test('default follows content and programmatic scrolls do not pause it',()=>{
 const h=setup();h.follow.start(h.article);h.flush();assert.equal(h.m.scrollTop,600);h.grow();h.flush();assert.equal(h.m.scrollTop,700);h.dom.window.close();
});
test('manual wheel cancels queued follow and stays paused even back near bottom; resume and next turn restore it',()=>{
 const h=setup();h.follow.start(h.article);h.flush();h.grow();h.m.dispatchEvent(new h.w.WheelEvent('wheel',{deltaY:-30,bubbles:true}));h.flush();assert.equal(h.m.scrollTop,600);
 h.m.scrollTop=695;h.grow();h.flush();assert.equal(h.m.scrollTop,695);
 h.follow.resume();h.follow.changed();h.flush();assert.equal(h.m.scrollTop,800);
 h.m.dispatchEvent(new h.w.WheelEvent('wheel',{deltaY:20,bubbles:true}));const next=h.w.document.createElement('article');h.m.append(next);h.follow.start(next);h.grow();h.flush();assert.equal(h.m.scrollTop,900);h.dom.window.close();
});
test('keyboard scroll pauses, typing does not, and touch movement pauses',()=>{
 const h=setup();h.follow.start(h.article);h.flush();h.w.document.querySelector('textarea').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));h.grow();h.flush();assert.equal(h.m.scrollTop,700);
 h.m.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'PageUp',bubbles:true}));h.grow();h.flush();assert.equal(h.m.scrollTop,700);
 h.follow.start(h.article);h.flush();for(const [type,y]of [['touchstart',100],['touchmove',80]]){const event=new h.w.Event(type,{bubbles:true});Object.defineProperty(event,'touches',{value:[{clientY:y}]});h.m.dispatchEvent(event);}h.grow();h.flush();assert.equal(h.m.scrollTop,800);h.dom.window.close();
});
test('scrolling over a same-origin report iframe pauses following',()=>{
 const h=setup();h.follow.start(h.article);h.flush();const frame=h.w.document.createElement('iframe');h.m.append(frame);h.follow.watchFrame(frame);frame.contentDocument.body.dispatchEvent(new h.w.WheelEvent('wheel',{deltaY:-20,bubbles:true}));h.grow();h.flush();assert.equal(h.m.scrollTop,600);h.dom.window.close();
});
test('detached generations never move the currently viewed conversation',()=>{
 const h=setup();h.follow.start(h.article);h.flush();h.article.remove();h.m.scrollTop=20;h.grow();h.flush();assert.equal(h.m.scrollTop,20);h.dom.window.close();
});
