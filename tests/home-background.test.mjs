import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../app/static/home-background.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup({reduced=false,opening=false,failIntro=false,autoplayBlocked=false,deferAutoplay=false,tab=''}={}) {
  const dom=new JSDOM(html,{url:'https://example.com/mentora/'+tab,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
  let allowAudio=!autoplayBlocked, autoplayReject, introAttempts=0;
  const listeners=new Map();w.matchMedia=q=>({matches:q.includes('reduced-motion')?reduced:true,addEventListener(name,fn){listeners.set(q,fn)}});
  const timers=new Map();let next=1;w.setTimeout=(fn,ms)=>{const id=next++;timers.set(id,{fn,ms});return id};w.clearTimeout=id=>timers.delete(id);
  for(const media of d.querySelectorAll('video,audio')){let paused=true;Object.defineProperty(media,'paused',{get:()=>paused});media.pause=()=>{paused=true};media.play=()=>{if(media.id==='mentoraOpeningVideo'&&++introAttempts===1&&deferAutoplay)return new Promise((resolve,reject)=>{autoplayReject=reject});if(failIntro&&media.id==='mentoraOpeningVideo')return Promise.reject(new Error('unsupported'));if(media.id==='mentoraOpeningVideo'&&!media.muted&&!allowAudio)return Promise.reject(new w.DOMException('User gesture required','NotAllowedError'));paused=false;return Promise.resolve()};}
  if(!opening)d.querySelector('#mentoraOpening').remove();
  w.sessionStorage.setItem('mentora:opening:20261102-audio','played');
  d.documentElement.dataset.theme='dark';w.eval(script);
  return {dom,w,d,timers,allowAudio:()=>{allowAudio=true},rejectAutoplay:()=>autoplayReject(new w.DOMException('User gesture required','NotAllowedError')),video:d.querySelector('#homeBackdropVideo'),intro:d.querySelector('#mentoraOpeningVideo'),shell:d.querySelector('.shell'),opening:d.querySelector('#mentoraOpening')};
}
test('the same background continues through home scrolling and active chat',async()=>{
  const h=setup();assert.equal(h.video.getAttribute('src'),'/static/assets/mentora-motion/background-hq.mp4');assert.equal(h.video.paused,false);
  const conversation=h.d.querySelector('.conversation');conversation.scrollTop=800;conversation.dispatchEvent(new h.w.Event('scroll'));
  conversation.classList.remove('is-empty');await tick();assert.equal(h.video.paused,false);assert.equal(h.shell.dataset.mentoraMotion,'active');assert.equal(h.d.querySelector('#homeBackdrop').style.transform,'');
  h.d.documentElement.dataset.theme='light';await tick();assert.equal(h.video.getAttribute('src'),'/static/assets/mentora-motion/background-hq.mp4');
  for(const view of ['tasks-view','widgets-view','portfolio-view','character-view','case-overlay-open']){h.shell.classList.add(view);await tick();assert.equal(h.video.paused,true);assert.equal(h.shell.dataset.mentoraMotion,'inactive');h.shell.classList.remove(view);await tick();assert.equal(h.video.paused,false);}
  h.dom.window.close();
});
test('reduced motion keeps a local poster and loads neither video',()=>{
  const h=setup({reduced:true,opening:true});assert.equal(h.video.getAttribute('src'),null);assert.equal(h.intro.getAttribute('src'),null);assert.equal(h.video.getAttribute('poster'),'/static/assets/mentora-motion/poster-hq.jpg');assert.equal(h.video.paused,true);assert.equal(h.opening.hidden,true);h.dom.window.close();
});
test('each fresh page starts its opening despite the previous played record, while duplicate initialization is ignored',async()=>{
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
test('refreshing another workspace also plays the opening and retains its destination',async()=>{
  const h=setup({opening:true,tab:'?tab=portfolio'});h.shell.classList.add('portfolio-view');await tick();assert.equal(h.opening.hidden,false);assert.equal(h.shell.inert,true);assert.equal(h.w.location.search,'?tab=portfolio');h.intro.dispatchEvent(new h.w.Event('ended'));await tick();assert.notEqual(h.shell.inert,true);assert.equal(h.shell.dataset.mentoraMotion,'inactive');h.dom.window.close();
});


test('the opening requests audio while the resident background remains muted',async()=>{
  const h=setup({opening:true});assert.equal(h.intro.muted,false);assert.equal(h.intro.volume,.8);assert.match(h.intro.getAttribute('src'),/opening-audio\.mp4$/);assert.equal(h.video.muted,true);
  h.intro.dispatchEvent(new h.w.Event('ended'));await tick();assert.equal(h.intro.paused,true);assert.equal(h.intro.muted,true);assert.equal(h.video.muted,true);h.dom.window.close();
});
test('autoplay rejection falls back to animation, and a gesture enables sound only during the opening',async()=>{
  const h=setup({opening:true,autoplayBlocked:true});await tick();assert.equal(h.intro.muted,true);assert.equal(h.intro.paused,false);assert.equal(h.opening.hidden,false);
  assert.equal(h.opening.querySelector('p').textContent,'欢迎来到股神大肥鱼世界');assert.equal(h.opening.dataset.sound,'blocked');h.intro.currentTime=3.5;
  h.allowAudio();h.d.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));await tick();assert.equal(h.intro.muted,false);assert.equal(h.intro.paused,false);assert.equal(h.intro.currentTime,0);assert.equal(h.opening.dataset.sound,'playing');assert.doesNotMatch(h.opening.textContent,/点击画面/);
  h.intro.dispatchEvent(new h.w.Event('ended'));await tick();h.d.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));await tick();assert.equal(h.intro.muted,true);assert.equal(h.intro.paused,true);assert.equal(h.video.muted,true);assert.equal(h.video.paused,false);h.dom.window.close();
});


test('an early user gesture wins over a late autoplay permission rejection',async()=>{
  const h=setup({opening:true,autoplayBlocked:true,deferAutoplay:true});
  h.allowAudio();h.d.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));await tick();assert.equal(h.intro.muted,false);assert.equal(h.intro.paused,false);
  h.rejectAutoplay();await tick();assert.equal(h.intro.muted,false);assert.equal(h.intro.paused,false);h.dom.window.close();
});


test('a second page refresh starts a new opening even with a previous played record',()=>{
  for(let i=0;i<2;i++){const h=setup({opening:true});assert.equal(h.opening.hidden,false);assert.equal(h.intro.paused,false);h.dom.window.close();}
});
test('keyboard activation starts sound from the beginning and slow loading gets a complete playback window',async()=>{
  const h=setup({opening:true,autoplayBlocked:true});await tick();const before=[...h.timers.keys()];h.intro.dispatchEvent(new h.w.Event('playing'));assert.ok(before.some(id=>!h.timers.has(id)));
  h.intro.currentTime=4;h.allowAudio();h.d.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));await tick();assert.equal(h.intro.muted,true);assert.equal(h.intro.currentTime,4);
  h.d.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await tick();assert.equal(h.intro.muted,false);assert.equal(h.intro.currentTime,0);h.dom.window.close();
});


test('opt-in audio diagnostics preserve the original browser error without changing default UI',async()=>{
  const ordinary=setup({opening:true,autoplayBlocked:true});await tick();assert.equal(ordinary.d.querySelector('#mentoraOpeningDebug'),null);ordinary.dom.window.close();
  const h=setup({opening:true,autoplayBlocked:true,tab:'?openingDebug=1'});await tick();const report=JSON.parse(h.d.querySelector('#mentoraOpeningDebug').textContent);const denied=report.events.find(e=>e.event==='audible-rejected');assert.equal(denied.error.name,'NotAllowedError');assert.equal(denied.error.message,'User gesture required');assert.equal(h.intro.muted,true);h.dom.window.close();
});

test('diagnostics are collapsed, dismissible and removed from the refresh URL',async()=>{
 const h=setup({opening:true,autoplayBlocked:true,tab:'?tab=character&openingDebug=1#keep'});await tick();
 const panel=h.d.querySelector('#mentoraOpeningDebugPanel');assert.ok(panel);assert.equal(panel.querySelector('details').open,false);
 assert.equal(h.w.location.search,'?tab=character');assert.equal(h.w.location.hash,'#keep');
 panel.querySelector('button[aria-label="关闭声音诊断"]').click();assert.equal(h.d.querySelector('#mentoraOpeningDebugPanel'),null);
 h.intro.dispatchEvent(new h.w.Event('playing'));assert.equal(h.d.querySelector('#mentoraOpeningDebugPanel'),null);h.dom.window.close();
});

test('the welcome reveal waits for actual video playback and is cancelled when the opening ends',async()=>{
  const h=setup({opening:true});
  assert.equal(h.intro.preload,'auto');
  assert.equal([...h.timers.values()].some(x=>x.ms===1100),false);
  h.intro.dispatchEvent(new h.w.Event('playing'));
  const reveal=[...h.timers.values()].find(x=>x.ms===1100);
  assert.ok(reveal);assert.equal(h.opening.classList.contains('is-revealed'),false);
  reveal.fn();assert.equal(h.opening.classList.contains('is-revealed'),true);
  h.intro.dispatchEvent(new h.w.Event('ended'));await tick();
  reveal.fn();assert.equal(h.opening.classList.contains('is-revealed'),false);
  assert.ok(html.indexOf('/static/home-background.js')<html.indexOf('/static/app.js'));
  h.dom.window.close();
});

test('welcome voice plays only after the opening fades and the home is visible',async()=>{
 const h=setup({opening:true});const voice=h.d.querySelector('#mentoraWelcomeAudio');assert.equal(voice.paused,true);assert.equal(voice.getAttribute('src'),null);
 h.intro.dispatchEvent(new h.w.Event('ended'));await tick();assert.equal(voice.paused,true);
 [...h.timers.values()].find(t=>t.ms===650).fn();await tick();assert.equal(h.opening.hidden,true);assert.equal(voice.paused,false);assert.match(voice.getAttribute('src'),/welcome-back-oneesan\.mp3$/);
 h.w.dispatchEvent(new h.w.Event('pagehide'));assert.equal(voice.paused,true);h.dom.window.close();
});
test('welcome never plays on another workspace or after interrupted opening',async()=>{
 for(const target of ['workspace','hidden','error']){
  const h=setup({opening:true});const voice=h.d.querySelector('#mentoraWelcomeAudio');
  if(target==='workspace'){h.shell.classList.add('character-view');h.intro.dispatchEvent(new h.w.Event('ended'));}
  if(target==='hidden'){Object.defineProperty(h.d,'hidden',{configurable:true,value:true});h.d.dispatchEvent(new h.w.Event('visibilitychange'));}
  if(target==='error')h.intro.dispatchEvent(new h.w.Event('error'));
  for(const t of h.timers.values())if(t.ms===650)t.fn();await tick();assert.equal(voice.paused,true);assert.equal(voice.getAttribute('src'),null);h.dom.window.close();
 }
});
