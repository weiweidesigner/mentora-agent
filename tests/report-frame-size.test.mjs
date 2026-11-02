import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const app=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function resizeReportDocumentFrame(frame)'),app.indexOf('\nwindow.addEventListener("message", (event) => {',app.indexOf('function resizeReportDocumentFrame(frame)')));
test('native edge allowance does not repeatedly resize an embedded chart',()=>{
 const dom=new JSDOM('<iframe></iframe>',{runScripts:'outside-only'}),w=dom.window,frame=w.document.querySelector('iframe');
 const wrap=frame.contentDocument.createElement('main');frame.contentDocument.body.append(wrap);
 let intrinsic=352;wrap.getBoundingClientRect=()=>({height:intrinsic});
 frame.style.height='354px';frame.getBoundingClientRect=()=>({height:parseFloat(frame.style.height)});
 try{
  w.eval(source);w.resizeReportDocumentFrame(frame);
  assert.equal(frame.style.height,'354px');
  intrinsic=310;w.resizeReportDocumentFrame(frame);
  assert.equal(frame.style.height,'310px');
 }finally{w.close();}
});
test('line embed uses its measured labels instead of viewport-stretched document height',()=>{
 const dom=new JSDOM('<iframe></iframe>',{runScripts:'outside-only'}),w=dom.window,frame=w.document.querySelector('iframe');
 const root=frame.contentDocument.createElement('section');root.className='group-line-component';root.dataset.embedHeight='286';frame.contentDocument.body.append(root);
 frame.style.height='520px';frame.getBoundingClientRect=()=>({height:parseFloat(frame.style.height)});
 try{
  w.eval(source);w.resizeReportDocumentFrame(frame);
  assert.equal(frame.dataset.genericComponent,'line');
  assert.equal(frame.style.height,'286px');
  root.dataset.embedHeight='248';w.resizeReportDocumentFrame(frame);
  assert.equal(frame.style.height,'248px');
 }finally{w.close();}
});
test('share preview retains the compact line height',()=>{
 const dom=new JSDOM('<iframe class="reportDocumentFrame"></iframe>',{runScripts:'outside-only'}),w=dom.window,frame=w.document.querySelector('iframe');
 const root=frame.contentDocument.createElement('section');root.className='group-line-component';root.dataset.embedHeight='286';frame.contentDocument.body.append(root);
 frame.style.height='520px';frame.getBoundingClientRect=()=>({height:parseFloat(frame.style.height)});
 try{
  w.eval(readFileSync(new URL('../app/static/share-chart-layout.js',import.meta.url),'utf8'));w.resizeShareCharts();
  assert.equal(frame.style.height,'286px');
 }finally{w.close();}
});

test('custom section content can shrink below the old iframe viewport and grow again',()=>{
 const dom=new JSDOM('<iframe></iframe>',{runScripts:'outside-only'}),w=dom.window,frame=w.document.querySelector('iframe'),doc=frame.contentDocument;
 const section=doc.createElement('section');doc.body.append(section);doc.body.style.margin='0';
 let height=348;doc.body.getBoundingClientRect=()=>({top:0,bottom:height,height});
 Object.defineProperty(doc.body,'scrollHeight',{get:()=>height});
 Object.defineProperty(doc.documentElement,'scrollHeight',{get:()=>parseFloat(frame.style.height)});
 Object.defineProperty(doc.documentElement,'offsetHeight',{get:()=>parseFloat(frame.style.height)});
 frame.style.height='1300px';frame.getBoundingClientRect=()=>({height:parseFloat(frame.style.height)});
 try{
  w.eval(source);w.resizeReportDocumentFrame(frame);assert.equal(frame.style.height,'348px');
  height=510;w.resizeReportDocumentFrame(frame);assert.equal(frame.style.height,'510px');
  height=290;w.resizeReportDocumentFrame(frame);assert.equal(frame.style.height,'290px');
 }finally{w.close();}
});

test('share export measures arbitrary normal-flow content independently of frame viewport',()=>{
 const dom=new JSDOM('<iframe class="reportDocumentFrame"></iframe>',{runScripts:'outside-only'}),w=dom.window,frame=w.document.querySelector('iframe'),doc=frame.contentDocument;
 doc.body.style.margin='0';doc.body.append(doc.createElement('section'));
 doc.body.getBoundingClientRect=()=>({top:0,bottom:360,height:360});
 Object.defineProperty(doc.body,'scrollHeight',{value:360});
 Object.defineProperty(doc.documentElement,'scrollHeight',{value:1400});
 frame.style.height='1400px';frame.getBoundingClientRect=()=>({height:parseFloat(frame.style.height)});
 try{w.eval(readFileSync(new URL('../app/static/share-chart-layout.js',import.meta.url),'utf8'));w.resizeShareCharts();assert.equal(frame.style.height,'360px');}finally{w.close();}
});

test('mind map frames grant fullscreen in chat and sharing',()=>{
 for(const shared of [false,true]){
  const dom=new JSDOM('<iframe class="reportDocumentFrame"></iframe>',{runScripts:'outside-only'}),w=dom.window,frame=w.document.querySelector('iframe');
  frame.contentDocument.body.innerHTML='<div data-mind-map-container="true"></div>';
  try{
   if(shared){w.eval(readFileSync(new URL('../app/static/share-chart-layout.js',import.meta.url),'utf8'));w.resizeShareCharts();}
   else{w.eval(source);w.resizeReportDocumentFrame(frame);}
   assert.equal(frame.allowFullscreen,true);
  }finally{w.close();}
 }
});

for (const shared of [false,true]) test(`complete table uses its bounded height and enables fullscreen (share=${shared})`,()=>{
 const dom=new JSDOM('<iframe class="reportDocumentFrame"></iframe>',{runScripts:'outside-only'}),w=dom.window,frame=w.document.querySelector('iframe');
 const root=frame.contentDocument.createElement('section');root.className='data-table-component';frame.contentDocument.body.append(root);
 root.getBoundingClientRect=()=>({height:426});frame.style.height='1600px';frame.getBoundingClientRect=()=>({height:parseFloat(frame.style.height)});
 try{
  if(shared){w.eval(readFileSync(new URL('../app/static/share-chart-layout.js',import.meta.url),'utf8'));w.resizeShareCharts();}
  else{w.eval(source);w.resizeReportDocumentFrame(frame);}
  assert.equal(frame.allowFullscreen,true);assert.equal(frame.style.height,'426px');
 }finally{w.close();}
});
