import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {markup, bootstrap} from './helpers/thinking-stream-fixture.mjs';

const styles=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');

function fixture(mobile = false) {
  const dom = new JSDOM(markup, {runScripts:'outside-only', pretendToBeVisual:true, url:'https://example.com'});
  if (mobile) Object.defineProperty(dom.window, 'innerWidth', {value:390});
  dom.window.eval(bootstrap);
  return dom;
}
const started = {callId:'shell-1', tool:'bash', phase:'started', thoughtSummary:'我会使用现有数据计算。完成后生成报告。', shellCommand:['python3', 'analysis.py']};

test('public thought stays verbatim with its corresponding tool visible underneath', () => {
  const dom=fixture(),w=dom.window,a=w.article;
  const thought='我先确认 A 股全市场快照的口径和当前时间，再根据实际返回的数据判断上午市场宽度与结构';
  a.dataset.publicThoughtText=thought;
  w.appendToolStep(a,{callId:'snapshot',tool:'screener',phase:'started',thoughtSummary:'核对执行入口的必填参数'});
  assert.match(a.querySelector('.thinkingSummaryText').textContent,/^已处理 /);
  assert.equal(a.querySelector('.thinkingCurrentTool').hidden,false);
  assert.equal(a.querySelector('.thinkingFlow').hidden,true);
  assert.match(a.querySelector('.thinkingFlow').textContent,/核对执行入口的必填参数/);
  assert.match(a.querySelector('.thinkingFlow').textContent,/screener/);
  a.querySelector('.thinkingTrigger').click();
  assert.equal(a.querySelector('.thinkingFlow').hidden,false);
  dom.window.close();
});

test('Deal tool names never replace the elapsed header or public timeline text', () => {
  const dom=fixture(),w=dom.window,a=w.article;
  const text='根据已取得的行情筛选符合条件的候选。';
  w.appendStep(a,text,'','loading','public-progress');
  w.appendToolStep(a,{callId:'deal-screen',tool:'screener',phase:'started'});
  assert.match(a.querySelector('.thinkingSummaryText').textContent,/^已处理 /);
  assert.match(a.querySelector('.thinkingFlow').textContent,new RegExp(text));
  w.appendToolStep(a,{callId:'deal-screen',tool:'screener',phase:'completed',thoughtSummary:'screener'});
  assert.match(a.querySelector('.thinkingSummaryText').textContent,/^已处理 /);
  assert.match(a.querySelector('.thinkingFlow').textContent,new RegExp(text));
  dom.window.close();
});

test('expanded completed thinking control points its chevron down', () => {
  assert.match(styles,/\.thinkingTrigger\[aria-expanded="true"\] \.thinkingChevron\s*\{[^}]*transform:\s*rotate\(45deg\)/);
  assert.match(styles,/\.thinkingTrigger\.is-thinking:hover \.thinkingChevron,[^}]*\.thinkingTrigger\.is-thinking\[aria-expanded="true"\] \.thinkingChevron\s*\{[^}]*opacity:\s*1/);
});

test('live progress shows one elapsed header with the full history initially collapsed', () => {
  const dom = fixture(), a = dom.window.article;
  assert.equal(a.querySelector('.thinkingElapsedLive'), null);
  assert.match(a.querySelector('.thinkingSummaryText').textContent, /^\u5df2\u5904\u7406 4\u5206\u949f 29\u79d2$/);
  assert.equal(a.querySelector('.thinkingFlow').hidden, true);
  dom.window.finish();
  assert.equal(a.querySelector('.thinkingSummaryText').textContent, '\u5df2\u5904\u7406 4\u5206\u949f 29\u79d2');
  assert.equal(a.querySelector('.thinkingFlow').hidden, true);
  dom.window.close();
});

test('inline expanded reasoning hides raw tool rows while retaining narrative summaries', () => {
  assert.match(styles, /\.thinkingFlow\.reasoningOnly[^{}]*\.activityToolRow[^{}]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(styles, /\.thinkingTrigger\.is-thinking \.thinkingChevron\s*\{[^}]*display:\s*none/);
});

test('processed timer starts at one second without changing recorded timing', () => {
  const dom=fixture(),w=dom.window,a=w.article;
  try {
    w.Date.now=()=>100000;
    for (const [elapsed,expected] of [[0,'1秒'],[1,'1秒'],[999,'1秒'],[1000,'1秒'],[1999,'1秒'],[2000,'2秒'],[60000,'1分钟 0秒']]) {
      a.dataset.startedAt=String(100000-elapsed);
      w.updateThinkingSummary(a,'',{live:true,clockOnly:true});
      assert.equal(a.querySelector('.thinkingSummaryText').textContent,`已处理 ${expected}`);
      assert.equal(a.dataset.startedAt,String(100000-elapsed));
    }
    a.dataset.cachedElapsedMs='120';
    w.updateThinkingSummary(a,'');
    assert.equal(a.querySelector('.thinkingSummaryText').textContent,'已处理 1秒');
    assert.equal(a.dataset.cachedElapsedMs,'120');
    a.dataset.elapsedUnrecorded='true';
    w.updateThinkingSummary(a,'');
    assert.equal(a.querySelector('.thinkingSummaryText').textContent,'查看执行记录');
  } finally { dom.window.close(); }
});

test('created file dot receives optical baseline correction beside diff stats', () => {
  assert.match(styles, /\.activityFileCreatedDot\s*\{[^}]*transform:\s*translateY\(-1px\)/);
});

test('live flow uses the latest model summary to disclose all reasoning inline', async () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, started);
  assert.match(a.querySelector('.thinkingSummaryText').textContent, /^已处理 /);
  assert.equal(a.querySelector('.thinkingSteps').hidden, true);
  a.querySelector('.thinkingTrigger').click();
  assert.equal(a.querySelector('.thinkingFlow').hidden, false);
  assert.equal(a.querySelector('.thinkingTrigger').getAttribute('aria-expanded'), 'true');
  assert.equal(a.querySelector('.activityReasoning'), null);
  assert.match(a.querySelector('.thinkingFlow').textContent, /我会使用现有数据计算/);
  assert.match(a.querySelector('.activityTool .activityActionText').textContent, /^正在运行 python3 analysis.py$/);
  assert.ok(a.querySelector('.activityActionIcon svg'));
  assert.equal(a.querySelector('.thinkingFlow details.activityTool').open, false);
  assert.match(a.querySelector('details').textContent, /python3.*analysis.py/s);
  a.querySelector('.activityTool').open = true;
  await new Promise(resolve => w.setTimeout(resolve, 0));
  w.appendToolStep(a, {...started, phase:'completed', observation:'<img src=x onerror=alert(1)>'});
  assert.equal(a.querySelectorAll('.thinkingSteps .is-tool-step').length, 1);
  assert.equal(a.querySelector('.thinkingFlow').hidden, false);
  assert.equal(a.querySelector('.activityTool').open, true);
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
  assert.equal(a.querySelectorAll('.thinkingSteps details[open], li.is-loading').length, 0);
  a.querySelector('.thinkingTrigger').click();
  assert.equal(w.document.querySelector('.shell.activity-open'), null);
  assert.equal(w.document.querySelector('#activityDrawer').getAttribute('aria-hidden'), 'true');
  assert.equal(a.querySelector('.thinkingFlow').hidden, false);
  assert.equal(a.querySelector('.thinkingTrigger').getAttribute('aria-expanded'), 'true');
  assert.equal(a.querySelectorAll('.thinkingFlow details.activityTool').length, 2);
  assert.equal(a.querySelectorAll('.thinkingFlow details.activityGroup').length, 1);
  a.querySelector('.thinkingTrigger').click();
  assert.equal(a.querySelector('.thinkingFlow').hidden, true);
  assert.equal(a.querySelector('.thinkingTrigger').getAttribute('aria-expanded'), 'false');
  dom.window.close();
});

test('manual live collapse is preserved until the user expands it again', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  const trigger = a.querySelector('.thinkingTrigger');
  a.dataset.activityInlineExpanded = 'false';
  w.updateThinkingSummary(a, '', {live:true});
  assert.equal(a.querySelector('.thinkingFlow').hidden, true);
  assert.equal(trigger.disabled, false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  trigger.click();
  assert.equal(a.querySelector('.thinkingFlow').hidden, false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(w.document.querySelector('.shell.activity-open'), null);
  w.appendToolStep(a, {...started, phase:'completed', observation:'computed'});
  assert.equal(a.querySelector('.thinkingFlow .activityNarrative').textContent, started.thoughtSummary);
  assert.equal(a.querySelector('.thinkingFlow .activityTool').open, false);
  assert.equal(a.querySelector('.thinkingFlow .activityLiveThinking'), null);
  w.appendToolStep(a, {callId:'progress-read', tool:'read', phase:'completed', params:['{"file_path":"source.json"}'], observation:'source'});
  assert.equal(a.querySelector('.thinkingFlow .activityGroup').open, false);
  assert.equal(a.querySelectorAll('.thinkingFlow details[open]').length, 0);
  w.appendToolStep(a, {...started, callId:'next-shell', thoughtSummary:'数据已取得，接下来验证计算。'});
  assert.equal(a.querySelectorAll('.thinkingFlow .activityNarrative').length, 2);
  assert.equal(a.querySelectorAll('.thinkingFlow .activityLiveThinking').length, 0);
  w.finish();
  assert.equal(trigger.disabled, false);
  assert.equal(a.querySelector('.thinkingFlow').hidden, true);
  trigger.click();
  assert.equal(a.querySelector('.thinkingFlow').hidden, false);
  assert.equal(a.querySelector('.thinkingFlow .activityLiveThinking'), null);
  assert.equal(a.querySelectorAll('.thinkingFlow details[open]').length, 0);
  dom.window.close();
});

test('mobile active progress stays inline and file differences open only on request', () => {
  const dom = fixture(true), w = dom.window, a = w.article;
  w.appendToolStep(a, {callId:'progress-file', tool:'file_change', phase:'completed', fileChanges:[
    {name:'result.json', relativePath:'outputs/result.json', path:'/srv/outputs/result.json', kind:'created', added:1, removed:0, diff:'@@ -0,0 +1 @@\n+{}', previewable:true}
  ]});
  a.querySelector('.thinkingTrigger').click();
  assert.equal(a.querySelector('.thinkingFlow').hidden, false);
  assert.equal(a.querySelector('.thinkingFlow .activityFileInline').hidden, true);
  assert.equal(a.querySelector('.thinkingTrigger').disabled, false);
  assert.equal(w.document.querySelector('#activityDrawer').getAttribute('aria-hidden'), 'true');
  w.appendStep(a, '报告已经生成，正在核对。', '', 'loading', 'progress-next');
  assert.equal(a.querySelector('.thinkingFlow .activityFileInline').hidden, true);
  assert.equal(a.querySelectorAll('.thinkingFlow .activityLiveThinking').length, 0);
  dom.window.close();
});

test('model activity does not add placeholder text between public stages', () => {
  const dom=fixture(),w=dom.window,a=w.article;
  const thinking=()=>a.querySelector('.thinkingFlow .activityLiveThinking');
  w.setModelActivity(a,'started');
  assert.equal(thinking(),null);
  w.setModelActivity(a,'completed');
  assert.equal(thinking(),null);
  w.appendStep(a,'先核对原始来源，再决定下一步。','','loading','summary-1');
  assert.equal(thinking(),null);
  w.appendToolStep(a,{...started,thoughtSummary:''});
  assert.equal(thinking(),null);
  w.appendToolStep(a,{...started,thoughtSummary:'',phase:'completed',observation:'data returned'});
  assert.equal(thinking(),null);
  w.setModelActivity(a,'started');
  assert.equal(thinking(),null);
  w.appendStep(a,'来源已核对，正在比较返回的证据。','','loading','summary-2');
  assert.equal(thinking(),null);
  assert.equal(a.querySelectorAll('.thinkingFlow .activityNarrative').length,2);
  w.setModelActivity(a,'started');
  assert.equal(thinking(),null);
  w.finish();
  assert.equal(thinking(),null);
  w.setModelActivity(a,'started');
  assert.equal(thinking(),null);
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

test('generic skill actions keep one verb and use the plug icon', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, {callId:'skill-1', tool:'skill', phase:'completed'});
  const action = a.querySelector('.thinkingFlow .activityActionText');
  assert.equal(action.textContent, '已调用 skill');
  const icon = a.querySelector('.thinkingFlow .activityActionIcon svg');
  assert.equal(icon.getAttribute('viewBox'), '0 0 1024 1024');
  assert.equal(icon.getAttribute('fill'), 'currentColor');
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

test('file changes distinguish created from edited files and open each preview independently', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, {callId:'files-1', tool:'file_change', phase:'completed', fileChanges:[
    {name:'new-report.py', relativePath:'outputs/new-report.py', path:'/srv/app/outputs/new-report.py', kind:'created', added:2, removed:0, diff:'--- /dev/null\n+++ new-report.py\n@@ -0,0 +1,2 @@\n+one\n+two', previewable:true},
    {name:'existing.json', relativePath:'outputs/existing.json', path:'/srv/app/outputs/existing.json', kind:'edited', added:1, removed:1, diff:'--- existing.json\n+++ existing.json\n@@ -1 +1 @@\n-old\n+new', previewable:true},
  ]});
  const rows = a.querySelectorAll('.thinkingFlow .activityFileChange');
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /已创建.*new-report\.py.*\+2.*-0/s);
  assert.match(rows[1].textContent, /已编辑.*existing\.json.*\+1.*-1/s);
  assert.equal(rows[1].querySelector('.activityFileChangeName').dataset.tooltip, '/srv/app/outputs/existing.json');
  rows[1].querySelector('.activityFileChangeName').click();
  assert.equal(w.lastOpenedFile.file.name, 'existing.json');
  assert.match(w.lastOpenedFile.file.open, /path=outputs%2Fexisting\.json/);
  assert.equal(w.lastOpenedFile.file.workspaceFile, true);
  rows[1].querySelector('.activityFileChangeExpand').click();
  assert.equal(rows[1].nextElementSibling.hidden, false);
  assert.equal(rows[1].nextElementSibling.querySelectorAll('.activityFileDiffTable .is-added').length, 1);
  assert.equal(rows[1].nextElementSibling.querySelectorAll('.activityFileDiffTable .is-removed').length, 1);
  dom.window.close();
});

test('deleted file rows do not expose the created-or-edited expansion arrow', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, {callId:'deleted-1', tool:'file_change', phase:'completed', fileChanges:[
    {name:'old.json', relativePath:'outputs/old.json', path:'/srv/app/outputs/old.json', kind:'deleted', added:0, removed:8, diff:'--- old.json\n+++ /dev/null\n@@ -1 +0,0 @@\n-old', previewable:false},
  ]});
  assert.equal(a.querySelector('.activityFileChangeExpand'), null);
  dom.window.close();
});

test('legacy DeepSeek write results recover the file row without exposing content arguments', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  const params = ['{"content":"def transform():\\n    return 1"'];
  w.appendToolStep(a, {callId:'write-old', tool:'write', phase:'completed', params,
    observation:'<path>/home/ubuntu/veya-agent/outputs/transform.py</path>\n<type>file</type>\n<content>\nCreated file\n</content>'});
  const row = a.querySelector('.thinkingFlow .activityFileChange');
  assert.ok(row);
  assert.match(row.textContent, /已创建.*transform\.py/s);
  assert.equal(row.querySelector('.activityFileChangeStats'), null);
  assert.doesNotMatch(a.querySelector('.thinkingFlow').textContent, /def transform|"content"/);
  row.querySelector('.activityFileChangeName').click();
  assert.match(w.lastOpenedFile.file.open, /path=outputs%2Ftransform\.py/);
  dom.window.close();
});

test('legacy completed edit actions migrate into clickable file previews', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, {callId:'edit-old', tool:'edit', phase:'completed', params:['{"file_path":"/home/ubuntu/veya-agent/outputs/transform_a_share_review_v2.py"}'], observation:'updated'});
  const row = a.querySelector('.thinkingFlow .activityFileChange');
  assert.ok(row);
  assert.match(row.textContent,/已编辑.*transform_a_share_review_v2\.py/s);
  row.querySelector('.activityFileChangeName').click();
  assert.equal(w.lastOpenedFile.file.name,'transform_a_share_review_v2.py');
  assert.match(w.lastOpenedFile.file.open,/path=outputs%2Ftransform_a_share_review_v2\.py/);
  dom.window.close();
});

test('search activities use the supplied magnifier icon', () => {
  const dom = fixture(), w = dom.window;
  const holder = w.document.createElement('div'); holder.innerHTML = w.activityActionIcon('external-search');
  assert.equal(holder.querySelector('svg').getAttribute('viewBox'), '0 0 1024 1024');
  assert.match(holder.querySelector('path').getAttribute('d'), /^M446\.112323/);
  const a = w.article;
  w.appendToolStep(a, {callId:'glob-1', tool:'glob', phase:'completed', params:['{"pattern":"*.py"}'], observation:'results'});
  assert.match(a.querySelector('.thinkingFlow .activityActionIcon path').getAttribute('d'), /^M446\.112323/);
  dom.window.close();
});

test('Deal skills retain their own icons and mixed groups show their actual operation', () => {
  const dom=fixture(), w=dom.window, a=w.article;
  w.appendToolStep(a,{callId:'account',skillId:'portfolio-account',tool:'portfolio-account',phase:'completed',input:{operation:'refresh'},output:{cash:100}});
  w.appendToolStep(a,{callId:'search',skillId:'external-search',tool:'external-search',phase:'completed',input:{query:'facts'},output:{answer:'facts'}});
  const group=a.querySelector('.activityGroupAction .activityActionIcon svg');
  assert.equal(group.getAttribute('viewBox'),'0 0 1024 1024');
  assert.match(group.querySelector('path').getAttribute('d'),/^M446\.112323/);
  const rows=a.querySelectorAll('.activityGroupItems .activityActionIcon path');
  assert.match(rows[0].getAttribute('d'),/^M639\.75/);
  assert.match(rows[1].getAttribute('d'),/^M446\.112323/);
  dom.window.close();
});

test('the latest live summary expands and collapses the complete reasoning history', async () => {
  const dom=fixture(),w=dom.window,a=w.article;
  w.appendToolStep(a,{...started,phase:'completed',observation:'first result'});
  w.appendStep(a,'现在开始核验第二阶段。','','loading','stage-2');
  const trigger=a.querySelector('.thinkingTrigger');
  assert.match(trigger.querySelector('.thinkingSummaryText').textContent,/^已处理 /);
  assert.equal(a.querySelector('.thinkingFlow').hidden,true);
  assert.match(a.querySelector('.thinkingCurrentTool').textContent,/第二阶段/);
  trigger.click();
  assert.equal(a.querySelector('.thinkingFlow').hidden,false);
  assert.match(a.querySelector('.thinkingFlow').textContent,/我会使用现有数据计算|first result/);
  w.appendStep(a,'现在开始第三阶段。','','loading','stage-3');
  assert.match(trigger.querySelector('.thinkingSummaryText').textContent,/^已处理 /);
  assert.equal(a.querySelector('.thinkingFlow').hidden,false);
  assert.match(a.querySelector('.thinkingFlow').textContent,/第二阶段/);
  trigger.click();
  assert.equal(a.querySelector('.thinkingFlow').hidden,true);
  w.finish();trigger.click();
  assert.equal(a.querySelector('.thinkingFlow .activityReasoning'),null);
  assert.equal(a.querySelectorAll('.thinkingFlow .activityNarrative').length,3);
  dom.window.close();
});

test('an earlier parallel call stays visible while the newest stage advances', () => {
  const dom=fixture(),w=dom.window,a=w.article;
  w.appendToolStep(a,{...started,callId:'parallel-earlier',thoughtSummary:'先启动长任务。'});
  w.appendStep(a,'同时核对另一项证据。','','loading','parallel-next');
  assert.match(a.querySelector('.thinkingFlow').textContent,/正在运行 python3 analysis.py/);
  w.appendToolStep(a,{...started,callId:'parallel-earlier',thoughtSummary:'先启动长任务。',phase:'completed',observation:'finished'});
  assert.match(a.querySelector('.thinkingFlow').textContent,/已运行 python3 analysis.py/);
  assert.equal(a.querySelector('.activityReasoning'),null);
  dom.window.close();
});

test('mixed command and file operations use read and edit icons', () => {
  const dom=fixture(),w=dom.window,a=w.article;
  w.appendToolStep(a,{...started,thoughtSummary:'',phase:'completed',observation:'done'});
  w.appendToolStep(a,{callId:'mixed-read',tool:'read',phase:'completed',params:['{"file_path":"source.py"}'],observation:'read'});
  assert.match(a.querySelector('.activityGroupAction .activityActionIcon path').getAttribute('d'),/^M12 5/);
  w.appendToolStep(a,{callId:'mixed-edit',tool:'edit',phase:'completed',params:['{"file_path":"source.py"}'],observation:'updated'});
  assert.match(a.querySelector('.activityGroupAction .activityActionIcon path').getAttribute('d'),/^m16 3/);
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

test('Shell commands expand independently of results and copy the full raw command in both views', async () => {
  const dom = fixture(), w = dom.window, a = w.article;
  const command = "python3 analysis.py\n  --input outputs/source.json\n  --output outputs/result.json";
  let copied = "";
  Object.defineProperty(w.navigator, 'clipboard', {value: {writeText: async text => { copied = text; }}});
  w.appendToolStep(a, {callId:'long-shell', tool:'bash', phase:'completed', params:[JSON.stringify({command})], observation:'Analysis complete'});
  let panel = a.querySelector('.thinkingFlow .activityCommandPanel');
  let disclosure = panel.querySelector('.activityShellCommand');
  assert.equal(panel.closest('details.activityTool').open, false);
  panel.closest('details.activityTool').querySelector('summary').click();
  assert.equal(disclosure.open, false);
  assert.equal(disclosure.querySelector('code').textContent, '$ ' + command);
  assert.equal(panel.querySelector('.toolStepOutputBlock').closest('.activityShellCommand'), null);
  disclosure.querySelector('summary').click();
  await new Promise(resolve => w.setTimeout(resolve, 0));
  assert.equal(disclosure.open, true);
  w.appendStep(a, '正在核对报告', '', 'loading', 'new-narrative');
  panel = a.querySelector('.thinkingFlow .activityCommandPanel');
  assert.equal(panel.querySelector('.activityShellCommand').open, true);
  panel.querySelector('.activityCommandCopy').click();
  await new Promise(resolve => w.setTimeout(resolve, 0));
  assert.equal(copied, command);
  assert.equal(panel.querySelector('.activityCommandCopy').getAttribute('aria-label'), '已复制');
  w.finish();
  Object.defineProperty(w, 'innerWidth', {value:390});
  w.openActivityDrawer(a);
  copied = '';
  const mobilePanel = w.document.querySelector('#activityBody .activityCommandPanel');
  mobilePanel.closest('details.activityTool').querySelector('summary').click();
  assert.equal(mobilePanel.querySelector('.activityShellCommand').open, false);
  mobilePanel.querySelector('.activityShellCommandToggle').click();
  assert.equal(mobilePanel.querySelector('.activityShellCommand').open, true);
  mobilePanel.querySelector('.activityCommandCopy').click();
  await new Promise(resolve => w.setTimeout(resolve, 0));
  assert.equal(copied, command);
  dom.window.close();
});

test('connection states stay hidden before and after research starts', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendStep(a, '正在连接Agent', '', 'loading', 'connect-agent');
  w.appendStep(a, '连接模型', '', 'loading', 'connect-model');
  assert.equal(a.querySelector('.thinkingSteps').children.length, 0);
  assert.doesNotMatch(a.querySelector('.thinkingFlow').textContent, /正在连接Agent|连接模型/);
  assert.equal(a.querySelector('.thinkingFlow').textContent, '');
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
  const details = a.querySelector('.thinkingFlow .activityTool'); details.open = true;
  w.updateThinkingSummary(a, '', {live:true, clockOnly:true});
  assert.equal(a.querySelector('.thinkingFlow .activityTool'), details);
  assert.equal(details.open, true);
  assert.equal(details.querySelector('summary').title, command);
  assert.equal(details.querySelector('.toolStepInput').textContent, '$ ' + command);
  dom.window.close();
});

test('incomplete calls do not acquire a success badge when a run stops', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, started); w.showStopped(a);
  a.querySelector('.thinkingTrigger').click();
  assert.match(a.querySelector('.thinkingFlow .activityToolState').textContent, /未记录完成结果/);
  assert.doesNotMatch(a.querySelector('.thinkingFlow .activityToolState').textContent, /成功/);
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

test('desktop inline replay remains expanded after synchronization and direct open never creates a sidebar', () => {
  const dom = fixture(), w = dom.window, a = w.article;
  w.appendToolStep(a, {...started, phase:'completed', observation:'done'}); w.finish();
  w.openActivityDrawer(a);
  w.syncActivityDrawer(a);
  w.updateThinkingSummary(a, '');
  assert.equal(a.querySelector('.thinkingFlow').hidden, false);
  assert.equal(a.querySelector('.thinkingTrigger').getAttribute('aria-expanded'), 'true');
  assert.equal(a.querySelector('.thinkingTrigger').getAttribute('aria-controls'), a.querySelector('.thinkingFlow').id);
  assert.equal(w.document.querySelector('.shell.activity-open'), null);
  assert.equal(w.document.querySelector('.activityBackdrop'), null);
  w.setInlineActivityExpanded(a, false);
  assert.equal(a.querySelector('.thinkingFlow').hidden, true);
  dom.window.close();
});

test('a later tool action is visible even after an earlier public answer block',()=>{
 const dom=fixture(),w=dom.window,a=w.article;try{
  a.answerTextStarted=true;a.dataset.activityPhase='answer';
  w.appendToolStep(a,{callId:'later-tool',tool:'read',phase:'started',thoughtSummary:'核对下一张图的数据口径'});
  assert.equal(a.dataset.activityPhase,'tool');
  assert.equal(a.querySelector('.thinkingCurrentTool').hidden,false);
  w.appendToolStep(a,{callId:'later-tool',tool:'read',phase:'completed',thoughtSummary:'已核对下一张图的数据口径'});
  assert.equal(a.querySelector('.thinkingCurrentTool').hidden,false);
 }finally{w.close();}
});
test('late progress classification is inserted before its actual downstream tool',()=>{
 const dom=fixture(),w=dom.window,a=w.article;try{
  const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
  w.eval(source.slice(source.indexOf('function renderPublicProgress('),source.indexOf('function renderStreamAnswerText(')));
  a.publicBlockOrder=new w.Map([['status',1]]);a.nextActivityOrder=1;
  w.appendToolStep(a,{callId:'read-data',tool:'read',phase:'started',thoughtSummary:'读取数据'});
  w.renderPublicProgress(a,{blockId:'status',text:'我先核对数据口径。'});
  const rows=[...a.querySelector('.thinkingSteps').children];
  assert.equal(rows[0].dataset.publicBlockId,'status');
  assert.equal(rows[1].dataset.toolCallId,'read-data');
  assert.equal(rows[0].classList.contains('is-done'),true);
 }finally{w.close();}
});

test('saved progress is placed between the same tool calls when history is restored',()=>{
 const dom=fixture(),w=dom.window,a=w.article;try{
  const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
  w.eval(source.slice(source.indexOf('function renderPublicProgress('),source.indexOf('function renderStreamAnswerText(')));
  w.eval(source.slice(source.indexOf('function replayOrderedStream('),source.indexOf('function streamVisualizationLane(')));
  w.appendToolStep(a,{callId:'one',tool:'read',phase:'completed'});
  w.appendToolStep(a,{callId:'two',tool:'read',phase:'completed'});
  a.activityEnded=true;
  w.replayOrderedStream(a,[{kind:'progress',id:'p1',data:{text:'先核对输入'}},{kind:'tool_step',id:'one',data:{callId:'one'}},{kind:'progress',id:'p2',data:{text:'再检查字段'}},{kind:'tool_step',id:'two',data:{callId:'two'}}],a.querySelector('.finalAnswer'));
  assert.deepEqual([...a.querySelector('.thinkingSteps').children].map(n=>n.dataset.publicBlockId||n.dataset.toolCallId),['p1','one','p2','two']);
 }finally{w.close();}
});
