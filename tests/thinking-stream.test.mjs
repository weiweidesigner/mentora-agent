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

test('legacy screenshot labels and engine descriptions are removed, not promoted to model summaries', () => {
  const dom = fixture(), w = dom.window, a = w.article, list = a.querySelector('.thinkingSteps');
  list.innerHTML = `<li class="is-agentchat-step"><div class="activityStepTitle">AutoGen AgentChat · Agent 运行 · Root Agent</div><div class="activityStepDetail">DeepSeek Harness 使用 deepseek-flash 开始处理</div></li>
    <li class="is-tool-step"><p class="activityThoughtSummary">正在执行本地计算</p><details class="activityTool"><summary><span class="activityActionText">Tool</span></summary><div class="toolStepBlock"><span class="toolStepBlockLabel">Shell</span><pre>python3 analysis.py</pre></div></details></li>
    <li class="is-tool-step"><div class="activityStepTitle">正在处理数据与准备分析</div><div class="activityDrawerOnly">已有结果</div></li>
    <li class="is-tool-step"><div class="activityStepTitle">正在执行write</div><div class="activityDrawerOnly">真实写入结果</div></li>
    <li class="is-tool-step"><div class="activityStepTitle">正在检查项目与运行环境</div></li>`;
  w.refreshSavedToolStepTitles(list, 'zh-Hans');
  assert.doesNotMatch(list.textContent, /正在执行本地计算|正在处理数据与准备分析|正在执行write|正在检查项目与运行环境|DeepSeek Harness|AutoGen AgentChat|Tool/);
  assert.equal(list.dataset.legacyActivity, 'true');
  assert.match(list.textContent, /shell/);
  assert.match(list.textContent, /write/);
  assert.match(list.textContent, /已有结果|真实写入结果/);
  assert.equal(list.querySelectorAll('.activityThoughtSummary').length, 0);
  dom.window.close();
});

test('live canned summaries are omitted while model wording stays unchanged', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, {...started, thoughtSummary:'正在执行本地计算'});
  assert.equal(a.querySelector('.activityThoughtSummary'), null);
  assert.match(a.querySelector('.activityActionText').textContent, /bash · python3 analysis.py/);
  const text = '先计算样本缺失比例。再解释它对结论的影响。';
  w.appendToolStep(a, {...started, callId:'genuine', thoughtSummary:text});
  assert.equal(a.querySelector('.activityThoughtSummary').textContent, text);
  dom.window.close();
});
