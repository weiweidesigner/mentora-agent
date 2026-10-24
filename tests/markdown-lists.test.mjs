import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function formatInsight('),source.indexOf('\nfunction decodeHtml('));

function render(markdown){
  const dom=new JSDOM('',{url:'https://example.com/mentora/',runScripts:'outside-only'});
  dom.window.eval(code);
  const root=dom.window.document.createElement('div');
  root.innerHTML=dom.window.formatInsight(markdown);
  return {dom,root};
}

test('ordered Markdown lists continue across blank lines',()=>{
  const s=render('## 关键观察点\n\n1. 第一点\n\n2. 第二点\n\n3. 第三点');
  assert.equal(s.root.querySelectorAll('ol').length,1);
  assert.deepEqual([...s.root.querySelectorAll('ol > li')].map(item=>item.textContent),['第一点','第二点','第三点']);
  s.dom.window.close();
});

test('a paragraph after a loose list starts a new text block',()=>{
  const s=render('1. 第一点\n\n2. 第二点\n\n后续说明');
  assert.equal(s.root.querySelectorAll('ol').length,1);
  assert.equal(s.root.querySelectorAll('ol > li').length,2);
  assert.equal(s.root.querySelector('p').textContent,'后续说明');
  s.dom.window.close();
});
