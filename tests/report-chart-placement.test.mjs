import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const app=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM('<article><div id="answer"></div></article>',{runScripts:'outside-only'}),w=dom.window;
 w.sanitizeUserFacingInsight=v=>v;w.stripSourceInventoryFromInsight=v=>v;
 w.prepareInsightForVideos=text=>({text,hadMarker:false});w.buildVideoLane=()=>null;
 w.attachInlineAnswerSources=()=>{};w.formatInsight=v=>v;w.isGeneratedImageArtifact=()=>false;
 w.createStreamVisualizationArtifact=item=>{const node=w.document.createElement('figure');node.dataset.url=item.url;return node;};
 w.eval(app.slice(app.indexOf('async function renderMixedReportFlow('),app.indexOf('\nfunction sanitizeUserFacingInsight(')));
 return {w,close:()=>w.close(),article:w.document.querySelector('article'),container:w.document.querySelector('#answer')};
}
const artifacts=[{path:'/charts/a.html',url:'/generated/a.html'},{path:'/charts/b.html',url:'/generated/b.html'}];
test('analysis-only artifacts are never appended after sources',async()=>{
 const f=setup();try{await f.w.renderMixedReportFlow(f.article,{interpretation:'结论\n数据与来源',reportArtifacts:artifacts},f.container);assert.equal(f.container.querySelectorAll('figure').length,0);assert.match(f.container.textContent,/数据与来源/);}finally{f.close();}
});
test('only referenced charts render in narrative order, once',async()=>{
 const f=setup();try{await f.w.renderMixedReportFlow(f.article,{interpretation:'B的结论\n[[AIME_CHART:/charts/b.html]]\nA的结论\n[[AIME_CHART:/charts/a.html]]\n[[AIME_CHART:/charts/b.html]]\n数据与来源',reportArtifacts:artifacts},f.container);assert.deepEqual([...f.container.querySelectorAll('figure')].map(n=>n.dataset.url),['/generated/b.html','/generated/a.html']);assert.equal(f.container.lastElementChild.textContent,'数据与来源');}finally{f.close();}
});
test('legacy reportUrl does not insert a chart without an explicit reference',async()=>{
 const f=setup();try{await f.w.renderMixedReportFlow(f.article,{interpretation:'仅文字结论',reportUrl:'/generated/a.html'},f.container);assert.equal(f.container.querySelector('figure'),null);assert.equal(f.container.textContent,'仅文字结论');}finally{f.close();}
});
test('legacy reportUrl can be explicitly referenced',async()=>{
 const f=setup();try{await f.w.renderMixedReportFlow(f.article,{interpretation:'结论\n[[AIME_CHART:/generated/a.html]]',reportUrl:'/generated/a.html'},f.container);assert.equal(f.container.querySelectorAll('figure').length,1);}finally{f.close();}
});
test('empty final prose does not select the first generated chart',async()=>{
 const f=setup();try{await f.w.renderMixedReportFlow(f.article,{interpretation:'',reportArtifacts:artifacts},f.container);assert.equal(f.container.children.length,0);}finally{f.close();}
});
test('a plain path mention is not a chart placement directive',async()=>{
 const f=setup();try{await f.w.renderMixedReportFlow(f.article,{interpretation:'分析文件 /charts/a.html 仅供内部核对',reportArtifacts:artifacts},f.container);assert.equal(f.container.querySelector('figure'),null);}finally{f.close();}
});
