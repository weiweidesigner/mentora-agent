import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const addToWidgetIcon ='),source.indexOf("\nwindow.addEventListener('message',event=>",source.indexOf('function withArtifactWidgetControl(')));
const tick=()=>new Promise(setImmediate);
function setup(){
 const dom=new JSDOM('<main></main>',{url:'https://example.com/mentora/',runScripts:'outside-only'}),w=dom.window;
 let mutations=0;const NativeObserver=w.MutationObserver;
 // Bound a broken observer feedback loop so a regression fails instead of
 // hanging the test process and every browser tab sharing this renderer.
 w.MutationObserver=class extends NativeObserver{
  constructor(callback){super((...args)=>{if(++mutations>40){this.disconnect();return;}callback(...args);});}
 };
 w.eval(code);
 return {dom,w,mutations:()=>mutations};
}
function frame(w,parent,title){
 const f=w.document.createElement('iframe');parent.append(f);
 f.contentDocument.body.innerHTML=title?'<h2>'+title+'</h2>':'';
 return f;
}
test('one host button stays in the first chart when a titleless document embeds sibling charts',async()=>{
 const {dom,w,mutations}=setup();
 try{
  const root=w.document.createElement('div');w.document.querySelector('main').append(root);
  const shell=w.withArtifactWidgetControl(root,{url:'/generated/five-days.html'});w.document.querySelector('main').append(shell);
  const a=frame(w,root,'Day 1'),b=frame(w,root,'Day 2');
  await tick();await tick();
  assert.equal(a.contentDocument.querySelectorAll('.artifactAddToWidget').length,1);
  assert.equal(b.contentDocument.querySelectorAll('.artifactAddToWidget').length,0);
  assert(mutations()<10,'nested observers must settle');
  b.contentDocument.querySelector('h2').append(' updated');await tick();
  assert.equal(a.contentDocument.querySelectorAll('.artifactAddToWidget').length,1);
  assert(mutations()<15,'updating another title must not move the action');
 }finally{dom.window.close();}
});
test('an outer artifact title owns the action and nested chart titles remain untouched',async()=>{
 const {dom,w,mutations}=setup();
 try{
  const root=w.document.createElement('div');w.document.querySelector('main').append(root);
  const shell=w.withArtifactWidgetControl(root,{url:'/generated/five-days.html'});w.document.querySelector('main').append(shell);
  const outer=frame(w,root,'Five trading days');
  const children=Array.from({length:5},(_,i)=>frame(w,outer.contentDocument.body,'Day '+i));
  await tick();await tick();
  assert.equal(outer.contentDocument.querySelectorAll('.artifactAddToWidget').length,1);
  assert(children.every(f=>!f.contentDocument.querySelector('.artifactAddToWidget')));
  assert(mutations()<10,'outer and child observers must not compete');
 }finally{dom.window.close();}
});
