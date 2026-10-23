import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {markup, bootstrap} from './helpers/thinking-stream-fixture.mjs';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM(markup,{runScripts:'outside-only',url:'https://example.com',pretendToBeVisual:true}),w=dom.window;
 w.eval(bootstrap);
 w.setArticleLanguage=()=> 'zh-Hans';w.copyFor=()=> '正在思考';w.formatDuration=()=> '1s';w.activeActivityArticle=null;
 w.showAgentIdentity=()=>{};
 w.eval(source.slice(source.indexOf('function applyRunTiming('),source.indexOf('const streamVisualizationCodeCache')));
 w.eval(source.slice(source.indexOf('function renderPublicProgress('),source.indexOf('function renderStreamAnswerText(')));
 const start=source.indexOf('function updateThinkingSummary('),end=source.indexOf('\nfunction ',start+10);
 w.eval(source.slice(start,end));
 return {dom,w,article:w.article};
}
test('public progress becomes the only live reasoning disclosure and leaves the answer untouched',()=>{
 const f=setup();
 try{
  const text='我先读取 TradingView 组件规范，再加载苹果日线。';
  f.w.handleStreamEvent(f.article,'progress',{text});
  assert.equal(f.article.querySelector('.thinkingSummaryText').textContent,text);
  assert.equal(f.article.querySelector('.thinkingTrigger').disabled,false);
  assert.equal(f.article.querySelector('.thinkingTrigger').getAttribute('aria-expanded'),'false');
  assert.equal(f.article.querySelector('.thinkingSteps').textContent.trim(),text);
  assert.equal(f.article.querySelector('.finalAnswer').innerHTML,'');
  assert.ok(f.article.querySelector('.thinkingTrigger').classList.contains('is-thinking'));
  f.w.handleStreamEvent(f.article,'progress',{text:'<img src=x onerror=alert(1)>'});
  assert.equal(f.article.querySelectorAll('img').length,0);
  f.article.activityEnded=true;
  f.w.handleStreamEvent(f.article,'progress',{text:'过期事件'});
  assert.notEqual(f.article.dataset.currentThinking,'过期事件');
 }finally{f.dom.window.close();}
});

test('first-person model progress keeps its natural wording in tool updates',()=>{
 const f=setup();
 try{
  f.w.normalizeLang=value=>value;f.w.stripStagePrefix=value=>value;
  f.w.eval(source.slice(source.indexOf('function compactReasoningTitle('),source.indexOf('function refreshSavedToolStepTitles(')));
  assert.equal(f.w.compactReasoningTitle('我先核对组件设置，再加载苹果日线。','zh-Hans'),'我先核对组件设置，再加载苹果日线');
  assert.equal(f.w.compactReasoningTitle('现在盘前结构已经清楚。','zh-Hans'),'现在盘前结构已经清楚');
  assert.equal(f.w.compactReasoningTitle('检查图表表达。','zh-Hans'),'正在检查图表表达');
 }finally{f.dom.window.close();}
});

test('latest progress replaces the live title; tool completions cannot revive stale titles',()=>{
 const f=setup();
 try{
  f.w.handleStreamEvent(f.article,'progress',{blockId:'p1',text:'核对日期与数据口径'});
  f.w.handleStreamEvent(f.article,'tool_step',{tool:'bash',callId:'b1',phase:'started',thoughtSummary:'加载市场数据',params:['true']});
  assert.equal(f.article.querySelector('.thinkingSummaryText').textContent,'加载市场数据');
  f.w.handleStreamEvent(f.article,'progress',{blockId:'p2',text:'汇总本周表现'});
  assert.equal(f.article.querySelector('.thinkingSummaryText').textContent,'汇总本周表现');
  f.w.handleStreamEvent(f.article,'tool_step',{tool:'bash',callId:'b1',phase:'completed',thoughtSummary:'加载市场数据',params:['true']});
  assert.equal(f.article.querySelector('.thinkingSummaryText').textContent,'汇总本周表现');
  assert.equal(f.article.querySelectorAll('.thinkingSteps .is-model-summary.is-loading').length,1);
  assert.equal(f.article.querySelector('.finalAnswer').innerHTML,'');
 }finally{f.dom.window.close();}
});
