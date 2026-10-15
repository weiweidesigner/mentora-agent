import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../app/static/index.html', import.meta.url), 'utf8');
const daySource = readFileSync(new URL('../app/static/day-tasks.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 25));

for (const width of [390, 760, 1280]) {
  test(`initial shell is correct before external scripts load at ${width}px`, () => {
    const dom = new JSDOM(html, {url:'https://example.com/veya/', runScripts:'dangerously', beforeParse(w) {
      w.matchMedia = query => ({matches:query.includes('min-width') ? width >= 761 : width <= 760});
    }});
    const shell = dom.window.document.querySelector('.shell');
    assert.equal(shell.classList.contains('sidebar-open'), width >= 761);
    assert.equal(shell.classList.contains('sidebar-collapsed'), width <= 760);
    dom.window.close();
  });
}

test('notification opens a read-only task conversation despite blocked storage and personal API failure', async () => {
  const dom = new JSDOM(html, {url:'https://example.com/veya/?dayShare=read-only-test-token',runScripts:'outside-only'});
  const w = dom.window, requests = [];
  Object.defineProperty(w, 'localStorage', {get() {throw new w.DOMException('storage disabled','SecurityError');}});
  w.setInterval = () => 0;
  w.matchMedia = () => ({matches:false});
  w.structuredClone = structuredClone;
  w.fetch = async url => {
    requests.push(url);
    if (url.endsWith('tasks')) return {ok:false,json:async()=>({detail:'personal API unavailable'})};
    return {ok:true,json:async()=>({taskId:'shared-task',runId:'shared-run',task:{id:'shared-task',title:'缓存分析',question:'原始问句',market:'CN',stage:'pre',cadence:'daily',time:'09:00',timeMode:'fixed',timezone:'market'},title:'缓存分析',question:'原始问句',cachedDate:'2026-10-15T04:00:00Z',answer:{interpretation:'保存的答案'}})};
  };
  w.eval(daySource);
  await tick();
  assert.equal(w.document.querySelector('#taskWorkspace').hidden,false);
  assert.match(w.document.querySelector('#taskThread').textContent,/原始问句/);
  assert.match(w.document.querySelector('#taskThread').textContent,/保存的答案/);
  assert.equal(w.document.querySelector('#taskRunNow').hidden,true);
  assert.equal(w.document.querySelectorAll('#taskThread .thinkingTrigger').length,0);
  assert.equal(requests[0], '/api/day/shared/read-only-test-token');
  assert.equal(w.location.search, '?dayShare=read-only-test-token');
  dom.window.close();
});

test('nginx canonical redirect preserves old notification parameters', () => {
  const nginx = readFileSync(new URL('../deploy/nginx-veya.conf',import.meta.url),'utf8');
  const canonical = readFileSync(new URL('../deploy/nginx-mentora.conf',import.meta.url),'utf8');
  assert.match(canonical,/location \/mentora\/ \{/);
  assert.match(nginx,/location = \/veya \{ return 302 \/mentora\/\$is_args\$args; \}/);
});
