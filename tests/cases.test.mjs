import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../app/static/cases.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
function setup(url = 'https://example.com/', text = '完整缓存答案', catalog = null, options = {}) {
  const dom = new JSDOM(`<main class="conversation is-empty"><form id="chatForm"><input id="question"></form><section id="homeCases"><div id="caseGrid"></div></section>${catalog ? '<section id="inspirationSquare"><div id="inspirationTabs"></div><div id="inspirationPanel"></div></section>' : ''}<header id="caseDetailHeader" hidden><button id="caseBackButton"></button><span id="caseCacheDate"></span></header><div id="messages"></div><div id="caseActionBar" hidden><button id="caseAskButton"></button></div></main>`, { url });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  const rows = [{id:'amd', title:'AMD', tag:'评级', preview:'市场共识', cachedDate:'2026-10-13', question:'AMD 最新评级如何？', conversationUrl:'/static/cases/amd/conversation.json'}];
  const requests = [], sent = [], formatted = [];
  const conversation = w.document.querySelector('main'), input = w.document.querySelector('input'), messages = w.document.querySelector('#messages'), form = w.document.querySelector('form');
  form.requestSubmit = () => sent.push(input.value);
  const context = vm.createContext({window:w, document:w.document, history:w.history, location:w.location, URL, URLSearchParams, structuredClone, performance,
    ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: fn => { if (fn.name !== 'moveLanes') w.setTimeout(fn,0); }, conversation, input, messages, form,
    escapeHtml: value => value, isMobileLayout: () => false, closeActivityDrawer: () => {}, updateComposerState: () => {},
    startNewChat: () => {w.dispatchEvent(new w.Event('veya:chat-navigate')); messages.innerHTML=''; conversation.classList.add('is-empty'); input.value=''; conversation.scrollTop=0;},
    addUserMessage: question => {const el=w.document.createElement('p');el.textContent=question;messages.append(el);},
    createAssistantMessage: () => {const el=w.document.createElement('article');el.innerHTML='<div class="finalAnswer"></div>';messages.append(el);return el;},
    sanitizeUserFacingInsight: value => value, formatInsight: value => {formatted.push(value);return options.formatInsight?.(value) || `<p>${value}</p>`;},
    renderFinalAnswer: (article, answer) => {article.textContent=answer.interpretation;},
    fetch: async url => {
      requests.push(url);
      const row = catalog?.cases.find(item => item.conversationUrl === url) || rows[0];
      if (!url.endsWith('manifest.json') && options.failConversationAttempts > 0) {
        options.failConversationAttempts -= 1;
        return {ok:false,status:502,json:async()=>({})};
      }
      return {ok:true,status:200,json:async()=>url.includes('/inspiration/manifest.json')?catalog:url.endsWith('manifest.json')?rows:{question:row.question,answer:{interpretation:text}}};
    },
  });
  vm.runInContext(source,context);
  return {w, requests, sent, formatted, conversation, messages, startNewChat: context.startNewChat};
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

test('case replay recovers from a transient deployment gateway error', async () => {
  const h=setup('https://example.com/?case=amd','重试后的完整答案',null,{failConversationAttempts:1});
  await new Promise(resolve=>setTimeout(resolve,340));
  assert.match(h.messages.textContent,/重试后的完整答案/);
  assert.equal(h.requests.filter(url=>url.endsWith('/conversation.json')).length,2);
  assert.doesNotMatch(h.messages.textContent,/案例暂时无法打开/);
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

test('case replay formats a loose ordered list as one narrative segment', async () => {
  const text='1. 第一点\n\n2. 第二点\n\n3. 第三点';
  const h=setup('https://example.com/',text);await tick();
  h.w.document.querySelector('.caseCard').click();await tick();
  assert.ok(h.formatted.includes(text));
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

test('midterm election case removes the standalone reader gutter when embedded',()=>{
 const report=readFileSync(new URL('../app/static/cases/midterm-election-1902-2026/report.html',import.meta.url),'utf8');
 assert.match(report,/<script src="\/static\/artifact-presentation\.js"><\/script>/);
});

test('revenue geography case uses the enlarged desktop pie renderer without a duplicate period badge',()=>{
 const report=readFileSync(new URL('../app/static/cases/inspiration/business-revenue_geography/inspiration-real-business-revenue_geography-AAPL.html',import.meta.url),'utf8');
 assert.match(report,/data-renderer-version="pie-spacing-v4"/);
 assert.match(report,/\.pie-component\.legend-bottom \.pie-stage\{width:min\(100%,460px\);height:280px/);
 assert.match(report,/\.pie-component\.legend-bottom \.pie-legend\{[^}]*font-size:13px/);
 assert.match(report,/Math\.min\(128, Math\.min\(width, height\) \/ 2 - safe\)/);
 assert.match(report,/@media\(max-width:759px\)[\s\S]*\.pie-component\.legend-bottom \.pie-stage\{width:min\(100%,260px\);height:178px\}/);
 assert.match(report,/<div class="pie-badge"><\/div>/);
 assert.match(report,/"badgeLabel": ""/);
 const cached=JSON.parse(readFileSync(new URL('../app/static/cases/inspiration/business-revenue_geography/conversation.json',import.meta.url),'utf8'));
 assert.equal(cached.answer.interpretation.match(/数据更新日期：2026-10-14/g)?.length,1);
});

test('balance sheet case stays aligned with the source controls and dark timeline palette',()=>{
 const report=readFileSync(new URL('../app/static/cases/inspiration/business-balance_sheet/inspiration-real-business-balance_sheet-aapl.html',import.meta.url),'utf8');
 assert.match(report,/<script src="\/static\/cases\/theme\.js"><\/script>/);
 assert.match(report,/\.page-title\[data-business-title\] \{ margin: 0 0 14px !important; \}/);
 assert.match(report,/--control-active-bg:#2a384b;/);
 assert.match(report,/\.balance-sheet \.metric-tab\.active \{[\s\S]*background: var\(--control-active-bg\) !important;/);
 assert.match(report,/\.balance-sheet \.segment\.active \{[\s\S]*background:var\(--control-active-bg\) !important;/);
 assert.match(report,/--range-track:#273243;/);
 assert.match(report,/--range-selection:#5376a8;/);
 assert.match(report,/--range-handle-bg:#182230;/);
 assert.match(report,/\.balance-sheet \.range-track::before \{ background: var\(--range-track\) !important; \}/);
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
  assert.equal(catalog.cases.length,89);
  assert.equal(new Set(catalog.cases.map(row=>row.id)).size,89);
  const counts={reports:3,charts:63,analysis:17,videos:3,art:3};
  for(const [category,count] of Object.entries(counts))assert.equal(catalog.cases.filter(row=>row.category===category).length,count);
  for(const row of catalog.cases){
    const cached=JSON.parse(readFileSync(new URL('../app'+row.conversationUrl,import.meta.url),'utf8'));
    assert.equal(cached.question,row.question);
    assert.equal(cached.cachedAt.slice(0,10),row.cachedDate);
    assert.ok(cached.answer.interpretation.trim());
    assert.equal(cached.provenance.generation,row.tool==='TradingViewChart'?'executed-official-widget-cli':'actual-veya-chat-stream');
    assert.ok(cached.activity.elapsedMs>(row.tool==='TradingViewChart'?0:1000));
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

test('financial gallery covers official groups and every executed widget with verifiable provenance',()=>{
 const root=new URL('../app/static/cases/inspiration/',import.meta.url);
 const catalog=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
 const widgets=JSON.parse(readFileSync(new URL('../app/skills/trading-view-chart/widgets.json',import.meta.url),'utf8'));
 const rows=catalog.cases.filter(row=>row.tool==='TradingViewChart');
 assert.equal(rows.length,Object.keys(widgets).length);
 assert.deepEqual(rows.map(row=>row.widget).sort(),Object.keys(widgets).sort());
 assert.equal(new Set(rows.map(row=>row.conversationUrl)).size,Object.keys(widgets).length);
 assert.doesNotMatch(catalog.categories.find(c=>c.id==='charts').subtitle,/\d+\s*个/);
 for(const row of rows){
  assert.equal(row.category,'charts');
  const cached=JSON.parse(readFileSync(new URL('../app'+row.conversationUrl,import.meta.url),'utf8'));
  assert.equal(cached.provenance.widget,row.widget);
  assert.equal(row.generation,'executed-official-widget-cli');
  assert.equal(cached.provenance.generation,'executed-official-widget-cli');
  assert.equal(cached.provenance.exitCode,0);
  assert.equal(cached.provenance.sample,false);
  assert.ok(catalog.tradingViewGroups.some(group=>group.id===row.widgetGroup));
  assert.equal(row.preview,row.officialDescription);
  const payload=JSON.parse(readFileSync(new URL('../app'+cached.provenance.configUrl,import.meta.url),'utf8'));
  assert.equal(payload.widget,row.widget);
  assert.match(payload.dataStatus,/no numeric market data extracted/);
  assert.match(cached.provenance.sourceAnswerSha256,/^[0-9a-f]{64}$/);
  const entries=cached.answer.reportArtifacts.map(artifact=>{
   const document=readFileSync(new URL('../app'+artifact.url,import.meta.url),'utf8');
   const match=document.match(/<script id="tv-config" type="application\/json">([\s\S]*?)<\/script>/);
   return {document,config:match?JSON.parse(match[1]):null};
  });
  const entry=entries.find(item=>item.config?.widget===row.widget);
  const retired=cached.provenance.displayEdits?.find(edit=>edit.widget===row.widget&&edit.action==='remove-unavailable');
  if(retired){assert.equal(entry,undefined);assert.ok(retired.reason);assert.equal(cached.answer.reportArtifacts.some(a=>a.url.endsWith('/'+retired.artifact)),false);assert.equal(cached.answer.interpretation.includes(retired.artifact),false);continue;}
  assert.ok(entry,`missing actual widget result: ${row.widget}`);
  const {document,config}=entry;
  assert.equal(createHash("sha256").update(document).digest("hex"),cached.provenance.artifactSha256);
  assert.equal(config.widget,row.widget);
  assert.equal(config.config.locale,'zh_CN');
  assert.equal(config.script,widgets[row.widget].script);
  assert.match(document,/tradingview-widget-copyright/);
  assert.match(cached.answer.interpretation,/TradingView.*加载|TradingView.*更新/);
 }
});


test('closing a case restores the previous home scroll; new chat still starts at the top', async () => {
  const h=setup();await tick();
  const lane=h.w.document.querySelector('.caseLane');
  for(const exit of ['button','escape','history']) {
    h.conversation.scrollTop=1640;
    lane.scrollLeft=215;
    h.w.document.querySelector('.caseCard').click();await tick();
    assert.equal(h.w.document.querySelector('.caseHomeBackground').scrollTop,1640);
    h.messages.scrollTop=650;
    if(exit==='button') h.w.document.querySelector('#caseBackButton').click();
    else if(exit==='escape') h.w.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape'}));
    else {
      h.w.history.replaceState(null,'','/');
      h.w.dispatchEvent(new h.w.PopStateEvent('popstate'));
    }
    await tick();
    assert.equal(h.conversation.scrollTop,1640,exit+' restores home position');
    assert.equal(lane.scrollLeft,215);
  }
  h.w.document.querySelector('.caseCard').click();await tick();
  h.startNewChat();await tick();
  assert.equal(h.conversation.scrollTop,0,'explicit new chat resets to top');
  h.w.close();
});


test('financial gallery renders official TradingView groups with native research separate',async()=>{
 const catalog=JSON.parse(readFileSync(new URL('../app/static/cases/inspiration/manifest.json',import.meta.url),'utf8'));
 const h=setup('https://example.com/','组件案例',catalog);await tick();
 const groups=h.w.document.querySelectorAll('.inspirationWidgetGroup');
 assert.equal(groups.length,catalog.tradingViewGroups.length+1);
 for(const group of catalog.tradingViewGroups){
  const section=h.w.document.querySelector(`#widget-group-${group.id}`).closest('section');
  const expected=catalog.cases.filter(row=>row.tool==='TradingViewChart'&&row.widgetGroup===group.id);
  assert.equal(section.querySelectorAll('[data-case]').length,expected.length);
  assert.match(section.textContent,new RegExp(group.title));
 }
 h.w.close();
});
