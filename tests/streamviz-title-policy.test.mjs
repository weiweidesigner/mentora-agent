import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {hasAuthoredReportTitle, applyStreamTitlePolicy} from '../frontend/streamviz-title-policy.mjs';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../frontend/streamviz-runtime.mjs', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{name: 'raw-runtime-styles', setup(builder) {
    builder.onResolve({filter: /\?raw$/}, args => ({path: resolve(dirname(args.importer), args.path.replace(/\?raw$/, '')), namespace: 'raw-style'}));
    builder.onLoad({filter: /.*/, namespace: 'raw-style'}, args => ({contents: readFileSync(args.path, 'utf8'), loader: 'text'}));
  }}],
});
const {buildRuntimeDocument} = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const title = '最近一周美股财报：近七成公司EPS超预期';

function hasTitle(html, expected = title) {
  const dom = new JSDOM(html);
  try {return hasAuthoredReportTitle(dom.window.document.body, expected);} finally {dom.window.close();}
}

test('authored report title takes precedence, including formatting and equivalent punctuation', () => {
  assert.equal(hasTitle(`<header><p>美股 · 日期</p><h1>${title}</h1></header>`), true);
  assert.equal(hasTitle('<h2>最近一周美股财报: <strong>近七成公司EPS超预期</strong></h2>'), true);
  assert.equal(hasTitle('<h1>报告自己拟定的标题</h1>'), true);
  assert.equal(hasTitle(`<div role="heading" aria-level="1">${title}</div>`), true);
});

test('section, metadata, hidden and code-example titles do not remove the fallback report title', () => {
  for (const html of ['<h2>每日财报数量</h2>', `<title>${title}</title><p>正文</p>`,
    `<h1 hidden>${title}</h1>`, `<div aria-hidden="true"><h1>${title}</h1></div>`,
    `<div style="display:none"><h1>${title}</h1></div>`, `<h1 class="sr-only">${title}</h1>`,
    `<template><h1>${title}</h1></template>`, `<pre><h1>${title}</h1></pre>`, '<h1></h1>']) {
    assert.equal(hasTitle(html), false, html);
  }
});

function fixture() {
  const dom = new JSDOM(buildRuntimeDocument('title-test'), {runScripts: 'dangerously', pretendToBeVisual: true});
  const w = dom.window;
  return {w, root: w.document.querySelector('#root'), async update(html, final = false, suppliedTitle = title) {
    w.dispatchEvent(new w.MessageEvent('message', {data: {type: 'visualize-widget:update', id: 'title-test', html, final, title: suppliedTitle}}));
    await new Promise(resolve => setTimeout(resolve, 35));
  }};
}

test('actual iframe stream replaces its provisional title as the report heading arrives and remains deduplicated at final', async () => {
  const f = fixture();
  try {
    await f.update('<main><p>正在准备正文</p></main>');
    assert.equal(f.root.querySelector('[data-visualize-title]')?.textContent, title);
    await f.update(`<main><header><p>美股 · 日期</p><h1>${title}</h1></header><p>正文</p></main>`);
    assert.equal(f.root.querySelectorAll('[data-visualize-title]').length, 0);
    assert.equal(f.root.querySelector('h1')?.textContent, title);
    await f.update(`<main><header><p>美股 · 日期</p><h1>${title}</h1></header><p>正文</p></main>`, true);
    assert.equal(f.root.querySelectorAll('h1,h2').length, 1);
    assert.match(f.root.textContent, /美股 · 日期/);
  } finally {f.w.close();}
});

test('saved HTML keeps its heading and heading-free charts keep the generated title', async () => {
  const f = fixture();
  try {
    await f.update(`<main><h1>${title}</h1><h2>关键证据</h2><table><tr><td>数据</td></tr></table></main>`, true);
    assert.equal(f.root.querySelectorAll('[data-visualize-title]').length, 0);
    assert.equal(f.root.querySelectorAll('h2').length, 1);
    await f.update('<section><h2>每日财报数量</h2><p>图表</p></section>', true, '财报周报');
    assert.equal(f.root.querySelector('[data-visualize-title]')?.textContent, '财报周报');
    assert.equal(f.root.querySelectorAll('h2').length, 2);
  } finally {f.w.close();}
});

test('runtime adapter fails explicitly if an upstream upgrade changes the insertion point', () => {
  assert.throws(() => applyStreamTitlePolicy('unrelated runtime'), /review the pinned runtime/);
});

test('saved navigation cards are normalized inside the real runtime without a second card title', async () => {
  const f=fixture();
  try {
    await f.update('<main><a class="entry" href="https://www.ainvest.com/market/calendar/earnings/" target="_blank" rel="noopener noreferrer"><svg class="icon"></svg><span class="name">财报日历</span><svg class="arrow"></svg></a></main>',true,'财报日历');
    assert.equal(f.root.querySelectorAll('.mentoraNavigationCard').length,1);
    assert.equal(f.root.querySelectorAll('.mentoraActionDirection').length,1);
    assert.equal(f.root.querySelectorAll('[data-visualize-title]').length,0);
    assert.equal(f.root.querySelectorAll('[data-mentora-action-cards]').length,1);
  } finally {f.w.close();}
});
