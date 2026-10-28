import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const css=readFileSync(new URL('../app/static/image-viewer.css',import.meta.url),'utf8');
const script=readFileSync(new URL('../app/static/image-viewer.js',import.meta.url),'utf8');
function fixture(){
 const d=new JSDOM(`<style>svg{display:block}</style><style>${css}</style>`,{url:'https://mentora.example/',runScripts:'outside-only',pretendToBeVisual:true});
 d.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 d.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 d.window.eval(script);return d;
}
function visibleChecks(w){return [...w.document.querySelectorAll('.iv-menu button')].filter(b=>{const s=w.getComputedStyle(b.querySelector('svg'));return s.display!=='none'&&s.visibility!=='hidden';}).map(b=>b.dataset.zoom);}
test('only the selected zoom has a visible SVG tick, including while the image loads',()=>{
 const d=fixture(),w=d.window;try{
  w.MentoraImageViewer.open({original:'https://images.example/photo.png'});
  assert.deepEqual(visibleChecks(w),['fit']);
  for(const value of ['25','50','100','150','200','fit']){
   w.document.querySelector(`[data-zoom="${value}"]`).click();
   assert.deepEqual(visibleChecks(w),[value]);
   assert.equal(w.document.querySelectorAll('.iv-menu [aria-checked="true"]').length,1);
  }
  w.document.querySelector('.iv-close').click();
  w.MentoraImageViewer.open({original:'https://images.example/other.png'});
  assert.deepEqual(visibleChecks(w),['fit']);
 }finally{w.document.querySelector('.iv-close')?.click();w.close();}
});
