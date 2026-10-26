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
 const w=dom.window,posts=[],events=[];let fail=false;
 w.eval(iconCode);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.transientShareSessionForArticle=()=>({interpretation:'当前回答',reportArtifacts:[{url:'/share-artifact/test.html'}]});w.nearbyUserQuestionForArticle=()=> '不应使用其他问题';
 w.fetch=async(url,options={})=>{if(url.endsWith('/status'))return{ok:true,json:async()=>({saved:JSON.parse(options.body).answer.interpretation==='当前回答',categories:['charts']})};if(options.method==='POST'){posts.push(JSON.parse(options.body));return{ok:!fail,json:async()=>fail?{detail:'测试保存失败'}:{id:'favorite-test',...posts.at(-1),conversationUrl:'/api/case-favorites/favorite-test'}};}return{ok:true,json:async()=>({cases:existing})};};
 w.addEventListener('mentora:case-favorite-saved',e=>events.push(e.detail));w.eval(code);
 return{w,dom,posts,events,fail:value=>fail=value};
}
test('six dropdown choices require confirmation and saved hearts become solid',async()=>{
 const h=setup();try{
  await h.w.MentoraCaseFavorites.ready;
  const d=h.w.document,article=d.querySelector('article'),button=d.querySelector('button');
  h.w.MentoraCaseFavorites.open(article,button);
  assert.deepEqual([...d.querySelectorAll('select option')].map(b=>b.textContent),['泳道','市场报告','金融图表','数据分析','金融视频','艺术绘图']);
  const select=d.querySelector('select');select.value='charts';select.dispatchEvent(new h.w.Event('change'));await tick();assert.equal(h.posts.length,0);
  assert.match(button.querySelector('path').getAttribute('d'),/M356.1 177.4/);
  d.querySelector('.caseFavoriteSubmit').click();await tick();
  assert.equal(h.posts[0].question,'当前这条问题');assert.equal(h.posts[0].answer.interpretation,'当前回答');assert.equal(h.posts[0].category,'charts');
  assert.equal(h.events.length,1);assert.match(d.querySelector('[role=status]').textContent,/已收藏到金融图表/);assert(button.classList.contains('is-favorited'));
  assert.doesNotMatch(button.querySelector('path').getAttribute('d'),/M356.1 177.4/);
  d.querySelector('.caseFavoriteClose').click();assert.equal(d.querySelector('dialog').open,false);
 }finally{h.w.close();}
});
test('save error retains dialog and selected content for retry',async()=>{
 const h=setup();try{
  h.fail(true);h.w.MentoraCaseFavorites.open(h.w.document.querySelector('article'),h.w.document.querySelector('button'));
  const d=h.w.document;d.querySelector('select').value='art';d.querySelector('.caseFavoriteSubmit').click();await tick();
  assert(d.querySelector('dialog').open);assert.match(d.querySelector('[role=status]').textContent,/测试保存失败/);assert.equal(h.events.length,0);
  assert.equal(d.querySelector('select').value,'art');
  h.fail(false);d.querySelector('.caseFavoriteSubmit').click();await tick();assert.equal(h.events.length,1);
 }finally{h.w.close();}
});

test('saved exact snapshot restores a solid heart; same question with a different answer does not',async()=>{
 const h=setup([{question:'当前这条问题',category:'charts'}]);try{
  const d=h.w.document,article=d.querySelector('article');
  await h.w.MentoraCaseFavorites.sync(article);
  assert(d.querySelector('.favoriteResultButton').classList.contains('is-favorited'));
  assert.doesNotMatch(d.querySelector('.favoriteResultButton path').getAttribute('d'),/M356.1 177.4/);
  h.w.transientShareSessionForArticle=()=>({interpretation:'同一问题的新回答'});
  await h.w.MentoraCaseFavorites.sync(article);
  assert.equal(d.querySelector('.favoriteResultButton').classList.contains('is-favorited'),false);
 }finally{h.w.close();}
});
