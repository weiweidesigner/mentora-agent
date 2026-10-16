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
test('measured cards pull subsequent rows up, preserve other columns, and still push down on growth',async()=>{
 const card=(id,x,y,h=18)=>({id,title:id,component:'tv-symbol-info',status:'ready',url:'/generated/'+id+'.html',x,y,w:6,h});
 const s=await setup({defaultsVersion:1,activeId:'mine',boards:[{id:'mine',title:'布局',cards:[card('quote',0,0),card('side',6,0,30),card('next',0,19),card('blocked',6,31)]}]});
 let measure;s.w.installTradingViewSurface=(frame,callback)=>{measure=callback;};
 s.w.document.querySelector('[data-card="quote"] iframe').dispatchEvent(new s.w.Event('load'));measure(69,true);
 let cards=s.data().boards[0].cards;assert.ok(Math.abs(cards.find(c=>c.id==='next').y*24-109-24)<0.001);assert.equal(cards.find(c=>c.id==='side').y,0);assert.equal(cards.find(c=>c.id==='blocked').y,31);
 measure(620,true);cards=s.data().boards[0].cards;assert.ok(Math.abs(cards.find(c=>c.id==='next').y*24-660-24)<0.001);measure(69,true);cards=s.data().boards[0].cards;assert.ok(Math.abs(cards.find(c=>c.id==='next').y*24-109-24)<0.001);s.dom.window.close();
});
test('saved boards normalize both old and manually introduced vertical gaps',async()=>{
 for(const y of [11,13,20]){
  const s=await setup({defaultsVersion:1,activeId:'starter-stocks',boards:[{id:'starter-stocks',title:'股票',cards:[{id:'stocks-symbol-info',x:0,y:0,w:12,h:10,contentHeight:223,url:'/generated/info.html',status:'ready'},{id:'stocks-advanced-chart',x:0,y,w:12,h:26,url:'/generated/chart.html',status:'ready'}]}]});
  const top=Number.parseFloat(s.w.document.querySelector('[data-card="stocks-advanced-chart"]').style.top);assert.equal(top,247);s.dom.window.close();
 }
});

test('mixed-height columns keep 24px vertical gaps and close holes after deletion',async()=>{
 const card=(id,x,y,w,height)=>({id,title:id,x,y,w,h:Math.ceil(height/24),contentHeight:height,url:'/generated/'+id+'.html',status:'ready'});
 const s=await setup({defaultsVersion:1,activeId:'b',boards:[{id:'b',title:'布局',cards:[card('top',0,0,12,223),card('left',0,30,6,110),card('right',6,30,6,200),card('below-left',0,80,6,180),card('below-right',6,80,6,180)]}]});
 const top=id=>parseFloat(s.w.document.querySelector(`[data-card="${id}"]`).style.top);
 assert.equal(top('left'),247);assert.equal(top('right'),247);assert.equal(top('below-left')-top('left')-110,24);assert.equal(top('below-right')-top('right')-200,24);
 s.w.document.querySelector('[data-card="left"] [data-remove]').click();assert.equal(top('below-left'),247);s.dom.window.close();
});
