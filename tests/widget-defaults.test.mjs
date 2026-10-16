import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../app/static/widgets.js',import.meta.url),'utf8');
const key='mentora-widget-boards-v1';
const defaults={version:1,boards:['stocks','crypto','forex'].map(id=>({id:'starter-'+id,title:id,messages:[],cards:[{id:id+'-chart',title:id,component:'tv-advanced-chart',status:'ready',url:'/generated/'+id+'.html',x:0,y:0,w:12,h:24}]}))};
async function setup(storage,response=defaults){
 const dom=new JSDOM(html,{url:'https://example.com/mentora/?tab=widgets',runScripts:'outside-only'}),w=dom.window;
 w.ResizeObserver=class{observe(){}};w.CSS={escape:x=>x};
 if(storage)w.localStorage.setItem(key,JSON.stringify(storage));
 const calls=[];w.fetch=async url=>{calls.push(url);return{ok:!!response,json:async()=>response};};
 w.eval(source);await new Promise(r=>setTimeout(r,20));
 return{dom,w,calls,data:()=>JSON.parse(w.localStorage.getItem(key)||'{}')};
}
test('first visit gets three populated default tabs and replaces only the fresh empty placeholder',async()=>{
 const s=await setup();assert.equal(s.data().boards.length,3);assert.equal(s.data().activeId,'starter-stocks');assert.equal(s.data().defaultsVersion,1);assert.equal(s.w.document.querySelectorAll('.widgetCard iframe').length,1);s.dom.window.close();
});
test('existing boards and active tab survive; deleted defaults stay deleted on reload',async()=>{
 const custom={id:'mine',title:'我的研究',messages:[],cards:[]};
 const s=await setup({boards:[custom],activeId:'mine',openIds:['mine']});assert.equal(s.data().boards.length,4);assert.equal(s.data().activeId,'mine');assert.equal(s.data().boards[0].title,'我的研究');
 const stored=s.data();stored.boards=stored.boards.filter(b=>b.id!=='starter-crypto');stored.openIds=stored.openIds.filter(id=>id!=='starter-crypto');s.dom.window.close();
 const reload=await setup(stored);assert.equal(reload.calls.length,0);assert.equal(reload.data().boards.length,3);reload.dom.window.close();
});
test('failed default loading keeps saved user boards intact and remains retryable',async()=>{
 const s=await setup({boards:[{id:'mine',title:'我的研究',cards:[]}],activeId:'mine'},null);assert.equal(s.w.document.querySelectorAll('[data-board]').length,1);assert.equal(s.data().defaultsVersion,undefined);s.dom.window.close();
});
