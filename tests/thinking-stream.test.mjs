import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {markup, bootstrap} from './helpers/thinking-stream-fixture.mjs';

function fixture(mobile = false) {
  const dom = new JSDOM(markup, {runScripts:'outside-only', pretendToBeVisual:true, url:'https://example.com'});
  if (mobile) Object.defineProperty(dom.window, 'innerWidth', {value:390});
  dom.window.eval(bootstrap);
  return dom;
}
const started = {callId:'shell-1', tool:'bash', phase:'started', thoughtSummary:'我会使用现有数据计算。完成后生成报告。', shellCommand:['python3', 'analysis.py']};

test('live flow separates complete model summary from an expandable real action', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, started);
  assert.equal(a.querySelector('.thinkingSummaryText').textContent, '用时 4分钟 29秒');
  assert.equal(a.querySelector('.thinkingSteps').hidden, false);
  assert.equal(a.querySelector('.activityThoughtSummary').textContent, started.thoughtSummary);
  assert.match(a.querySelector('.activityActionText').textContent, /^bash · python3 analysis.py$/);
  assert.ok(a.querySelector('.activityActionIcon svg'));
  assert.equal(a.querySelector('details').open, false);
  assert.match(a.querySelector('details').textContent, /python3.*analysis.py/s);
  a.querySelector('details').open = true;
  w.appendToolStep(a, {...started, phase:'completed', observation:'<img src=x onerror=alert(1)>'});
  assert.equal(a.querySelectorAll('.is-tool-step').length, 1);
  assert.equal(a.querySelector('details').open, true);
  assert.equal(a.querySelector('img'), null);
  assert.match(a.querySelector('.toolStepOutputBlock').textContent, /<img/);
  dom.window.close();
});

test('independent active tools do not complete each other and final flow collapses', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, started);
  w.appendToolStep(a, {...started, callId:'shell-2'});
  assert.equal(a.querySelectorAll('li.is-loading').length, 2);
  a.querySelector('details').open = true;
  w.finish();
  assert.equal(a.querySelector('.thinkingSteps').hidden, true);
  assert.equal(a.querySelectorAll('details[open], li.is-loading').length, 0);
  a.querySelector('.thinkingTrigger').click();
  assert.ok(w.document.querySelector('.shell.activity-open'));
  assert.equal(w.document.querySelector('#activityDrawer').getAttribute('aria-hidden'), 'false');
  assert.equal(w.document.querySelectorAll('#activityBody details').length, 2);
  dom.window.close();
});

test('live header collapses inline without opening a drawer, then expands again', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  a.querySelector('.thinkingTrigger').click();
  assert.equal(a.querySelector('.thinkingSteps').hidden, true);
  assert.equal(w.document.querySelector('.shell.activity-open'), null);
  w.updateThinkingSummary(a, '', {live:true});
  assert.equal(a.querySelector('.thinkingSteps').hidden, true);
  a.querySelector('.thinkingTrigger').click();
  assert.equal(a.querySelector('.thinkingSteps').hidden, false);
  dom.window.close();
});

test('mobile completed activity opens a modal overlay and restores trigger focus', () => {
  const dom = fixture(true), w = dom.window, a = w.article;
  w.appendToolStep(a, started); w.finish();
  a.querySelector('.thinkingTrigger').click();
  assert.equal(w.document.querySelector('#activityDrawer').getAttribute('aria-modal'), 'true');
  assert.equal(w.document.querySelector('.activityBackdrop').hidden, false);
  assert.equal(w.document.activeElement.id, 'activityClose');
  w.document.querySelector('#activityClose').click();
  assert.equal(w.document.querySelector('.activityBackdrop').hidden, true);
  assert.equal(w.document.activeElement, a.querySelector('.thinkingTrigger'));
  dom.window.close();
});

test('failed tool state survives completion and errors collapse live process', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, {...started, phase:'failed', observation:'Error'});
  w.finish();
  assert.equal(a.querySelectorAll('li.is-error').length, 1);
  w.showError(a, '执行中断');
  assert.equal(a.querySelector('.thinkingSteps').hidden, true);
  assert.ok(a.querySelector('.thinkingTrigger.is-error'));
  dom.window.close();
});

test('older saved tool traces retain their summary and use collapsed tool details', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  a.querySelector('.thinkingSteps').innerHTML = '<li class="is-tool-step is-done"><div class="activityStepTitle">核验数据</div><div class="activityDrawerOnly"><pre>真实历史输出</pre></div></li>';
  w.refreshSavedToolStepTitles(a.querySelector('.thinkingSteps'), 'zh-Hans');
  assert.equal(a.querySelector('.activityThoughtSummary').textContent, '核验数据');
  assert.equal(a.querySelector('details').open, false);
  assert.match(a.querySelector('details').textContent, /真实历史输出/);
  w.refreshSavedToolStepTitles(a.querySelector('.thinkingSteps'), 'zh-Hans');
  assert.equal(a.querySelectorAll('details').length, 1);
  dom.window.close();
});
