import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const source = readFileSync(new URL('../app/static/app.js', import.meta.url), 'utf8');
function fixture() {
  const dom = new JSDOM('<article><div class="finalAnswer"></div></article>', { runScripts:'outside-only' });
  const w = dom.window;
  w.canonicalArtifact = value => value;
  w.sanitizeUserFacingInsight = value => value;
  w.formatInsight = value => value;
  w.isNearBottom = () => false;
  w.keepScrollPosition = () => {};
  w.syncInlineActivity=()=>{};
  w.updateThinkingSummary=()=>{};
  w.withArtifactWidgetControl=node=>node;
  w.createArtifactFallbackFrame=item=>{const node=w.document.createElement('iframe');node.dataset.artifactUrl=item.url;return node;};
  w.eval(source.slice(source.indexOf('function orderedStreamFlow('), source.indexOf('function upsertStreamVisualization(')));
  return { w, article:w.document.querySelector('article'), close:()=>w.close() };
}
test('completed chart tools display immediately without waiting for prose', () => {
  const f = fixture();
  try {
    f.w.appendStreamVisualizationModule(f.article, {htmlUrl:'/generated/chart.html',label:'图表'});
    f.w.appendStreamVisualizationModule(f.article, {htmlUrl:'/generated/chart.html',label:'图表'});
    assert.equal(f.article.streamVisualizationArtifacts.length, 1);
    assert.equal(f.article.querySelectorAll('iframe').length, 1);
  } finally { f.close(); }
});
test('public text snapshots render once and never expose chart marker coordinates', () => {
  const f=fixture();
  try {
    f.w.renderStreamAnswerText(f.article,{text:'先解释结果。\n[[AIME_CHART:/secret/chart.html]]'});
    assert.equal(f.article.querySelector('.streamAnswerPreview').textContent.trim(),'先解释结果。');
    f.w.renderStreamAnswerText(f.article,{text:'完整解释。'});
    assert.equal(f.article.querySelectorAll('.streamAnswerPreview').length,1);
    assert.equal(f.article.querySelector('.streamAnswerPreview').textContent,'完整解释。');
    f.article.activityEnded=true;
    f.w.renderStreamAnswerText(f.article,{text:'过期事件'});
    assert.equal(f.article.querySelector('.streamAnswerPreview').textContent,'完整解释。');
  } finally { f.close(); }
});
test('native visualization events forward immediately and retain event order', () => {
  const f=fixture(), rendered=[];
  f.w.upsertStreamVisualization=(_article,data)=>rendered.push(data);
  try {
    for (const event of [{id:'chart',reset:true},{id:'chart',delta:'<p>chart</p>'},{id:'chart',final:true}]) f.w.queueStreamVisualization(f.article,event);
    assert.equal(rendered.length,3);
    assert.equal(f.article.querySelector('.finalAnswer').children.length,0);
    f.w.renderStreamAnswerText(f.article,{text:'先给结论。'});
    assert.equal(rendered.length,3);
    assert.equal(rendered[1].delta,'<p>chart</p>');
    assert.equal(f.article.pendingVisualizations?.length || 0,0);
    f.w.queueStreamVisualization(f.article,{id:'chart',title:'更新'});
    assert.equal(rendered.length,4);
  } finally {f.close();}
});

test('text, tools and charts stay interleaved while earlier blocks update',()=>{
 const f=fixture();try{
 f.w.renderStreamAnswerText(f.article,{blockId:'a',delta:'A'});
 f.w.renderOrderedTool(f.article,{callId:'c',tool:'read',phase:'running'});
 f.w.appendStreamVisualizationModule(f.article,{htmlUrl:'/generated/fixture.html'});
 f.w.renderStreamAnswerText(f.article,{blockId:'b',delta:'B'});
 f.w.renderOrderedTool(f.article,{callId:'c',tool:'read',phase:'completed'});
 f.w.renderStreamAnswerText(f.article,{blockId:'b',delta:'!'});
 const children=[...f.article.querySelector('.interleavedFlow').children];
 assert.deepEqual(children.map(n=>n.className),['streamAnswerPreview streamingAnswer reportInterpretation','orderedTool','streamvizLiveLane','streamAnswerPreview streamingAnswer reportInterpretation']);
 assert.equal(children[0].textContent,'A');assert.equal(children[3].textContent,'B!');assert.equal(children[1].dataset.phase,'completed');
 }finally{f.close();}
});
test('history replays the same text/tool/chart/text order',()=>{
 const f=fixture();try{
 f.w.replayOrderedStream(f.article,[{kind:'text',text:'A'},{kind:'tool_step',data:{tool:'read'}},{kind:'visualization',data:{htmlUrl:'/generated/fixture.html'}},{kind:'text',text:'B'}],f.article.querySelector('.finalAnswer'));
 assert.deepEqual([...f.article.querySelector('.finalAnswer').children].map(n=>n.tagName),['DIV','DIV','IFRAME','DIV']);
 }finally{f.close();}
});

test('finalization preserves existing live nodes and does not reorder the chart',()=>{
 const f=fixture();try{
 const w=f.w;
 w.eval(source.slice(source.indexOf('function renderFinalAnswer('),source.indexOf('function buildShareSessionForArticle(')));
 for(const name of ['clearImageGenerationLoading','completeThinking','updateThinkingSummary','attachResultActionHandlers','syncActivityDrawer','renderFileDeliverables','recordAssistantResult'])w[name]=()=>{};
 w.copyFor=()=>'';w.buildResultActions=()=>'';w.buildCapabilityBar=()=>'';w.buildShareSessionForArticle=()=>({});w.sourcesFromInsightMarkdown=()=>[];w.mergeSourcesByUrl=()=>[];
 w.renderStreamAnswerText(f.article,{blockId:'a',delta:'A'});
 w.appendStreamVisualizationModule(f.article,{htmlUrl:'/generated/fixture.html'});
 w.renderStreamAnswerText(f.article,{blockId:'b',delta:'B'});
 const flow=f.article.querySelector('.interleavedFlow'),nodes=[...flow.children];
 w.renderFinalAnswer(f.article,{interpretation:'A B',reportArtifacts:[{url:'/generated/fixture.html'}]});
 assert.equal(f.article.querySelector('.interleavedFlow'),flow);
 assert.deepEqual([...flow.children],nodes);
 assert.equal(f.article.querySelectorAll('iframe').length,1);
 }finally{f.close();}
});

test('native argument deltas increment one live host and final URL settles in place',()=>{
 const f=fixture();try{
 const w=f.w,seen=[];
 const start=source.indexOf('function upsertStreamVisualization(');
 const end=start+1+source.slice(start+1).search(/\n(?:async )?function /);
 w.eval(source.slice(start,end));
 w.mountStreamVisualization=(host,data)=>seen.push(data);
 w.renderStreamAnswerText(f.article,{blockId:'a',delta:'A'});
 w.queueStreamVisualization(f.article,{id:'v',argumentDelta:'{"title":"Chart",',native:true,reset:true});
 const host=f.article.querySelector('.streamvizArtifactHost');
 assert.equal(seen.length,1);assert.equal(seen[0].final,false);
 assert.equal(host.dataset.visualizationPhase,'running');
 w.renderStreamAnswerText(f.article,{blockId:'b',delta:'B'});
 w.queueStreamVisualization(f.article,{id:'v',argumentDelta:'"widget_code":"<p>1</p>"}',native:true});
 assert.equal(seen.length,2);assert.equal(seen[1].final,false);
 assert.equal(JSON.parse(seen[1].toolRawInput).widget_code,'<p>1</p>');
 w.queueStreamVisualization(f.article,{id:'v',htmlUrl:'/generated/live.html',native:true,final:true});
 assert.equal(seen.length,3);assert.equal(seen[2].final,true);
 assert.equal(host.dataset.visualizationPhase,'completed');
 assert.equal(f.article.querySelector('.streamvizArtifactHost'),host);
 assert.equal(f.article.querySelectorAll('.streamvizArtifactHost').length,1);
 assert.equal(host.dataset.artifactUrl,'/generated/live.html');
 assert.equal(JSON.parse(seen.at(-1).toolRawInput).widget_code,'<p>1</p>');
 assert.equal(f.article.querySelector('.interleavedFlow').lastChild.textContent,'B');
 }finally{f.close();}
});

test('invalid attempt is retracted without erasing prior prose or tool rows',()=>{
 const f=fixture();try{
 f.w.renderStreamAnswerText(f.article,{blockId:'a',delta:'Validated earlier text'});
 f.w.renderOrderedTool(f.article,{callId:'read',tool:'read',phase:'completed'});
 f.w.renderStreamAnswerText(f.article,{blockId:'bad',delta:'Malformed draft'});
 f.w.renderStreamAnswerText(f.article,{blockId:'bad',discard:true});
 f.w.renderStreamAnswerText(f.article,{blockId:'good',delta:'Corrected text\n[[AIME_SKILLS:private]]\n[[AIME_FILE:/private/path]]'});
 assert.equal(f.article.querySelectorAll('.streamAnswerPreview').length,2);
 assert.ok(!f.article.textContent.includes('Malformed'));
 assert.ok(!f.article.textContent.includes('AIME_'));
 assert.ok(f.article.textContent.includes('Validated earlier text'));
 assert.equal(f.article.querySelectorAll('.orderedTool').length,1);
 }finally{f.close();}
});

test('retracted commentary does not leave the article in answer mode',()=>{
 const f=fixture();try{
 f.w.updateThinkingSummary=()=>{};
 f.w.renderStreamAnswerText(f.article,{blockId:'commentary',delta:'正在计算指标。'});
 assert.equal(f.article.answerTextStarted,true);
 f.w.renderStreamAnswerText(f.article,{blockId:'commentary',discard:true});
 assert.equal(f.article.answerTextStarted,false);
 assert.equal(f.article.dataset.activityPhase,'thinking');
 assert.equal(f.article.querySelector('.streamAnswerPreview'),null);
 }finally{f.close();}
});
