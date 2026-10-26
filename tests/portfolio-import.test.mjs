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
