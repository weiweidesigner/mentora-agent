import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {markup, bootstrap} from './helpers/thinking-stream-fixture.mjs';

function fixture() {
  const dom = new JSDOM(markup, {runScripts:'outside-only', pretendToBeVisual:true, url:'https://example.com'});
  dom.window.eval(bootstrap);
  return dom;
}

test('compact activity shows only the latest stage and its tools, with history available on click', () => {
  const dom=fixture(), w=dom.window, a=w.article;
  try {
    w.appendToolStep(a,{callId:'read',tool:'read',phase:'completed',thoughtSummary:'正在确认项目与运行环境',params:['README.md']});
    w.appendToolStep(a,{callId:'calculate',tool:'bash',phase:'started',thoughtSummary:'正在计算关键指标与对比关系',shellCommand:['python3','calculate.py']});
    const compact=a.querySelector('.thinkingCurrentTool'), full=a.querySelector('.thinkingFlow'), trigger=a.querySelector('.thinkingTrigger');
    assert.equal(compact.hidden,false);
    assert.equal(full.hidden,true);
    assert.equal(trigger.getAttribute('aria-expanded'),'false');
    assert.doesNotMatch(compact.textContent,/确认项目与运行环境|README/);
    assert.match(compact.textContent,/正在计算关键指标与对比关系/);
    assert.match(compact.textContent,/python3 calculate.py/);
    trigger.click();
    assert.equal(compact.hidden,true);
    assert.equal(full.hidden,false);
    assert.match(full.textContent,/确认项目与运行环境/);
    assert.match(full.textContent,/正在计算关键指标与对比关系/);
    trigger.click();
    assert.equal(full.hidden,true);
    assert.equal(compact.hidden,false);
  } finally {w.close();}
});

test('a new public stage replaces the compact stage and does not inherit the previous tool', () => {
  const dom=fixture(), w=dom.window, a=w.article;
  try {
    w.appendToolStep(a,{callId:'data',tool:'bash',phase:'completed',thoughtSummary:'获取市场数据',shellCommand:['python3','fetch.py']});
    w.appendStep(a,'数据已取得，接着计算指标。','','loading','next-stage');
    const compact=a.querySelector('.thinkingCurrentTool');
    assert.match(compact.textContent,/数据已取得，接着计算指标/);
    assert.doesNotMatch(compact.textContent,/fetch.py|获取市场数据/);
    w.appendToolStep(a,{callId:'metrics',tool:'bash',phase:'started',shellCommand:['python3','metrics.py']});
    assert.match(compact.textContent,/数据已取得，接着计算指标/);
    assert.match(compact.textContent,/metrics.py/);
    assert.equal(a.querySelector('.thinkingFlow').hidden,true);
    w.finish();
    assert.equal(compact.hidden,true);
    assert.equal(a.querySelector('.thinkingFlow').hidden,true);
    a.querySelector('.thinkingTrigger').click();
    assert.match(a.querySelector('.thinkingFlow').textContent,/fetch.py/);
  } finally {w.close();}
});

test('waiting creates no synthetic narrative and does not duplicate the elapsed header', () => {
  const dom=fixture(), w=dom.window, a=w.article;
  try {
    w.setModelActivity(a,'started');
    assert.equal(a.querySelector('.thinkingCurrentTool').textContent,'');
    assert.equal(a.querySelector('.activityLiveThinking'),null);
    assert.match(a.querySelector('.thinkingSummaryText').textContent,/^已处理 /);
    assert.equal(a.querySelector('.thinkingElapsedLive'),null);
  } finally {w.close();}
});

test('expanded history remains expanded when a newer stage arrives', () => {
  const dom=fixture(), w=dom.window, a=w.article;
  try {
    w.appendStep(a,'核对数据口径','','loading','first');
    a.querySelector('.thinkingTrigger').click();
    w.appendStep(a,'生成图表','','loading','second');
    assert.equal(a.querySelector('.thinkingFlow').hidden,false);
    assert.equal(a.querySelector('.thinkingCurrentTool').hidden,true);
    assert.match(a.querySelector('.thinkingFlow').textContent,/核对数据口径/);
    assert.match(a.querySelector('.thinkingFlow').textContent,/生成图表/);
  } finally {w.close();}
});
