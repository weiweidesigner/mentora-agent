import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../app/static/home-background.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup({reduced=false,opening=false,failIntro=false,autoplayBlocked=false,tab=''}={}) {
  const dom=new JSDOM(html,{url:'https://example.com/mentora/'+tab,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
  let allowAudio=!autoplayBlocked;
  const listeners=new Map();w.matchMedia=q=>({matches:q.includes('reduced-motion')?reduced:true,addEventListener(name,fn){listeners.set(q,fn)}});
  const timers=new Map();let next=1;w.setTimeout=(fn,ms)=>{const id=next++;timers.set(id,{fn,ms});return id};w.clearTimeout=id=>timers.delete(id);
  for(const media of d.querySelectorAll('video')){let paused=true;Object.defineProperty(media,'paused',{get:()=>paused});media.pause=()=>{paused=true};media.play=()=>{if(failIntro&&media.id==='mentoraOpeningVideo')return Promise.reject(new Error('unsupported'));if(media.id==='mentoraOpeningVideo'&&!media.muted&&!allowAudio)return Promise.reject(new w.DOMException('User gesture required','NotAllowedError'));paused=false;return Promise.resolve()};}
  if(!opening)w.sessionStorage.setItem('mentora:opening:20261102-audio','played');
  d.documentElement.dataset.theme='dark';w.eval(script);
  return {dom,w,d,timers,allowAudio:()=>{allowAudio=true},video:d.querySelector('#homeBackdropVideo'),intro:d.querySelector('#mentoraOpeningVideo'),shell:d.querySelector('.shell'),opening:d.querySelector('#mentoraOpening')};
}
test('the same background continues through home scrolling and active chat',async()=>{
  const h=setup();assert.equal(h.video.getAttribute('src'),'/static/assets/mentora-motion/background.mp4');assert.equal(h.video.paused,false);
  const conversation=h.d.querySelector('.conversation');conversation.scrollTop=800;conversation.dispatchEvent(new h.w.Event('scroll'));
  conversation.classList.remove('is-empty');await tick();assert.equal(h.video.paused,false);assert.equal(h.shell.dataset.mentoraMotion,'active');assert.equal(h.d.querySelector('#homeBackdrop').style.transform,'');
  h.d.documentElement.dataset.theme='light';await tick();assert.equal(h.video.getAttribute('src'),'/static/assets/mentora-motion/background.mp4');
  for(const view of ['tasks-view','widgets-view','portfolio-view','character-view','case-overlay-open']){h.shell.classList.add(view);await tick();assert.equal(h.video.paused,true);assert.equal(h.shell.dataset.mentoraMotion,'inactive');h.shell.classList.remove(view);await tick();assert.equal(h.video.paused,false);}
  h.dom.window.close();
});
test('reduced motion keeps a local poster and loads neither video',()=>{
  const h=setup({reduced:true,opening:true});assert.equal(h.video.getAttribute('src'),null);assert.equal(h.intro.getAttribute('src'),null);assert.equal(h.video.getAttribute('poster'),'/static/assets/mentora-motion/poster.jpg');assert.equal(h.video.paused,true);assert.equal(h.opening.hidden,true);h.dom.window.close();
});
test('the opening runs once per tab, restores the page and starts the chat background',async()=>{
  const h=setup({opening:true});assert.equal(h.opening.hidden,false);assert.equal(h.shell.inert,true);assert.equal(h.video.paused,true);assert.equal(h.intro.paused,false);
  h.intro.dispatchEvent(new h.w.Event('ended'));await tick();assert.notEqual(h.shell.inert,true);assert.equal(h.video.paused,false);
  assert.equal(h.w.sessionStorage.getItem('mentora:opening:20261102-audio'),'played');
  for(const {fn,ms} of [...h.timers.values()])if(ms===650)fn();assert.equal(h.opening.hidden,true);
  h.w.eval(script);assert.equal(h.opening.hidden,true);h.dom.window.close();
});
test('unavailable or stalled opening video cannot leave the page inert',async()=>{
  for(const failIntro of [true,false]){const h=setup({opening:true,failIntro});if(!failIntro){[...h.timers.values()].find(x=>x.ms===8500).fn();}await tick();assert.notEqual(h.shell.inert,true);assert.equal(h.video.paused,false);h.dom.window.close();}
});
test('background pauses while the page is hidden and resumes when visible',async()=>{
  const h=setup();Object.defineProperty(h.d,'hidden',{configurable:true,value:true});h.d.dispatchEvent(new h.w.Event('visibilitychange'));assert.equal(h.video.paused,true);Object.defineProperty(h.d,'hidden',{configurable:true,value:false});h.d.dispatchEvent(new h.w.Event('visibilitychange'));await tick();assert.equal(h.video.paused,false);h.dom.window.close();
});
test('opening is decorative only and preserves the original home and chat controls',()=>{
  const h=setup({opening:true});assert.equal(h.opening.querySelectorAll('button,img,input').length,0);assert.equal(h.opening.querySelector('h1').textContent,'Mentora');for(const id of ['chatForm','messages','homeCases','inspirationTabs','appSidebar'])assert.ok(h.d.getElementById(id));assert.doesNotMatch(html,/重播开场|查看背景|暂停动态|跳过开场|从哪里开始？/);h.dom.window.close();
});
test('opening does not cover a direct link to another workspace',()=>{
  const h=setup({opening:true,tab:'?tab=portfolio'});assert.equal(h.opening.hidden,true);assert.notEqual(h.shell.inert,true);h.dom.window.close();
});


test('the opening requests audio while the resident background remains muted',async()=>{
  const h=setup({opening:true});assert.equal(h.intro.muted,false);assert.equal(h.intro.volume,.8);assert.match(h.intro.getAttribute('src'),/opening-audio\.mp4$/);assert.equal(h.video.muted,true);
  h.intro.dispatchEvent(new h.w.Event('ended'));await tick();assert.equal(h.intro.paused,true);assert.equal(h.intro.muted,true);assert.equal(h.video.muted,true);h.dom.window.close();
});
test('autoplay rejection falls back to animation, and a gesture enables sound only during the opening',async()=>{
  const h=setup({opening:true,autoplayBlocked:true});await tick();assert.equal(h.intro.muted,true);assert.equal(h.intro.paused,false);assert.equal(h.opening.hidden,false);
  h.allowAudio();h.d.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));await tick();assert.equal(h.intro.muted,false);assert.equal(h.intro.paused,false);
  h.intro.dispatchEvent(new h.w.Event('ended'));await tick();h.d.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));await tick();assert.equal(h.intro.muted,true);assert.equal(h.intro.paused,true);assert.equal(h.video.muted,true);assert.equal(h.video.paused,false);h.dom.window.close();
});
