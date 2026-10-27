import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function queuePreparedStreamEvent('),source.indexOf('function handleStreamEvent('));
test('prepared text paints in batches and its final event never overtakes it',()=>{
 const dom=new JSDOM('<article></article>',{runScripts:'outside-only'}),w=dom.window,frames=[],seen=[];
 w.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
 w.handleStreamEvent=(_article,event,data,prepared)=>{assert(prepared);seen.push([event,data.delta||'']);};
 w.eval(fn);
 const article=w.document.querySelector('article');
 for(let i=0;i<4;i++)w.queuePreparedStreamEvent(article,'answer_text',{delta:'x'.repeat(20)});
 w.queuePreparedStreamEvent(article,'final',{});
 assert.equal(seen.length,0);frames.shift()();assert.equal(seen.length,2);
 frames.shift()();assert.equal(seen.length,4);frames.shift()();assert.equal(seen[4][0],'final');
 dom.window.close();
});
test('stopped or detached messages drop buffered presentation',()=>{
 const dom=new JSDOM('<article></article>',{runScripts:'outside-only'}),w=dom.window,frames=[];
 w.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};w.handleStreamEvent=()=>assert.fail('stale text');w.eval(fn);
 const article=w.document.querySelector('article');w.queuePreparedStreamEvent(article,'answer_text',{delta:'old'});article.activityEnded=true;frames.shift()();assert.equal(article.preparedStreamEvents.length,0);dom.window.close();
});
