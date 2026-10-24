import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const html=readFileSync(new URL('../app/static/cases/inspiration/report-ashare/inspiration-real-report-ashare-calendar.html',import.meta.url),'utf8');
test('A-share calendar case hides missing-data copy and preserves its snapshot and navigation',()=>{
  const dom=new JSDOM(html,{runScripts:'dangerously'}),d=dom.window.document;
  assert.equal(d.querySelector('h1').textContent,'2026 年 10 月');
  assert.equal(d.querySelector('.today .number').textContent,'14');
  assert.equal(d.querySelector('.today .numberText').textContent,'14');
  assert.match(html,/\.legend\{[^}]*justify-content:center/);
  assert.equal(d.querySelectorAll('.future').length,17);
  assert.equal(d.querySelectorAll('.outside .status').length,0);
  assert.doesNotMatch(d.body.textContent,/无数据|接口覆盖/);
  assert.equal(d.querySelectorAll('.legend span').length,2);
  assert.equal(d.querySelector('#next').disabled,true);
  d.querySelector('#previous').click();
  assert.equal(d.querySelector('h1').textContent,'2026 年 9 月');
  d.querySelector('#next').click();
  assert.equal(d.querySelectorAll('.today').length,1);
  assert.match(html,/:root\[data-theme="dark"\]/);
  assert.match(html,/\.day\.future \.number/);
  dom.window.close();
});
