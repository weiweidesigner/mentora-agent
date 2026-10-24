import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function renderMixedReportFlow('),source.indexOf('\nfunction sanitizeUserFacingInsight('));
async function render(data,{strictMoveBefore=false}={}){
 const dom=new JSDOM('<article><div class="mixedReport"></div></article>',{url:'https://example.com/mentora/',runScripts:'outside-only'}),w=dom.window;
 if(strictMoveBefore)w.Element.prototype.moveBefore=function(node,before){if(!node.isConnected)throw new w.DOMException('invalid hierarchy','HierarchyRequestError');this.insertBefore(node,before);};
 w.sanitizeUserFacingInsight=value=>value;w.stripSourceInventoryFromInsight=value=>value;w.prepareInsightForVideos=text=>({text,hadMarker:false});w.buildVideoLane=()=>null;w.attachInlineAnswerSources=()=>{};w.formatInsight=value=>value;w.isGeneratedImageArtifact=()=>false;
 const make=item=>{const frame=w.document.createElement('iframe');frame.dataset.chart=item.url;return frame;};
 w.createStreamVisualizationArtifact=make;w.createArtifactFallbackFrame=make;
 w.eval(source.slice(source.indexOf("const addToWidgetIcon"),source.indexOf("function createArtifactFallbackFrame")));
 w.eval(code);const article=w.document.querySelector('article'),report=article.firstElementChild;let done=false;
 await w.renderMixedReportFlow(article,data,report,()=>{done=true;});
 return {dom,report,done};
}
test('deployment prefix mismatch renders adjacent chart markers instead of exposing raw paths',async()=>{
 const s=await render({interpretation:'结论\n[[AIME_CHART:/generated/deal-TLT.html]] [[AIME_CHART:/generated/deal-600018.SH.html]]',reportArtifacts:[{url:'/mentora/generated/deal-TLT.html'},{url:'/mentora/generated/deal-600018.SH.html'}]});
 assert.equal(s.report.querySelectorAll('iframe').length,2);assert.doesNotMatch(s.report.textContent,/AIME_CHART|generated\//);assert.match(s.report.textContent,/结论/);s.dom.window.close();
});
test('saved markers recover safe local generated artifacts without metadata',async()=>{
 const s=await render({interpretation:'结论\n[[AIME_CHART:/generated/saved.html]]\n后续条件'});
 assert.equal(s.report.querySelector('iframe').dataset.chart,'/mentora/generated/saved.html');assert.doesNotMatch(s.report.textContent,/AIME_CHART/);assert.match(s.report.textContent,/后续条件/);s.dom.window.close();
});
test('generated and preview aliases render only once, including encoded filenames and whitespace',async()=>{
 const s=await render({interpretation:'[[AIME_CHART: /share-artifact/图表.html ]] [[AIME_CHART:/generated/%E5%9B%BE%E8%A1%A8.html]]',reportArtifacts:[{url:'/mentora/generated/图表.html'}]});
 assert.equal(s.report.querySelectorAll('iframe').length,1);assert.doesNotMatch(s.report.textContent,/AIME_CHART/);s.dom.window.close();
});
test('untrusted and unresolved references are not mounted and expose no filesystem path',async()=>{
 const s=await render({interpretation:'正文\n[[AIME_CHART:https://evil.example/generated/file.html]] [[AIME_CHART:/private/secrets.html]] [[AIME_CHART:/generated/../private/file.html]]'});
 assert.equal(s.report.querySelectorAll('iframe').length,0);assert.doesNotMatch(s.report.textContent,/AIME_CHART|evil|private|secrets/);assert.match(s.report.textContent,/图表暂不可用/);s.dom.window.close();
});
test('inventory is not automatically mounted without a narrative marker',async()=>{
 const s=await render({interpretation:'只有结论',reportArtifacts:[{url:'/mentora/generated/unused.html'}]});
 assert.equal(s.report.querySelectorAll('iframe').length,0);assert.match(s.report.textContent,/只有结论/);s.dom.window.close();
});
test('detached widget shells use normal insertion instead of an invalid atomic move',async()=>{
 const s=await render({interpretation:'结论\n[[AIME_CHART:/generated/case.html]]',reportArtifacts:[{url:'/generated/case.html'}]},{strictMoveBefore:true});
 assert.equal(s.report.querySelectorAll('iframe').length,1);assert.equal(s.done,true);s.dom.window.close();
});
