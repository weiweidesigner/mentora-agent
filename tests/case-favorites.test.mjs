import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const code=readFileSync(new URL('../app/static/case-favorites.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const iconCode=app.slice(app.indexOf('function favoriteHeartIcon('),app.indexOf('function buildResultActions('));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function setup(existing=[]){
 const dom=new JSDOM('<article class="message assistant" data-question="当前这条问题"><div class="mixedReport">当前回答</div><button class="favoriteResultButton"><span class="resultActionIcon"></span></button></article>',{url:'https://test.local',runScripts:'outside-only'});
 const w=dom.window,posts=[],events=[],removes=[],removed=[];let fail=false;
 w.eval(iconCode);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.transientShareSessionForArticle=()=>({interpretation:'当前回答',reportArtifacts:[{url:'/share-artifact/test.html'}]});w.nearbyUserQuestionForArticle=()=> '不应使用其他问题';
 w.fetch=async(url,options={})=>{
  if(options.method==='DELETE'){removes.push(JSON.parse(options.body));return{ok:!fail,json:async()=>fail?{detail:'测试取消失败'}:{removedIds:['favorite-test'],removedCount:1}};}
  if(url.endsWith('/status'))return{ok:true,json:async()=>({saved:JSON.parse(options.body).answer.interpretation==='当前回答',categories:['charts']})};
  if(options.method==='POST'){posts.push(JSON.parse(options.body));return{ok:!fail,json:async()=>fail?{detail:'测试保存失败'}:{id:'favorite-test',...posts.at(-1),conversationUrl:'/api/case-favorites/favorite-test'}};}
  return{ok:true,json:async()=>({cases:existing})};
 };
 w.addEventListener('mentora:case-favorite-saved',e=>events.push(e.detail));w.eval(code);
 w.addEventListener('mentora:case-favorite-removed',e=>removed.push(e.detail));
 return{w,dom,posts,events,removes,removed,fail:value=>fail=value};
}
test('one click saves directly to Mine without a picker; second click cancels',async()=>{
 const h=setup();try{
  const d=h.w.document,article=d.querySelector('article'),button=d.querySelector('button');
  await h.w.MentoraCaseFavorites.ready;
  h.w.MentoraCaseFavorites.open(article,button);h.w.MentoraCaseFavorites.open(article,button);await tick();
  assert.equal(h.posts.length,1);assert.equal(h.posts[0].category,'mine');assert.equal(h.posts[0].question,'当前这条问题');
  assert.equal(d.querySelector('dialog'),null);assert.equal(d.querySelector('select'),null);
  assert(button.classList.contains('is-favorited'));assert.doesNotMatch(button.querySelector('path').getAttribute('d'),/M356.1 177.4/);
  h.w.MentoraCaseFavorites.open(article,button);await tick();
  assert.equal(h.removes.length,1);assert.equal(h.removed.length,1);assert.equal(button.classList.contains('is-favorited'),false);
  assert.match(button.querySelector('path').getAttribute('d'),/M356.1 177.4/);assert.equal(button.disabled,false);
  h.w.MentoraCaseFavorites.open(article,button);await tick();assert.equal(h.posts.length,2);
 }finally{h.w.close();}
});
test('failed save stays uncollected and supports retry without a popup',async()=>{
 const h=setup();try{
  const d=h.w.document,article=d.querySelector('article'),button=d.querySelector('button');
  h.fail(true);h.w.MentoraCaseFavorites.open(article,button);await tick();
  assert.equal(button.classList.contains('is-favorited'),false);assert.match(d.querySelector('[role=alert]').textContent,/收藏失败/);
  assert.equal(button.disabled,false);h.fail(false);h.w.MentoraCaseFavorites.open(article,button);await tick();
  assert(button.classList.contains('is-favorited'));assert.equal(d.querySelector('[role=alert]'),null);
 }finally{h.w.close();}
});
test('saved exact snapshot restores a solid heart; another answer does not',async()=>{
 const h=setup([{question:'当前这条问题',category:'charts'}]);try{
  const d=h.w.document,article=d.querySelector('article');
  await h.w.MentoraCaseFavorites.sync(article);
  assert(d.querySelector('.favoriteResultButton').classList.contains('is-favorited'));
  h.w.transientShareSessionForArticle=()=>({interpretation:'同一问题的新回答'});
  await h.w.MentoraCaseFavorites.sync(article);
  assert.equal(d.querySelector('.favoriteResultButton').classList.contains('is-favorited'),false);
 }finally{h.w.close();}
});
test('failed cancellation retains the filled heart and retries',async()=>{
 const h=setup();try{
  const d=h.w.document,article=d.querySelector('article'),button=d.querySelector('button');
  h.w.MentoraCaseFavorites.open(article,button);await tick();
  h.fail(true);h.w.MentoraCaseFavorites.open(article,button);await tick();
  assert(button.classList.contains('is-favorited'));assert.equal(h.removed.length,0);assert.match(d.querySelector('[role=alert]').textContent,/取消收藏失败/);
  h.fail(false);h.w.MentoraCaseFavorites.open(article,button);await tick();assert.equal(button.classList.contains('is-favorited'),false);
 }finally{h.w.close();}
});
