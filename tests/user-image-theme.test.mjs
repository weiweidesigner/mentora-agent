import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const styles=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');
const rules=[styles.match(/\.userImageThumb\s*\{[^}]+\}/)[0],styles.match(/:root\[data-theme="dark"\] \.userImageThumb\s*\{[^}]+\}/)[0]].join('\n');
test('sent-image thumbnail follows light/dark theme without changing image content',()=>{
 const dom=new JSDOM(`<html data-theme="light"><head><style>${rules}</style></head><body><figure class="userImageThumb"><img src="original.png"></figure></body></html>`),w=dom.window,thumb=w.document.querySelector('figure');
 try{
  assert.equal(w.getComputedStyle(thumb).backgroundColor,'rgb(245, 246, 248)');
  w.document.documentElement.dataset.theme='dark';
  assert.equal(w.getComputedStyle(thumb).backgroundColor,'rgb(24, 24, 24)');
  assert.equal(w.getComputedStyle(thumb).borderTopColor,'rgb(48, 48, 48)');
  assert.equal(thumb.querySelector('img').getAttribute('src'),'original.png');
  w.document.documentElement.dataset.theme='light';assert.equal(w.getComputedStyle(thumb).backgroundColor,'rgb(245, 246, 248)');
 }finally{w.close();}
});
