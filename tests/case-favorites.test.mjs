import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const code=readFileSync(new URL('../app/static/case-favorites.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function setup(){
 const dom=new JSDOM('<article class="message assistant" data-question="当前这条问题"><div class="mixedReport">当前回答</div><button class="favoriteResultButton"></button></article>',{url:'https://test.local',runScripts:'outside-only'});
 const w=dom.window,posts=[],events=[];let fail=false;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.transientShareSessionForArticle=()=>({interpretation:'当前回答',reportArtifacts:[{url:'/share-artifact/test.html'}]});w.nearbyUserQuestionForArticle=()=> '不应使用其他问题';
 w.fetch=async(url,options={})=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));return{ok:!fail,json:async()=>fail?{detail:'测试保存失败'}:{id:'favorite-test',...posts.at(-1),conversationUrl:'/api/case-favorites/favorite-test'}};}return{ok:true,json:async()=>({cases:[]})};};
 w.addEventListener('mentora:case-favorite-saved',e=>events.push(e.detail));w.eval(code);
 return{w,dom,posts,events,fail:value=>fail=value};
}
test('six choices save the exact answer snapshot, announce success and do not execute',async()=>{
 const h=setup();try{
  await h.w.MentoraCaseFavorites.ready;
  const d=h.w.document,article=d.querySelector('article'),button=d.querySelector('button');
  h.w.MentoraCaseFavorites.open(article,button);
  assert.deepEqual([...d.querySelectorAll('[data-favorite-category]')].map(b=>b.textContent),['泳道','市场报告','金融图表','数据分析','金融视频','艺术绘图']);
  d.querySelector('[data-favorite-category=charts]').click();await tick();
  assert.equal(h.posts[0].question,'当前这条问题');assert.equal(h.posts[0].answer.interpretation,'当前回答');assert.equal(h.posts[0].category,'charts');
  assert.equal(h.events.length,1);assert.match(d.querySelector('[role=status]').textContent,/已收藏到金融图表/);assert(button.classList.contains('is-favorited'));
  d.querySelector('.caseFavoriteClose').click();assert.equal(d.querySelector('dialog').open,false);
 }finally{h.w.close();}
});
test('save error retains dialog and selected content for retry',async()=>{
 const h=setup();try{
  h.fail(true);h.w.MentoraCaseFavorites.open(h.w.document.querySelector('article'),h.w.document.querySelector('button'));
  const d=h.w.document;d.querySelector('[data-favorite-category=art]').click();await tick();
  assert(d.querySelector('dialog').open);assert.match(d.querySelector('[role=status]').textContent,/测试保存失败/);assert.equal(h.events.length,0);
  h.fail(false);d.querySelector('[data-favorite-category=art]').click();await tick();assert.equal(h.events.length,1);
 }finally{h.w.close();}
});
