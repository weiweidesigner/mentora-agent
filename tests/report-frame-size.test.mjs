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
