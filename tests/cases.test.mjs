import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../app/static/cases.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
function setup(url = 'https://example.com/', text = '完整缓存答案', catalog = null) {
  const dom = new JSDOM(`<main class="conversation is-empty"><form id="chatForm"><input id="question"></form><section id="homeCases"><div id="caseGrid"></div></section>${catalog ? '<section id="inspirationSquare"><div id="inspirationTabs"></div><div id="inspirationPanel"></div></section>' : ''}<header id="caseDetailHeader" hidden><button id="caseBackButton"></button><span id="caseCacheDate"></span></header><div id="messages"></div><div id="caseActionBar" hidden><button id="caseAskButton"></button></div></main>`, { url });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  const rows = [{id:'amd', title:'AMD', tag:'评级', preview:'市场共识', cachedDate:'2026-10-13', question:'AMD 最新评级如何？', conversationUrl:'/static/cases/amd/conversation.json'}];
  const requests = [], sent = [];
  const conversation = w.document.querySelector('main'), input = w.document.querySelector('input'), messages = w.document.querySelector('#messages'), form = w.document.querySelector('form');
  form.requestSubmit = () => sent.push(input.value);
  const context = vm.createContext({window:w, document:w.document, history:w.history, location:w.location, URL, URLSearchParams, structuredClone, performance,
    ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: fn => { if (fn.name !== 'moveLanes') fn(); }, conversation, input, messages, form,
    escapeHtml: value => value, isMobileLayout: () => false, closeActivityDrawer: () => {}, updateComposerState: () => {},
    startNewChat: () => {w.dispatchEvent(new w.Event('veya:chat-navigate')); messages.innerHTML=''; conversation.classList.add('is-empty'); input.value='';},
    addUserMessage: question => {const el=w.document.createElement('p');el.textContent=question;messages.append(el);},
    createAssistantMessage: () => {const el=w.document.createElement('article');el.innerHTML='<div class="finalAnswer"></div>';messages.append(el);return el;},
    sanitizeUserFacingInsight: value => value, formatInsight: value => `<p>${value}</p>`,
    renderFinalAnswer: (article, answer) => {article.textContent=answer.interpretation;},
    fetch: async url => {requests.push(url); const row = catalog?.cases.find(item => item.conversationUrl === url) || rows[0]; return {ok:true,json:async()=>url.includes('/inspiration/manifest.json')?catalog:url.endsWith('manifest.json')?rows:{question:row.question,answer:{interpretation:text}}};},
  });
  vm.runInContext(source,context);
  return {w, requests, sent, conversation, messages};
}
test('case replay loads cached conversation without inference; ask fills an editable draft', async () => {
  const h=setup();await tick();
  h.w.document.querySelector('.caseCard').click();await tick();
  assert.match(h.messages.textContent,/AMD 最新评级如何？完整缓存答案/);
  assert.equal(h.w.document.querySelector('#caseActionBar').hidden,false);
  assert.equal(h.requests.length,2);
  h.w.document.querySelector('#caseAskButton').click();
  assert.deepEqual(h.sent,[]);
  assert.equal(h.w.document.querySelector('#question').value,'AMD 最新评级如何？');
  assert.equal(h.w.document.activeElement,h.w.document.querySelector('#question'));
  assert.equal(h.w.document.querySelector('#caseActionBar').hidden,true);
  assert.equal(new URL(h.w.location.href).searchParams.has('case'),false);
});
test('direct case links work and returning home restores cards', async () => {
  const h=setup('https://example.com/veya/?case=amd');await tick();
  assert.equal(h.conversation.classList.contains('is-case'),true);
  h.w.document.querySelector('#caseBackButton').click();
  assert.equal(h.conversation.classList.contains('is-empty'),true);
  assert.equal(h.conversation.classList.contains('is-case'),false);
  h.w.document.querySelector('.caseCard').click();await tick();
  assert.equal(h.requests.length,2,'reopening reuses cached response');
});

test('cached answers reveal progressively and stop when leaving the case', async () => {
  const h=setup('https://example.com/', '逐步显示的缓存分析。'.repeat(40));await tick();
  h.w.document.querySelector('.caseCard').click();await tick();
  const first=h.messages.querySelector('.cachedReplay').textContent;
  assert.ok(first.length>0 && first.length<400);
  await new Promise(resolve=>setTimeout(resolve,65));
  assert.ok(h.messages.querySelector('.cachedReplay').textContent.length>first.length);
  h.w.document.querySelector('#caseBackButton').click();
  await new Promise(resolve=>setTimeout(resolve,65));
  assert.equal(h.messages.textContent,'');
  assert.equal(h.w.document.querySelector('#caseActionBar').hidden,true);
  assert.equal(h.requests.length,2);
});

test('reduced motion shows the complete cached answer immediately', async () => {
  const text='完整答案'.repeat(100);
  const h=setup('https://example.com/',text);
  h.w.matchMedia=()=>({matches:true,addEventListener(){}});await tick();
  h.w.document.querySelector('.caseCard').click();await tick();
  assert.ok(h.messages.textContent.includes(text));
  assert.equal(h.messages.querySelector('.cachedReplay'),null);
});

test('published home cases have complete answers and portable cached charts', () => {
  const rows=JSON.parse(readFileSync(new URL('../app/static/cases/manifest.json',import.meta.url),'utf8'));
  assert.equal(rows.length,8);
  assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
  for (const row of rows) {
    const cached=JSON.parse(readFileSync(new URL('../app'+row.conversationUrl,import.meta.url),'utf8'));
    assert.equal(cached.question,row.question);
    assert.equal(cached.cachedAt.slice(0,10),row.cachedDate);
    const artifactText=cached.answer.reportArtifacts.map(artifact=>readFileSync(new URL('../app'+artifact.url,import.meta.url),'utf8').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,'')).join('');
    assert.ok(cached.answer.interpretation.length+artifactText.length>500);
    assert.ok(cached.answer.reportArtifacts.length>0);
    assert.equal(cached.activity.detailSource,'cached-tool-results');
    assert.ok(cached.activity.steps.some(step=>step.durationMs>0 && step.detail.includes('结果：')));
    for (const step of cached.activity.steps) {
      assert.ok(step.detail);
      assert.doesNotMatch(step.detail,/started background job|原始案例的缓存执行记录/);
    }
    const paths=cached.answer.reportArtifacts.map(artifact=>artifact.path);
    for (const marker of cached.answer.interpretation.matchAll(/\[\[AIME_CHART:(.*?)\]\]/g)) assert.ok(paths.includes(marker[1]));
    for (const artifact of cached.answer.reportArtifacts) assert.ok(existsSync(new URL('../app'+artifact.url,import.meta.url)));
    assert.doesNotMatch(JSON.stringify(cached),/\/home\/ubuntu|\/Users\//);
  }
});

test('ask button hides while scrolling down and returns on idle or upward scroll', async () => {
  const h=setup();await tick();h.w.document.querySelector('.caseCard').click();await tick();
  const bar=h.w.document.querySelector('#caseActionBar');
  h.messages.scrollTop=100;h.messages.dispatchEvent(new h.w.Event('scroll'));
  assert.equal(bar.classList.contains('is-scroll-hidden'),true);
  assert.equal(bar.inert,true);
  await new Promise(resolve=>setTimeout(resolve,270));
  assert.equal(bar.classList.contains('is-scroll-hidden'),false);
  h.messages.scrollTop=200;h.messages.dispatchEvent(new h.w.Event('scroll'));
  h.messages.scrollTop=150;h.messages.dispatchEvent(new h.w.Event('scroll'));
  assert.equal(bar.classList.contains('is-scroll-hidden'),false);
  h.w.document.querySelector('#caseBackButton').click();
});


test('A-share case combines narrative analysis with one integrated StreamViz report', () => {
  const cached=JSON.parse(readFileSync(new URL('../app/static/cases/ashare-dashboard/conversation.json',import.meta.url),'utf8'));
  assert.equal(cached.answer.reportArtifacts.length,1);
  assert.match(cached.answer.interpretation,/核心结论/);
  assert.match(cached.answer.interpretation,/风险与后续观察点/);
  assert.equal([...cached.answer.interpretation.matchAll(/\[\[AIME_CHART:/g)].length,1);
  const report=readFileSync(new URL('../app'+cached.answer.reportArtifacts[0].url,import.meta.url),'utf8');
  assert.match(report,/data-aime-streamviz-root="true"/);
  assert.match(report,/data-financial-market="CN"/);
  for (const section of ['指数对照','市场宽度','板块分化','行业强弱','成交额前十','涨跌分布','板块结构','成交分层','个股两端','接下来观察什么','数据与口径']) assert.ok(report.includes(section));
  assert.match(report,/2909 家 · 52.32%/);
  assert.match(report,/2485 家 · 44.69%/);
  assert.match(report,/2026-10-13 收盘缓存/);
  assert.doesNotMatch(report,/<script|<iframe/);
  const evidence=JSON.parse(readFileSync(new URL('../app/static/cases/ashare-dashboard/streamviz-report.payload.json',import.meta.url),'utf8')).evidenceSnapshot;
  assert.equal(evidence.distribution.length,13);
  for (const groups of [evidence.distribution,evidence.boardComparison,evidence.turnoverTiers]) assert.equal(groups.reduce((total,row)=>total+row.count,0),evidence.validCount);
  assert.ok(evidence.rankings.every(group=>group.rows.length===10));
});

test('inspiration categories switch by click and keyboard and replay without inference', async () => {
  const catalog={categories:[{id:'charts',title:'金融图表',subtitle:'原生业务组件'},{id:'art',title:'艺术绘图',subtitle:'金融主题'}],cases:[{id:'chart-demo',category:'charts',featured:true,title:'图表',tag:'财报',preview:'利润',question:'查看财报',cachedDate:'2026-10-14',conversationUrl:'/static/cases/inspiration/chart-demo/conversation.json'},{id:'art-demo',category:'art',featured:false,title:'插画',tag:'艺术',preview:'牛熊',question:'画牛熊',cachedDate:'2026-10-14',conversationUrl:'/static/cases/inspiration/art-demo/conversation.json'}]};
  const h=setup('https://example.com/','缓存案例',catalog);await tick();
  const tabs=h.w.document.querySelector('#inspirationTabs');
  assert.equal(tabs.querySelector('[data-category="recommended"]'),null);
  assert.equal(tabs.querySelector('.inspirationCount'),null);
  assert.equal(tabs.querySelector('[aria-selected="true"]').dataset.category,'all');
  assert.equal(tabs.querySelector('[data-category="all"]').textContent,'全部');
  assert.equal(h.w.document.querySelectorAll('#inspirationPanel .caseCard').length,2);
  tabs.querySelector('[data-category="art"]').click();
  assert.match(h.w.document.querySelector('#inspirationPanel h3').textContent,/艺术绘图/);
  tabs.querySelector('[data-category="art"]').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  assert.equal(tabs.querySelector('[aria-selected="true"]').dataset.category,'charts');
  const card=h.w.document.querySelector('#inspirationPanel .caseCard');card.focus();card.click();await tick();
  assert.ok(h.messages.textContent.includes('查看财报'));
  assert.equal(h.w.document.querySelectorAll('.caseOverlay #inspirationSquare').length,0);
  h.w.document.querySelector('#caseBackButton').click();
  assert.equal(h.w.document.activeElement,card);
  assert.deepEqual(h.sent,[]);
  assert.equal(h.w.document.querySelectorAll('main > #inspirationSquare').length,1);
});

test('all inspiration cards have portable, non-empty caches and complete component coverage', () => {
  const root=new URL('../app/static/cases/inspiration/',import.meta.url);
  const catalog=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
  assert.equal(catalog.cases.length,77);
  assert.equal(new Set(catalog.cases.map(row=>row.id)).size,77);
  const counts={reports:3,charts:51,analysis:17,videos:3,art:3};
  for(const [category,count] of Object.entries(counts))assert.equal(catalog.cases.filter(row=>row.category===category).length,count);
  for(const row of catalog.cases){
    const cached=JSON.parse(readFileSync(new URL('../app'+row.conversationUrl,import.meta.url),'utf8'));
    assert.equal(cached.question,row.question);
    assert.equal(cached.cachedAt.slice(0,10),row.cachedDate);
    assert.ok(cached.answer.interpretation.trim());
    if(row.generation==='actual-tool-execution'){
      assert.equal(cached.provenance.generation,'actual-tool-execution');
      assert.ok(cached.activity.elapsedMs>0);
    }else{
      assert.equal(cached.provenance.generation,'actual-veya-chat-stream');
      assert.ok(cached.activity.elapsedMs>1000);
    }
    assert.equal(cached.activity.elapsedMs,cached.activity.stages.reduce((total,stage)=>total+stage.endedAt-stage.startedAt,0));
    assert.ok(cached.activity.steps.length>0);
    for(const artifact of cached.answer.reportArtifacts){
      const text=readFileSync(new URL('../app'+artifact.url,import.meta.url),'utf8');
      assert.ok(text.length>500);
      assert.doesNotMatch(text,/\/Users\/|\/home\/ubuntu\//);
      assert.ok(cached.answer.interpretation.includes(`[[AIME_CHART:${artifact.path}]]`));
    }
    if(row.category==='analysis'){
      assert.equal(cached.answer.visualRoute.applied,true);
      assert.equal(cached.answer.visualRoute.primary,cached.provenance.renderer);
    }
    if(row.category==='charts')assert.equal(cached.provenance.renderer,row.tool==='TradingViewChart'?'trading_view_chart.py':row.id.replace('business-','')+'.py');
    if(cached.provenance.sample)assert.match(cached.answer.interpretation,/演示数据/);
    if(row.category==='videos'){
      assert.ok(cached.answer.videos.length>=3);
      assert.equal(cached.answer.reportArtifacts.length,0);
      for(const video of cached.answer.videos) assert.match(video.videoUrl,/^https:\/\//);
    }
    if(row.category==='art'){
      const image=cached.answer.reportArtifacts[0];
      assert.equal(image.mediaType,'image');
      assert.ok(existsSync(new URL('../app'+image.imageUrl,import.meta.url)));
    }
  }
});

test('gallery summaries and replay questions are readable product copy',()=>{
  const root=new URL('../app/static/cases/inspiration/',import.meta.url);
  const catalog=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
  for(const row of catalog.cases){
    assert.ok(row.preview.length>10,row.id);
    assert.doesNotMatch(row.preview,/^[-_*\s]+$|组件期间键|本轮接口|\.py/);
    assert.notEqual(row.tag,'实际生成');
    assert.doesNotMatch(row.question,/\.py|--query|--output|outputs\/|buildVideoLane|不要|真实数据|实际生成/);
    assert.ok(row.question.length<100,row.id);
    const cached=JSON.parse(readFileSync(new URL(row.id+'/conversation.json',root),'utf8'));
    assert.equal(cached.question,row.question);
    assert.equal(cached.answer.question,row.question);
    assert.doesNotMatch(cached.answer.interpretation,/outputs\/|payload\.json|执行说明|实际生成产物|--sample|组件字段|financial_reports_visual\/|All charts render/);
    assert.ok(cached.activity.steps.some(step=>step.detail?.includes('调用：') || step.detail?.includes('本次加载：')));
  }
  for(const name of ['bar_chart','grouped_bar','line_chart','group_line','bar_line','pie','treemap','waterfall']){
    const marks=JSON.parse(readFileSync(new URL('analysis-'+name+'/markup.json',root),'utf8'));
    assert.ok(marks.report.applied.length>0);
    assert.deepEqual(marks.report.skipped,[]);
  }
});

test('financial gallery covers every TradingView widget exactly once',()=>{
 const root=new URL('../app/static/cases/inspiration/',import.meta.url);
 const catalog=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
 const widgets=JSON.parse(readFileSync(new URL('../app/skills/trading-view-chart/widgets.json',import.meta.url),'utf8'));
 const rows=catalog.cases.filter(row=>row.tool==='TradingViewChart');
 assert.equal(rows.length,18);
 assert.deepEqual(rows.map(row=>row.widget).sort(),Object.keys(widgets).sort());
 assert.equal(new Set(rows.map(row=>row.conversationUrl)).size,18);
 assert.doesNotMatch(catalog.categories.find(c=>c.id==='charts').subtitle,/\d+\s*个/);
 for(const row of rows){
  assert.equal(row.category,'charts');
  const cached=JSON.parse(readFileSync(new URL('../app'+row.conversationUrl,import.meta.url),'utf8'));
  assert.equal(cached.provenance.widget,row.widget);
  const artifact=cached.answer.reportArtifacts[0];
  const document=readFileSync(new URL('../app'+artifact.url,import.meta.url),'utf8');
  const config=JSON.parse(document.match(/<script id="tv-config" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(config.widget,row.widget);
  assert.equal(config.config.locale,'zh_CN');
  assert.equal(config.script,widgets[row.widget].script);
  assert.match(document,/tradingview-widget-copyright/);
  assert.match(cached.answer.interpretation,/TradingView.*加载|TradingView.*更新/);
 }
});
