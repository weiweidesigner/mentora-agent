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

test('live flow separates complete model summary from an expandable real action', async () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, started);
  assert.equal(a.querySelector('.thinkingSummaryText').textContent, '用时 4分钟 29秒');
  assert.equal(a.querySelector('.thinkingSteps').hidden, true);
  assert.equal(a.querySelector('.thinkingFlow').hidden, false);
  assert.equal(a.querySelector('.activityNarrative p').textContent, started.thoughtSummary);
  assert.match(a.querySelector('.activityActionText').textContent, /^正在运行 python3 analysis.py$/);
  assert.ok(a.querySelector('.activityActionIcon svg'));
  assert.equal(a.querySelector('details').open, false);
  assert.match(a.querySelector('details').textContent, /python3.*analysis.py/s);
  a.querySelector('details').open = true;
  await new Promise(resolve => w.setTimeout(resolve, 0));
  w.appendToolStep(a, {...started, phase:'completed', observation:'<img src=x onerror=alert(1)>'});
  assert.equal(a.querySelectorAll('.thinkingSteps .is-tool-step').length, 1);
  assert.equal(a.querySelector('details').open, true);
  assert.equal(a.querySelector('img'), null);
  assert.match(a.querySelector('.toolStepOutputBlock').textContent, /<img/);
  dom.window.close();
});

test('independent active tools do not complete each other and final flow collapses', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, started);
  w.appendToolStep(a, {...started, callId:'shell-2'});
  assert.equal(a.querySelectorAll('.thinkingSteps li.is-loading').length, 2);
  a.querySelector('details').open = true;
  w.finish();
  assert.equal(a.querySelector('.thinkingSteps').hidden, true);
  assert.equal(a.querySelectorAll('details[open], li.is-loading').length, 0);
  a.querySelector('.thinkingTrigger').click();
  assert.ok(w.document.querySelector('.shell.activity-open'));
  assert.equal(w.document.querySelector('#activityDrawer').getAttribute('aria-hidden'), 'false');
  assert.equal(w.document.querySelectorAll('#activityBody details.activityTool').length, 2);
  assert.equal(w.document.querySelectorAll('#activityBody details.activityGroup').length, 1);
  dom.window.close();
});

test('live header collapses inline without opening a drawer, then expands again', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  a.querySelector('.thinkingTrigger').click();
  assert.equal(a.querySelector('.thinkingFlow').hidden, true);
  assert.equal(w.document.querySelector('.shell.activity-open'), null);
  w.updateThinkingSummary(a, '', {live:true});
  assert.equal(a.querySelector('.thinkingFlow').hidden, true);
  a.querySelector('.thinkingTrigger').click();
  assert.equal(a.querySelector('.thinkingFlow').hidden, false);
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
  assert.equal(a.querySelectorAll('.thinkingSteps li.is-error').length, 1);
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
  assert.match(a.querySelector('.activityActionText').textContent, /正在运行 python3 analysis.py/);
  const text = '先计算样本缺失比例。再解释它对结论的影响。';
  w.appendToolStep(a, {...started, callId:'genuine', thoughtSummary:text});
  assert.equal(a.querySelector('.activityThoughtSummary').textContent, text);
  dom.window.close();
});

test('progress and tool summaries render once despite whitespace or terminal punctuation', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendStep(a, '全市场 5580 只个股已取到', '', 'loading', 'progress-1');
  w.appendToolStep(a, {...started, thoughtSummary:'全市场5580只个股已取到。'});
  assert.equal(a.querySelectorAll('.thinkingFlow .activityNarrative').length, 1);
  assert.equal(a.querySelector('.thinkingFlow .activityNarrative').textContent, '全市场 5580 只个股已取到');
  assert.equal(a.querySelectorAll('.thinkingFlow .activityTool').length, 1);
  dom.window.close();
});

test('adjacent calls form one truthful group between model paragraphs', async () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, {...started, phase:'completed', observation:'computed'});
  w.appendToolStep(a, {callId:'read-1', tool:'read', phase:'completed', params:['{"file_path":"results.json"}']});
  const group = a.querySelector('.thinkingFlow .activityGroup');
  assert.equal(group.open, false);
  assert.match(group.querySelector('summary').textContent, /运行 1 条命令、读取 1 个文件/);
  assert.equal(group.querySelectorAll('.activityTool').length, 2);
  group.open = true; await new Promise(resolve => w.setTimeout(resolve, 0));
  w.appendToolStep(a, {callId:'edit-1', tool:'write', phase:'completed', params:['{"file_path":"report.html"}']});
  assert.equal(a.querySelector('.thinkingFlow .activityGroup').open, true);
  w.appendToolStep(a, {...started, callId:'next', thoughtSummary:'接下来核验输出文件。'});
  assert.equal(a.querySelectorAll('.thinkingFlow .activityNarrative').length, 2);
  assert.equal(a.querySelectorAll('.thinkingFlow .activityGroup').length, 1);
  assert.match(a.querySelector('.thinkingFlow').textContent, /接下来核验输出文件/);
  dom.window.close();
});

test('native bash JSON becomes one Shell panel with plain command, output and real status', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  const call = {callId:'native', tool:'bash', phase:'started', params:[JSON.stringify({command:"date -d @1792666513 '+%Y-%m-%d %H:%M:%S %Z'"})]};
  w.appendToolStep(a, call);
  let panel = a.querySelector('.thinkingFlow .activityCommandPanel');
  assert.equal(panel.querySelector('.activityCommandLabel').textContent, 'Shell');
  assert.match(panel.querySelector('.toolStepInput').textContent, /^\$ date -d/);
  assert.doesNotMatch(panel.textContent, /"command"|工具返回/);
  assert.equal(panel.querySelector('.activityToolState').dataset.status, 'running');
  w.appendToolStep(a, {...call, phase:'completed', observation:'2026-10-22 18:55:13 CST'});
  panel = a.querySelector('.thinkingFlow .activityCommandPanel');
  assert.equal(a.querySelectorAll('.thinkingFlow .activityCommandPanel').length, 1);
  assert.match(panel.querySelector('.toolStepOutputBlock').textContent, /2026-10-22/);
  assert.equal(panel.querySelector('.activityToolState').dataset.status, 'completed');
  assert.match(panel.querySelector('.activityToolState').textContent, /✓ 成功/);
  dom.window.close();
});

test('only the current connection state is visible and it disappears when research starts', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendStep(a, '正在连接Agent', '', 'loading', 'connect-agent');
  w.appendStep(a, '连接模型', '', 'loading', 'connect-model');
  assert.equal(a.querySelector('.thinkingFlow').textContent, '连接模型');
  w.appendToolStep(a, started);
  assert.doesNotMatch(a.querySelector('.thinkingFlow').textContent, /正在连接Agent|连接模型/);
  w.finish(); a.querySelector('.thinkingTrigger').click();
  assert.doesNotMatch(w.document.querySelector('#activityBody').textContent, /正在连接Agent|连接模型/);
  dom.window.close();
});

test('clock ticks preserve the current disclosure DOM and long commands remain available', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  const command = 'python3 analysis.py --input /outputs/' + 'long-path/'.repeat(40) + 'source.json';
  w.appendToolStep(a, {...started, shellCommand:[], params:[JSON.stringify({command})]});
  const details = a.querySelector('.thinkingFlow details'); details.open = true;
  w.updateThinkingSummary(a, '', {live:true, clockOnly:true});
  assert.equal(a.querySelector('.thinkingFlow details'), details);
  assert.equal(details.open, true);
  assert.equal(details.querySelector('summary').title, command);
  assert.equal(details.querySelector('.toolStepInput').textContent, '$ ' + command);
  dom.window.close();
});

test('incomplete calls do not acquire a success badge when a run stops', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, started); w.showStopped(a);
  a.querySelector('.thinkingTrigger').click();
  assert.match(w.document.querySelector('#activityBody .activityToolState').textContent, /未记录完成结果/);
  assert.doesNotMatch(w.document.querySelector('#activityBody .activityToolState').textContent, /成功/);
  dom.window.close();
});

test('historical Shell inputs migrate into the same unified panel without inventing completion', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  const trace = a.querySelector('.thinkingSteps');
  trace.innerHTML = '<li class="is-tool-step is-done"><div class="activityStepTitle">核对样本口径</div><div class="activityDrawerOnly"><div class="toolStepDetail"><div class="toolStepBlock"><div class="toolStepBlockLabel">Shell</div><pre><code>{"command":"python3 verify.py"}</code></pre></div><div class="toolStepOutputBlock">data verified</div></div></div></li>';
  w.refreshSavedToolStepTitles(trace, 'zh-Hans');
  w.updateThinkingSummary(a, '', {live:true});
  const panel = a.querySelector('.thinkingFlow .activityCommandPanel');
  assert.equal(panel.querySelector('.activityCommandLabel').textContent, 'Shell');
  assert.equal(panel.querySelector('.toolStepInput').textContent, '$ python3 verify.py');
  assert.match(panel.querySelector('.toolStepOutputBlock').textContent, /data verified/);
  assert.equal(panel.querySelector('.activityToolState').textContent, '已返回结果');
  dom.window.close();
});
