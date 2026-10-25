import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const runtime=readFileSync(new URL('../app/static/artifact-presentation.js',import.meta.url),'utf8');
const native=(code,name,market)=>`<div class="kline-component"><header class="kline-title"><strong data-business-title="true">${code}</strong><button>日K</button></header><canvas id="kline-canvas"></canvas></div><script>const config = ${JSON.stringify({code,name,market,candles:[{close:3713.03}]})};</script>`;
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('A-share index uses its real name while US equity keeps its ticker',async()=>{
 for(const [code,name,market,label] of [['000001.SH','上证指数','CN','上证指数'],['603259.SH','药明康德','CN','药明康德'],['AAPL','Apple Inc.','US','AAPL']]){
  const dom=new JSDOM(native(code,name,market),{runScripts:'outside-only',pretendToBeVisual:true}),doc=dom.window.document;
  const before=doc.querySelector('script').textContent;dom.window.requestAnimationFrame=()=>0;dom.window.eval(runtime);await settle();
  const heading=doc.querySelector('.kline-title strong');assert.equal(heading.textContent,label);assert.equal(heading.dataset.tileTitle,label);
  assert.equal(doc.querySelector('script').textContent,before);assert.ok(doc.querySelector('canvas'));assert.equal(doc.querySelector('button').textContent,'日K');
  heading.textContent=code+' · '+name;await settle();assert.equal(heading.textContent,label);dom.window.close();
 }
});
test('multi-chart footers disappear and nested chart labels are repaired on load',async()=>{
 const dom=new JSDOM('<article class="kline-card"><iframe title="上证指数"></iframe><p class="card-source">1d · Fuyao A股指数日线 · 1792598400000</p></article><p class="researchSource">研究来源</p>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.requestAnimationFrame=()=>0;w.eval(runtime);const frame=w.document.querySelector('iframe');frame.contentDocument.open();frame.contentDocument.write(native('000001.SH','上证指数','CN'));frame.contentDocument.close();frame.dispatchEvent(new w.Event('load'));await settle();
 assert.equal(w.document.querySelector('.card-source'),null);assert.equal(w.document.querySelector('.researchSource').textContent,'研究来源');
 assert.equal(frame.contentDocument.querySelector('strong').textContent,'上证指数');dom.window.close();
});
test('missing A-share names retain the code rather than inventing a name',async()=>{
 const dom=new JSDOM(native('600000.SH','600000.SH','CN'),{runScripts:'outside-only',pretendToBeVisual:true});dom.window.requestAnimationFrame=()=>0;dom.window.eval(runtime);await settle();assert.equal(dom.window.document.querySelector('strong').textContent,'600000.SH');dom.window.close();
});

test('model-authored analysis headings remain intact instead of becoming stock labels',async()=>{
 const dom=new JSDOM('<title>上证指数：双底颈线待确认</title>'+native('000001.SH','上证指数','CN'),{runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.requestAnimationFrame=()=>0;dom.window.eval(runtime);await settle();
 assert.equal(dom.window.document.querySelector('strong').textContent,'上证指数：双底颈线待确认');
 dom.window.document.querySelector('strong').textContent='上证指数 · 000001.SH';await settle();
 assert.equal(dom.window.document.querySelector('strong').textContent,'上证指数：双底颈线待确认');dom.window.close();
});
test('a visible custom title survives even when a legacy document has no title metadata',async()=>{
 const dom=new JSDOM(native('AAPL','Apple Inc.','US').replace('>AAPL</strong>','>AAPL：回调后的量价结构</strong>'),{runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.requestAnimationFrame=()=>0;dom.window.eval(runtime);await settle();assert.equal(dom.window.document.querySelector('strong').textContent,'AAPL：回调后的量价结构');dom.window.close();
});
