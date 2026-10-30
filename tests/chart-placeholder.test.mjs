import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
function fixture(){
 const dom=new JSDOM('<article><div class="finalAnswer"></div></article>',{runScripts:'outside-only',url:'https://example.com/mentora/'}),w=dom.window;
 w.eval(source.slice(source.indexOf('function sanitizeUserFacingInsight('),source.indexOf('\nfunction splitInsightAroundChart(')));
 return {dom,w};
}
test('dummy image markup is omitted while financial prose and chart identity survive',()=>{
 const {w}=fixture();
 const text='市场上涨 1.23%。\n![标普500行业热力图](placeholder)\n[[AIME_CHART:/generated/sp500.html]]\n![截图](https://example.com/screenshot.png)';
 const clean=w.sanitizeUserFacingInsight(text);
 assert(!clean.includes('placeholder'));assert(clean.includes('市场上涨 1.23%。'));
 assert(clean.includes('[[AIME_CHART:/generated/sp500.html]]'));
 assert(clean.includes('![截图](https://example.com/screenshot.png)'));
 for(const url of ['PLACEHOLDER','<placeholder>','about:blank','#'])assert.equal(w.sanitizeUserFacingInsight(`![图表](${url})`),'');
 w.close();
});
test('streaming image fragments never flash raw markup and valid images settle intact',()=>{
 const {w}=fixture(),dummy='![标普500行业热力图](placeholder)';
 for(let i=2;i<=dummy.length;i++)assert.equal(w.sanitizeUserFacingInsight(dummy.slice(0,i)),'');
 assert.equal(w.sanitizeUserFacingInsight('![截图](/generated/a.png)'),'![截图](/generated/a.png)');
 w.close();
});
test('live text and history replay both apply the placeholder filter',()=>{
 const {w}=fixture();w.canonicalArtifact=v=>v;w.formatInsight=v=>v;w.isNearBottom=()=>false;w.keepScrollPosition=()=>{};
 w.setInlineActivityExpanded=()=>{};w.syncInlineActivity=()=>{};w.updateThinkingSummary=()=>{};
 w.eval(source.slice(source.indexOf('function orderedStreamFlow('),source.indexOf('function upsertStreamVisualization(')));
 const article=w.document.querySelector('article');
 w.renderStreamAnswerText(article,{blockId:'text',delta:'市场上涨。\n![标普500行业热力图](placeholder)'});
 assert.equal(article.querySelector('.streamAnswerPreview').textContent,'市场上涨。');
 w.replayOrderedStream(article,[{kind:'text',text:'市场上涨。\n![标普500行业热力图](placeholder)'}],article.querySelector('.finalAnswer'));
 assert(!article.textContent.includes('placeholder'));assert(article.textContent.includes('市场上涨。'));
 w.close();
});

test('final answer removes placeholders while mounting the verified chart once',async()=>{
 const {w}=fixture(),article=w.document.querySelector('article'),report=w.document.createElement('div');article.append(report);
 w.stripSourceInventoryFromInsight=v=>v;w.prepareInsightForVideos=text=>({text,hadMarker:false});w.buildVideoLane=()=>null;w.attachInlineAnswerSources=()=>{};w.formatInsight=v=>v;w.isGeneratedImageArtifact=()=>false;
 const make=item=>{const frame=w.document.createElement('iframe');frame.dataset.chart=item.url;return frame;};
 w.createStreamVisualizationArtifact=make;w.createArtifactFallbackFrame=make;
 w.eval(source.slice(source.indexOf('const addToWidgetIcon'),source.indexOf('function createArtifactFallbackFrame')));
 w.eval(source.slice(source.indexOf('async function renderMixedReportFlow('),source.indexOf('\nfunction sanitizeUserFacingInsight(')));
 await w.renderMixedReportFlow(article,{interpretation:'市场上涨。\n![标普500行业热力图](placeholder)\n[[AIME_CHART:/generated/sp500.html]]',reportArtifacts:[{url:'/generated/sp500.html'}]},report);
 assert(!report.textContent.includes('placeholder'));assert(report.textContent.includes('市场上涨。'));
 assert.equal(report.querySelectorAll('iframe').length,1);assert.equal(report.querySelector('iframe').dataset.chart,'/generated/sp500.html');
 w.close();
});
