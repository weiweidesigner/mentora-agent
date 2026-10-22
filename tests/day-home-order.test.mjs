import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../app/static/day-tasks.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');
const now='2026-10-21T02:48:58Z';
const base={market:'CN',stage:'live',scene:'live',resultScene:'live',assetType:'index',enabled:true,
  title:'任务',question:'分析市场',cadence:'trading',timeMode:'fixed',time:'11:00',timezone:'market'};
const finished=id=>({...base,id,title:id,resultVersion:'run-'+id,resultDate:'2026-10-21',summary:'已核验的结果',lastRun:{status:'success'}});
const waiting=(id,nextAt)=>({...base,id,title:id,nextAt,systemPreset:true});

async function setup(sceneTasks,tasks=[],width=1280){
  const dom=new JSDOM(html,{url:'https://example.com/mentora/',runScripts:'outside-only'});
  const w=dom.window;
  w.Date.now=()=>Date.parse(now);
  w.matchMedia=()=>({matches:width<=760});w.setInterval=()=>0;
  w.requestAnimationFrame=fn=>fn();w.structuredClone=structuredClone;
  w.fetch=async()=>({ok:true,json:async()=>({sceneTasks,tasks,markets:[{market:'CN',stage:'live'}],serverTime:now,pushPublicKey:''})});
  w.eval(source);await new Promise(resolve=>setTimeout(resolve,30));
  return dom;
}

for(const width of [390,1280])test(`executed cards precede waiting cards and waiting cards sort by time at ${width}px`,async()=>{
  const dom=await setup([finished('preset-done'),waiting('later','2026-10-21T06:30:00Z'),waiting('earlier','2026-10-21T03:00:00Z')],[finished('own-done')],width);
  const cards=[...dom.window.document.querySelectorAll('#dayPanel [data-task-open]')];
  assert.deepEqual(cards.map(c=>c.dataset.taskOpen),['preset-done','own-done','earlier','later']);
  assert.equal(cards[2].querySelector('.caseCardTop .caseCardTag').textContent,'等待执行 · 今天 11:00');
  assert.equal(cards[3].querySelector('.caseCardTop .caseCardTag').textContent,'等待执行 · 今天 14:30');
  assert.equal(cards[0].dataset.taskRun,'run-preset-done');
  dom.window.close();
});

test('running tasks stay prominent and missing schedule is not fabricated',async()=>{
  const running={...base,id:'running',activeRun:'live-run',lastRun:{status:'running'}};
  const dom=await setup([waiting('unknown',null),finished('done'),running]);
  const cards=[...dom.window.document.querySelectorAll('#dayPanel [data-task-open]')];
  assert.deepEqual(cards.map(c=>c.dataset.taskOpen),['running','done','unknown']);
  assert.equal(cards[0].dataset.taskRun,'live-run');
  assert.match(cards[2].textContent,/等待执行 · 时间待确定/);
  dom.window.close();
});

test('future dates are explicit and waiting labels share the completed card tag style',async()=>{
  const dom=await setup([waiting('tomorrow','2026-10-22T01:00:00Z')]);
  const status=dom.window.document.querySelector('.dayTaskStatus');
  assert.equal(status.querySelector('.caseCardTag').textContent,'等待执行 · 10月22日 09:00');
  assert.doesNotMatch(css.match(/\.dayTaskStatus\s*\{([^}]*)\}/)?.[1]||'',/font-size|min-height/);
  dom.window.close();
});
