import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const code=readFileSync(new URL('../app/static/portfolio-import.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,40));
function setup(){
 const dom=new JSDOM('<section id="portfolioWorkspace"><section class="pfCard"><header class="pfCardHead"><h2>自选股票</h2></header><form id="pfFavoriteForm"><div class="pfFavoriteAdd"><label id="pfFavoriteField"><input></label><button data-pf-action="refresh" type="button">刷新行情</button><button type="submit">添加自选</button></div></form></section></section>',{url:'https://example.com/mentora/',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.endsWith('/ocr')?{engine:'tesseract',usesLLM:false,candidates:[{symbol:'AAPL',market:'us',evidence:'AAPL'},{symbol:'600519.SH',market:'cn',evidence:'600519'}],text:'AAPL 600519'}:{ok:true}};};
 w.eval(code);return {dom,w,d:w.document,calls};
}
test('favorites title and form share a header; image input recognizes but never adds without selection',async()=>{
 const s=setup();try{
  assert.equal(s.d.querySelector('#pfFavoriteForm').parentElement,s.d.querySelector('.pfCardHead'));
  assert.equal(s.d.querySelectorAll('[data-ocr-upload]').length,1);
  assert(s.d.querySelector('#pfFavoriteField [data-ocr-upload]'));
  const upload=s.d.querySelector('input[type=file]');Object.defineProperty(upload,'files',{value:[new s.w.File(['image'],'watchlist.png',{type:'image/png'})]});upload.dispatchEvent(new s.w.Event('change'));await tick();await tick();
  assert.equal(s.calls.length,1);assert(s.calls[0].url.endsWith('/ocr'));
  assert.equal(s.d.querySelectorAll('.pfOcrCandidates input:checked').length,0);
  assert.equal(s.d.querySelector('[data-ocr-add]').disabled,true);
  const checkbox=s.d.querySelector('.pfOcrCandidates input');checkbox.checked=true;checkbox.dispatchEvent(new s.w.Event('change',{bubbles:true}));s.d.querySelector('[data-ocr-add]').click();await tick();
  assert.equal(s.calls.length,2);assert.deepEqual(s.calls[1].body,{symbol:'AAPL',name:'AAPL'});
  assert.match(s.d.querySelector('[data-ocr-status]').textContent,/已加入 1 项/);
  assert(!s.calls.some(c=>/chat|order|workflow/.test(c.url)));
 }finally{s.w.close();}
});
test('pasted image opens OCR, select all supports partial selection and adds only confirmed codes',async()=>{
 const s=setup();try{
  const event=new s.w.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'clipboardData',{value:{items:[{kind:'file',type:'image/png',getAsFile:()=>new s.w.File(['image'],'paste.png',{type:'image/png'})}]}});
  s.d.querySelector('#pfFavoriteField input').dispatchEvent(event);await tick();await tick();
  assert(event.defaultPrevented);assert.equal(s.calls.length,1);
  assert.equal(s.d.querySelector('.pfOcrDialog h2').textContent,'识别到 2 个代码');
  assert.equal(s.d.querySelector('[data-ocr-status]').hidden,true);
  assert.equal(s.d.querySelector('.pfOcrClose svg').getAttribute('viewBox'),'0 0 24 24');
  const all=s.d.querySelector('[data-ocr-all]');all.click();
  assert.equal(s.d.querySelectorAll('.pfOcrCandidates input:checked').length,2);
  s.d.querySelector('.pfOcrCandidates input').click();assert(all.indeterminate);assert(!all.checked);
  all.click();assert(all.checked);assert(!all.indeterminate);
  s.d.querySelector('[data-ocr-add]').click();await tick();await tick();
  assert.equal(s.calls.length,3);assert.equal(all.disabled,true);
  assert(!s.calls.some(c=>/chat|order|workflow/.test(c.url)));
 }finally{s.w.close();}
});
test('bulk favorites use at most four concurrent requests and expose partial failures',async()=>{
 const s=setup();try{
  let active=0,maximum=0,importedEvent=0;
  s.d.querySelector('#portfolioWorkspace').addEventListener('portfolio:favorites-imported',()=>importedEvent++);
  s.w.fetch=async(url,options)=>{
   if(url.endsWith('/ocr'))return {ok:true,json:async()=>({candidates:Array.from({length:9},(_,i)=>({symbol:'TEST'+i,market:'us',evidence:'fixture'}))})};
   active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,20));active--;
   const failed=JSON.parse(options.body).symbol==='TEST4';return {ok:!failed,json:async()=>failed?{detail:'fixture invalid code'}:{ok:true}};
  };
  const upload=s.d.querySelector('input[type=file]');Object.defineProperty(upload,'files',{value:[new s.w.File(['fixture'],'stocks.png',{type:'image/png'})]});upload.dispatchEvent(new s.w.Event('change'));await tick();await tick();
  s.d.querySelector('[data-ocr-all]').click();s.d.querySelector('[data-ocr-add]').click();
  assert.match(s.d.querySelector('[data-ocr-add]').textContent,/正在加入 0\/9/);
  await new Promise(r=>setTimeout(r,150));
  assert.equal(maximum,4);assert.equal(importedEvent,1);
  assert.equal(s.d.querySelectorAll('.is-imported').length,8);
  assert.match(s.d.querySelector('[data-ocr-status]').textContent,/已加入 8 项/);
  assert.match(s.d.querySelector('[data-ocr-status]').textContent,/TEST4：fixture invalid code/);
  assert.equal(s.d.querySelector('[data-ocr-add]').disabled,false);
 }finally{s.w.close();}
});
