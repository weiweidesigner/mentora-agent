import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../app/static/day-tasks.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));

test('first paint includes accessible, non-interactive skeletons and reduced-motion support',()=>{
  const dom=new JSDOM(html),d=dom.window.document;
  for(const id of ['dayPanel','inspirationPanel']){
    const panel=d.getElementById(id);
    assert.equal(panel.getAttribute('aria-busy'),'true');
    assert.equal(panel.querySelectorAll('.homeSkeletonCard').length,3);
    assert.equal(panel.querySelector('.homeSkeleton').getAttribute('aria-hidden'),'true');
    assert.equal(panel.querySelectorAll('.homeSkeleton :is(button,a,input)').length,0);
  }
  assert.doesNotMatch(html,/正在加载已生成的结果|正在加载精选案例…/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\s*\{\s*\.skeletonLine,\.homeContentReady\s*\{\s*animation:none/);
  dom.window.close();
});

for(const fails of [false,true])test(`task skeleton survives header ticks and clears on ${fails?'failure':'success'}`,async()=>{
  const dom=new JSDOM(html,{url:'https://example.com/',runScripts:'outside-only'}),w=dom.window;
  w.matchMedia=()=>({matches:false});
  const intervals=[];w.setInterval=fn=>{intervals.push(fn);return intervals.length;};
  let settle;w.fetch=()=>new Promise((resolve,reject)=>{settle=()=>fails?reject(new Error('offline')):resolve({ok:true,json:async()=>({tasks:[],sceneTasks:[],markets:[{market:'CN',stage:'rest',closed:true}],serverTime:new Date().toISOString()})});});
  w.eval(source);
  intervals[0]();
  const panel=w.document.getElementById('dayPanel');
  assert.ok(panel.querySelector('.homeSkeleton'));
  settle();await tick();
  assert.equal(panel.getAttribute('aria-busy'),'false');
  assert.equal(panel.querySelector('.homeSkeleton'),null);
  assert.match(panel.textContent,fails?/自动重试/:/暂无任务/);
  dom.window.close();
});
