import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM('<article><button class="thinkingTrigger"><span class="thinkingSummaryText">正在思考</span></button><div class="finalAnswer"></div></article>',{runScripts:'outside-only'}),w=dom.window;
 w.setArticleLanguage=()=> 'zh-Hans';w.copyFor=()=> '正在思考';w.formatDuration=()=> '1s';w.activeActivityArticle=null;
 w.showAgentIdentity=()=>{};
 w.eval(source.slice(source.indexOf('function applyRunTiming('),source.indexOf('const streamVisualizationCodeCache')));
 const start=source.indexOf('function updateThinkingSummary('),end=source.indexOf('\nfunction ',start+10);
 w.eval(source.slice(start,end));
 return {dom,w,article:w.document.querySelector('article')};
}
test('public progress replaces the waiting label as text and leaves the answer untouched',()=>{
 const f=setup();
 try{
  const text='我先读取 TradingView 组件规范，再加载苹果日线。';
  f.w.handleStreamEvent(f.article,'progress',{text});
  assert.equal(f.article.querySelector('.thinkingSummaryText').textContent,text);
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
  f.w.eval(source.slice(source.indexOf('function compactReasoningTitle('),source.indexOf('function toolCommandText(')));
  assert.equal(f.w.compactReasoningTitle('我先核对组件设置，再加载苹果日线。','zh-Hans'),'我先核对组件设置，再加载苹果日线');
  assert.equal(f.w.compactReasoningTitle('现在盘前结构已经清楚。','zh-Hans'),'现在盘前结构已经清楚');
  assert.equal(f.w.compactReasoningTitle('检查图表表达。','zh-Hans'),'正在检查图表表达');
 }finally{f.dom.window.close();}
});
