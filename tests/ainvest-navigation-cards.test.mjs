import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source = readFileSync(new URL('../app/static/ainvest-navigation-cards.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app/static/app.js', import.meta.url), 'utf8');
const fixtures = JSON.parse(readFileSync(new URL('../work/local-ainvest-navigation/protocol-fixtures.json', import.meta.url), 'utf8'));
const ios = 'ainvest://?deep_link_value=lh%3A%2F%2FSetting%2Fsetting';
function setup() {
  const dom = new JSDOM('<script src="https://host.test/mentora/static/ainvest-navigation-cards.js"></script>', {url:'https://host.test/mentora/',runScripts:'outside-only'});
  Object.defineProperty(dom.window.document,'currentScript',{value:dom.window.document.querySelector('script')});
  dom.window.eval(source);
  return dom;
}

test('every protocol regression URL remains directly clickable without a bridge', () => {
  const dom=setup(),w=dom.window;
  for (const fixture of fixtures) {
    const card={title:'页面入口',icon:'chart',url:fixture.expected_url};
    const html=w.AInvestNavigationCards.render(JSON.stringify(card));
    assert.ok(html,fixture.feature_id);
    w.document.body.innerHTML=html;
    const link=w.document.querySelector('a');
    assert.equal(link.getAttribute('href'),fixture.expected_url);
    assert.equal(link.querySelector('iframe'),null);
    assert.equal(link.getAttribute('onclick'),null);
    if (fixture.skill==='ainvest-web-navigation') {
      assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
    } else assert.equal(link.hasAttribute('target'),false);
  }
  dom.window.close();
});

test('renders plain JSON and a JSON code fence; preserves title as text and prefix-aware themed icon', () => {
  const dom=setup(),w=dom.window;
  const card={title:'<img src=x onerror=alert(1)>',icon:'settings',url:ios};
  for (const value of [JSON.stringify(card),'```json\n'+JSON.stringify(card)+'\n```']) {
    w.document.body.innerHTML=w.AInvestNavigationCards.render(value);
    assert.equal(w.document.querySelector('img'),null);
    assert.equal(w.document.querySelector('.ainvestNavigationTitle').textContent,card.title);
    assert.match(w.document.querySelector('.ainvestNavigationIcon').getAttribute('style'),/\/mentora\/static\/assets\/ainvest-navigation\/icons\/settings.svg/);
  }
  dom.window.close();
});

test('strict fields reject incomplete cards and diagnostics envelopes; unknown logical icons use page', () => {
  const dom=setup(),api=dom.window.AInvestNavigationCards,card={title:'设置',icon:'settings',url:ios};
  for (const bad of [{...card,feature_id:'profile.settings'}, {...card,url:''}, {...card,icon:'../../secret'}, {title:'设置',url:ios}, [card], {observation:card}]) assert.equal(api.parse(bad),null);
  assert.equal(api.parse({...card,icon:'future_icon'}).icon,'page');
  dom.window.close();
});

test('does not turn arbitrary URLs, other packages or extra Intent fields into links', () => {
  const dom=setup(),api=dom.window.AInvestNavigationCards;
  for (const url of ['javascript:alert(1)','https://www.ainvest.com.evil.test/','https://user@www.ainvest.com/','https://www.ainvest.com:443/','http://www.ainvest.com/','ainvest://evil?deep_link_value=lh%3A%2F%2FSetting%2Fsetting','ainvest://?deep_link_value=javascript:alert(1)','ainvest://?deep_link_value=lh%3A%2F%2FSetting%2Fsetting&extra=x',fixtures[0].expected_url.replace('com.ainvest.android','com.other.app'),fixtures[0].expected_url.replace(';end',';component=bad;end')]) {
    assert.equal(api.render({title:'入口',icon:'page',url}),null,url);
  }
  dom.window.close();
});

test('Markdown final text and restored/streamed text use the same card renderer', () => {
  const dom=setup(),w=dom.window;
  const formatter=appSource.slice(appSource.indexOf('function formatInsight('),appSource.indexOf('\nfunction decodeHtml('));
  w.eval(formatter);
  const card=JSON.stringify({title:'应用设置',icon:'settings',url:ios});
  for (const text of [card,'```json\n'+card+'\n```','已生成入口：\n\n```json\n'+card+'\n```']) {
    const root=w.document.createElement('div');root.innerHTML=w.formatInsight(text);
    assert.equal(root.querySelectorAll('.ainvestNavigationCard').length,1);
    assert.equal(root.querySelector('pre'),null);
  }
  assert.match(w.formatInsight('普通回答'),/<p>普通回答<\/p>/);
  assert.match(w.formatInsight('{"title":'),/正在生成页面入口/);
  dom.window.close();
});

test('host no longer loads paired-device handlers and registers new renderer before app.js', () => {
  const index=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(index,/src="\/static\/(?:app|ios|web)-navigation\.js/);
  assert.ok(index.indexOf('ainvest-navigation-cards.js')<index.indexOf('/static/app.js'));
  assert.doesNotMatch(source,/fetch\(|postMessage|localStorage|Device-Token|\/api\//);
});

test('deployment prefix rewriting does not strip or duplicate the icon base path', () => {
  const dom=setup(),w=dom.window;
  delete w.AInvestNavigationCards;
  const proxied=source.replaceAll('"/static/','"/mentora/static/').replaceAll("'/static/","'/mentora/static/").replaceAll('`/static/','`/mentora/static/');
  w.eval(proxied);
  w.document.body.innerHTML=w.AInvestNavigationCards.render({title:'设置',icon:'settings',url:ios});
  const style=w.document.querySelector('.ainvestNavigationIcon').getAttribute('style');
  assert.match(style,/\/mentora\/static\/assets/);
  assert.doesNotMatch(style,/\/mentora\/mentora\//);
  dom.window.close();
});

test('live snapshots and final conversation results both render the native three-field card', async () => {
  const dom=setup(),w=dom.window;
  w.eval(appSource.slice(appSource.indexOf('function formatInsight('),appSource.indexOf('\nfunction decodeHtml(')));
  w.sanitizeUserFacingInsight=value=>value;
  w.eval(appSource.slice(appSource.indexOf('function syncStreamAnswerPlacement('),appSource.indexOf('\nfunction renderPublicProgress(')));
  const article=w.document.createElement('article');
  article.innerHTML='<div class="finalAnswer"><div class="streamAnswerPreview"></div></div>';
  w.document.body.append(article);
  const preview=article.querySelector('.streamAnswerPreview');
  preview.streamText='{"title":';w.syncStreamAnswerPlacement(article,preview);
  assert.equal(preview.querySelector('.ainvestNavigationCard'),null);
  preview.streamText=JSON.stringify({title:'应用设置',icon:'settings',url:ios});
  w.syncStreamAnswerPlacement(article,preview);
  assert.equal(preview.querySelectorAll('.ainvestNavigationCard').length,1);
  article.activityEnded=true;w.syncStreamAnswerPlacement(article,preview);
  assert.equal(preview.querySelector('a').getAttribute('href'),ios);
  w.stripSourceInventoryFromInsight=value=>value;
  w.prepareInsightForVideos=text=>({text,hadMarker:false});
  w.buildVideoLane=()=>null;w.attachInlineAnswerSources=()=>{};
  w.eval(appSource.slice(appSource.indexOf('async function renderMixedReportFlow('),appSource.indexOf('\nfunction sanitizeUserFacingInsight(')));
  const final=w.document.createElement('div');
  await w.renderMixedReportFlow(article,{interpretation:preview.streamText,reportArtifacts:[]},final);
  assert.equal(final.querySelectorAll('.ainvestNavigationCard').length,1);
  assert.equal(final.querySelector('iframe'),null);
  dom.window.close();
});

test('every streamed card prefix hides internal JSON, including incomplete fenced cards after prose',()=>{
 const dom=setup(),w=dom.window;
 w.eval(appSource.slice(appSource.indexOf('function formatInsight('),appSource.indexOf('\nfunction decodeHtml(')));
 for(const card of [{title:'邀请奖励',icon:'account',url:ios},{url:'https://www.ainvest.com/economics/USINTR/',icon:'globe',title:'USINTR · 宏观指标历史详情'}]){
  const json=JSON.stringify(card);
  for(let end=1;end<json.length;end++){
   for(const prefix of [json.slice(0,end),'```json\n'+json.slice(0,end),'入口：\n\n```json\n'+json.slice(0,end)]){
    const root=w.document.createElement('div');root.innerHTML=w.formatInsight(prefix);
    assert(!root.querySelector('pre'),prefix);assert.doesNotMatch(root.textContent,/"(?:title|icon|url)"|deep_link_value|https:/);
   }
  }
  assert(w.formatInsight(json).includes('ainvestNavigationCard'));
 }
 assert.match(w.formatInsight('```json\n{"count":3}\n```'),/<pre>/);
 assert.equal(w.AInvestNavigationCards.render('{"title":"unrelated","count":3}'),null);
 dom.window.close();
});
