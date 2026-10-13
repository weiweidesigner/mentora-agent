import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../app/static/cases.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
function setup(url = 'https://example.com/', text = '完整缓存答案') {
  const dom = new JSDOM(`<main class="conversation is-empty"><form id="chatForm"><input id="question"></form><section id="homeCases"><div id="caseGrid"></div></section><header id="caseDetailHeader" hidden><button id="caseBackButton"></button><span id="caseCacheDate"></span></header><div id="messages"></div><div id="caseActionBar" hidden><button id="caseAskButton"></button></div></main>`, { url });
  const w = dom.window;
  const rows = [{id:'amd', title:'AMD', tag:'评级', preview:'市场共识', cachedDate:'2026-10-13', question:'AMD 最新评级如何？', conversationUrl:'/static/cases/amd/conversation.json'}];
  const requests = [], sent = [];
  const conversation = w.document.querySelector('main'), input = w.document.querySelector('input'), messages = w.document.querySelector('#messages'), form = w.document.querySelector('form');
  form.requestSubmit = () => sent.push(input.value);
  const context = vm.createContext({window:w, document:w.document, history:w.history, location:w.location, URL, URLSearchParams, structuredClone, requestAnimationFrame: fn => fn(), conversation, input, messages, form,
    escapeHtml: value => value, isMobileLayout: () => false, closeActivityDrawer: () => {}, updateComposerState: () => {},
    startNewChat: () => {w.dispatchEvent(new w.Event('veya:chat-navigate')); messages.innerHTML=''; conversation.classList.add('is-empty'); input.value='';},
    addUserMessage: question => {const el=w.document.createElement('p');el.textContent=question;messages.append(el);},
    createAssistantMessage: () => {const el=w.document.createElement('article');el.innerHTML='<div class="finalAnswer"></div>';messages.append(el);return el;},
    sanitizeUserFacingInsight: value => value, formatInsight: value => `<p>${value}</p>`,
    renderFinalAnswer: (article, answer) => {article.textContent=answer.interpretation;},
    fetch: async url => {requests.push(url); return {ok:true,json:async()=>url.endsWith('manifest.json')?rows:{question:rows[0].question,answer:{interpretation:text}}};},
  });
  vm.runInContext(source,context);
  return {w, requests, sent, conversation, messages};
}
test('case replay loads cached conversation without inference; ask sends its question', async () => {
  const h=setup();await tick();
  h.w.document.querySelector('.caseCard').click();await tick();
  assert.match(h.messages.textContent,/AMD 最新评级如何？完整缓存答案/);
  assert.equal(h.w.document.querySelector('#caseActionBar').hidden,false);
  assert.equal(h.requests.length,2);
  h.w.document.querySelector('#caseAskButton').click();
  assert.deepEqual(h.sent,['AMD 最新评级如何？']);
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
  h.w.matchMedia=()=>({matches:true});await tick();
  h.w.document.querySelector('.caseCard').click();await tick();
  assert.ok(h.messages.textContent.includes(text));
  assert.equal(h.messages.querySelector('.cachedReplay'),null);
});

test('all six published cases have complete answers and portable cached charts', () => {
  const rows=JSON.parse(readFileSync(new URL('../app/static/cases/manifest.json',import.meta.url),'utf8'));
  assert.equal(rows.length,6);
  assert.equal(new Set(rows.map(row=>row.id)).size,6);
  for (const row of rows) {
    const cached=JSON.parse(readFileSync(new URL('../app'+row.conversationUrl,import.meta.url),'utf8'));
    assert.equal(cached.question,row.question);
    assert.equal(cached.cachedAt.slice(0,10),row.cachedDate);
    const artifactText=cached.answer.reportArtifacts.map(artifact=>readFileSync(new URL('../app'+artifact.url,import.meta.url),'utf8').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,'')).join('');
    assert.ok(cached.answer.interpretation.length+artifactText.length>500);
    assert.ok(cached.answer.reportArtifacts.length>0);
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


test('A-share case demonstrates one integrated StreamViz report without duplicate prose', () => {
  const cached=JSON.parse(readFileSync(new URL('../app/static/cases/ashare-dashboard/conversation.json',import.meta.url),'utf8'));
  assert.equal(cached.answer.reportArtifacts.length,1);
  assert.match(cached.answer.interpretation,/^\[\[AIME_CHART:case:ashare-dashboard\/case-ashare-streamviz-report.html\]\]$/);
  const report=readFileSync(new URL('../app'+cached.answer.reportArtifacts[0].url,import.meta.url),'utf8');
  assert.match(report,/data-aime-streamviz-root="true"/);
  assert.match(report,/data-financial-market="CN"/);
  for (const section of ['指数对照','市场宽度','板块分化','行业强弱','活跃个股','接下来观察什么','数据与口径']) assert.ok(report.includes(section));
  assert.match(report,/2909 家 · 52.32%/);
  assert.match(report,/2485 家 · 44.69%/);
  assert.match(report,/2026-10-13 收盘缓存/);
  assert.doesNotMatch(report,/<script|<iframe/);
});
