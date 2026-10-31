import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const start=source.indexOf('function upsertStreamVisualization(');
const end=source.indexOf('window.addEventListener("aime:streamviz-followup"',start);
function fixture(){
 const dom=new JSDOM('<article><div class="finalAnswer"></div></article>',{runScripts:'outside-only'}),w=dom.window,mounts=[];
 const article=w.document.querySelector('article');
 w.streamVisualizationLane=()=>article.querySelector('.finalAnswer');w.isNearBottom=()=>false;w.keepScrollPosition=()=>{};
 w.mountStreamVisualization=(host,payload)=>{mounts.push({host,...payload});host.dataset.mounted='true';};
 w.AimeStreamViz={unmount:host=>{host.dataset.unmounted='true';}};
 w.createStreamVisualizationArtifact=()=>w.document.createElement('iframe');
 w.eval(source.slice(start,end));
 return {w,article,mounts,send:data=>w.upsertStreamVisualization(article,data),close:()=>w.close()};
}
test('incomplete native JSON is rendered on every real delta before final and settled in place',()=>{
 const f=fixture();try{
  f.send({id:'live',native:true,reset:true,argumentDelta:'{"title":"Live","widget_code":"<section>First'});
  const host=f.article.querySelector('.streamvizArtifactHost');
  assert.equal(f.mounts.length,1);assert.equal(f.mounts[0].final,false);
  assert.equal(f.mounts[0].toolRawInput,'{"title":"Live","widget_code":"<section>First');
  f.send({id:'live',native:true,argumentDelta:'</section><section>Second'});
  assert.equal(f.mounts.length,2);assert.match(f.mounts[1].toolRawInput,/First<\/section><section>Second$/);
  assert.equal(f.mounts[1].host,host);assert.equal(f.mounts[1].final,false);
  f.send({id:'live',native:true,argumentDelta:'</section>"}',final:true,htmlUrl:'/generated/live.html'});
  assert.equal(f.mounts.length,3);assert.equal(f.mounts[2].host,host);assert.equal(f.mounts[2].final,true);
  assert.equal(JSON.parse(f.mounts[2].toolRawInput).widget_code,'<section>First</section><section>Second</section>');
  assert.equal(f.article.querySelectorAll('.streamvizArtifactHost').length,1);assert(!host.classList.contains('is-live'));
 }finally{f.close();}
});
test('direct HTML deltas retain whitespace; reset replaces the earlier prefix and discard removes it',()=>{
 const f=fixture();try{
  f.send({id:'live',reset:true,delta:'<p>First '});f.send({id:'live',delta:'second</p>'});
  assert.equal(f.mounts[1].code,'<p>First second</p>');assert.equal(f.mounts[1].final,false);
  f.send({id:'live',reset:true,delta:'<p>Restarted</p>'});
  assert.equal(f.mounts[2].code,'<p>Restarted</p>');assert.equal(f.mounts[2].toolRawInput,'');
  f.send({id:'live',discard:true,final:true});assert.equal(f.article.querySelector('.streamvizArtifactHost'),null);
 }finally{f.close();}
});
test('a provisional artifact URL does not fetch a completed report before real final',()=>{
 const f=fixture();try{
  f.send({id:'live',htmlUrl:'/generated/live.html',reset:true});
  assert.equal(f.mounts.length,1);assert.equal(f.mounts[0].final,false);
  assert.equal(f.article.querySelector('iframe'),null);
  f.send({id:'live',htmlUrl:'/generated/live.html',final:true});
  assert.equal(f.article.querySelector('iframe')?.tagName,'IFRAME');
 }finally{f.close();}
});

function orderedFixture(){
 const f=fixture(),w=f.w;
 w.canonicalArtifact=value=>value;w.sanitizeUserFacingInsight=value=>value;w.formatInsight=value=>value;
 w.syncInlineActivity=()=>{};w.updateThinkingSummary=()=>{};w.withArtifactWidgetControl=node=>node;
 w.createStreamVisualizationArtifact=item=>{const host=w.document.createElement('div');host.dataset.artifactUrl=item.url;return host;};
 w.eval(source.slice(source.indexOf('function orderedStreamFlow('),source.indexOf('function upsertStreamVisualization(')));
 return f;
}
test('prose → native invocation → later prose keeps its place even with the final delivery marker',()=>{
 const f=orderedFixture();try{
  f.w.renderStreamAnswerText(f.article,{blockId:'intro',delta:'先解读。'});
  f.send({id:'live',native:true,reset:true,argumentDelta:'{"widget_code":"<p'});
  const host=f.article.querySelector('.streamvizArtifactHost'),lane=host.parentElement;
  f.send({id:'live',native:true,argumentDelta:'>图表</p>"}',htmlUrl:'/generated/live.html',final:true});
  f.w.renderStreamAnswerText(f.article,{blockId:'after',delta:'后续解释。\n[[AIME_CHART:/generated/live.html]]'});
  f.w.renderStreamAnswerText(f.article,{blockId:'intro',text:'先解读完整结论。'});
  const children=[...f.article.querySelector('.interleavedFlow').children];
  assert.deepEqual(children.map(n=>n.className),['streamAnswerPreview','streamvizLiveLane','streamAnswerPreview']);
  assert.equal(host.parentElement,lane);assert.equal(children[1],lane);
  assert.equal(f.article.querySelectorAll('.streamvizArtifactHost').length,1);
  assert.equal(f.article.querySelectorAll('.streamChartPending').length,0);
  assert.equal(children[2].textContent,'后续解释。\n');
 }finally{f.close();}
});
test('history preserves the native invocation position and consumes later duplicate markers',()=>{
 const f=orderedFixture();try{
  const blocks=[{kind:'text',id:'intro',text:'先解读。'},
   {kind:'visualization',id:'live',data:{native:true,htmlUrl:'/generated/live.html',final:true}},
   {kind:'text',id:'after',text:'后续解释。\n[[AIME_CHART:/generated/live.html]]'}];
  f.w.replayOrderedStream(f.article,blocks,f.article.querySelector('.finalAnswer'));
  const children=[...f.article.querySelector('.finalAnswer').children];
  assert.deepEqual(children.map(n=>n.className),['streamAnswerPreview','streamvizLiveLane','streamAnswerPreview']);
  assert.equal(children[1].querySelectorAll('[data-artifact-url]').length,1);
  assert.equal(f.article.querySelectorAll('[data-artifact-url]').length,1);
  assert.equal(f.article.querySelectorAll('.streamChartPending').length,0);
 }finally{f.close();}
});

test('composed charts load the verified final artifact instead of the streamed empty slots',()=>{
 const f=fixture();try{
  let loaded='';f.w.createStreamVisualizationArtifact=item=>{loaded=item.url;return f.w.document.createElement('iframe');};
  f.send({id:'layout',native:true,reset:true,argumentDelta:'{"widget_code":"<div data-chart-id=\\"chart-1\\"></div>"}'});
  assert.equal(f.mounts.length,1);
  f.send({id:'layout',native:true,final:true,composedCharts:true,htmlUrl:'/generated/verified-layout.html'});
  assert.equal(loaded,'/generated/verified-layout.html');
  assert.equal(f.article.querySelectorAll('iframe').length,1);
  assert.equal(f.article.querySelector('.streamvizArtifactHost'),null);
  assert.equal(f.mounts.length,1);
 }finally{f.close();}
});
