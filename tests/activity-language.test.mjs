import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {markup, bootstrap} from './helpers/thinking-stream-fixture.mjs';
const english='Copy relative chart into delivery directory';
const command='cp outputs/data/chart.html outputs/generated/chart.html';
function fixture(){const dom=new JSDOM(markup,{runScripts:'outside-only',pretendToBeVisual:true,url:'https://example.com'});dom.window.eval(bootstrap);return dom;}
test('Chinese live tools keep real commands without showing English public descriptions',()=>{
 const dom=fixture(),w=dom.window,a=w.article;
 try{
  w.appendToolStep(a,{callId:'copy',tool:'bash',phase:'started',thoughtSummary:english,shellCommand:['cp','outputs/data/chart.html','outputs/generated/chart.html']});
  assert.doesNotMatch(a.textContent,/Copy relative/);
  assert.match(a.querySelector('.activityActionText').textContent,/正在运行 cp/);
  w.appendToolStep(a,{callId:'copy',tool:'bash',phase:'completed',thoughtSummary:'将图表复制到交付目录',observation:'done'});
  assert.match(a.querySelector('.activityNarrative').textContent,/将图表复制到交付目录/);
  assert.equal(a.querySelector('.thinkingSteps li').dataset.toolArgument,command);
 }finally{dom.window.close();}
});
test('saved English tool titles migrate without losing actions or requesting a new trace',()=>{
 const dom=fixture(),w=dom.window,a=w.article,list=a.querySelector('.thinkingSteps');
 try{
  list.innerHTML='<li class="is-tool-step" data-tool-name="bash"><p class="activityThoughtSummary"></p><details class="activityTool"><summary class="activityActionText">已运行 cp chart.html</summary><pre>cp chart.html</pre></details></li>';
  list.querySelector('p').textContent=english;
  w.refreshSavedToolStepTitles(list,'zh-CN');
  assert.equal(list.querySelector('.activityThoughtSummary'),null);
  assert.match(list.textContent,/已运行 cp chart.html/);
  assert.equal(list.dataset.legacyActivity,undefined);
  assert.doesNotMatch(w.buildActivityFlow(a),/Copy relative/);
 }finally{dom.window.close();}
});
test('legacy command detail blocks remain intact during language migration',()=>{
 const dom=fixture(),w=dom.window,list=w.article.querySelector('.thinkingSteps');
 try{
  list.innerHTML='<li class="is-tool-step" data-tool-name="bash"><p class="activityStepTitle">Check whether copied chart exists</p><div class="activityStepDetail"><pre>ls outputs/generated/chart.html</pre></div></li>';
  w.refreshSavedToolStepTitles(list,'zh-CN');
  assert.match(list.querySelector('details').textContent,/ls outputs\/generated\/chart.html/);
  assert.doesNotMatch(list.textContent,/Check whether/);
 }finally{dom.window.close();}
});
test('English conversations and Chinese summaries with technical names keep their wording',()=>{
 const dom=fixture(),w=dom.window;
 try{
  assert.equal(w.modelActivitySummary(english,'en'),english);
  assert.equal(w.modelActivitySummary('核对 TradingView 图表和 API 数据','zh-Hans'),'核对 TradingView 图表和 API 数据');
 }finally{dom.window.close();}
});
