import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
const styles=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');
const start=source.indexOf('function updateScrollHint()');
const end=source.indexOf('function formatInsight',start);
const behavior=source.slice(start,end);

function setup(){
  const dom=new JSDOM('<section class="conversation"><div id="messages"><article class="message assistant" data-thinking-state="active"></article></div><form><button id="scrollToBottomButton" type="button" hidden></button></form></section>',{runScripts:'outside-only'});
  const w=dom.window, messages=w.document.querySelector('#messages'), button=w.document.querySelector('#scrollToBottomButton'), conversation=w.document.querySelector('.conversation');
  const frames=[];w.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
  Object.defineProperty(messages,'scrollHeight',{get:()=>1200,configurable:true});
  Object.defineProperty(messages,'clientHeight',{get:()=>400,configurable:true});
  messages.scrollTop=0;messages.scrollTo=({top})=>{messages.scrollTop=top;};
  w.eval(`const messages=document.querySelector('#messages');const normalizeLang=x=>x;${behavior} updateScrollHint();`);
  const flush=()=>{while(frames.length)frames.shift()();};
  flush();return {dom,w,messages,button,conversation,flush};
}

test('generation indicator is animated instead of visible status text',()=>{
  assert.doesNotMatch(html,/class="scrollToBottomState"/);
  assert.doesNotMatch(behavior,/\.textContent\s*=/);
});

test('scroll-to-bottom appears only with content below and reflects generation state',()=>{
  const h=setup();
  assert.equal(h.button.hidden,false);
  assert.equal(h.button.classList.contains('is-loading'),true);
  assert.match(h.button.getAttribute('aria-label'),/生成中/);
  h.messages.querySelector('.message.assistant').activityEnded=true;
  h.w.eval('updateScrollHint()');
  assert.equal(h.button.classList.contains('is-loading'),false);
  h.messages.scrollTop=800;
  h.w.eval('updateScrollHint()');assert.equal(h.button.hidden,true);
  h.dom.window.close();
});

test('composer contains the supplied down icon and animated loading dots',()=>{
  assert.match(html,/id="scrollToBottomButton"[\s\S]*viewBox="256 256 512 512"[\s\S]*M508\.928 700\.928/);
  assert.doesNotMatch(html,/M508\.928 915\.0976/);
  assert.match(html,/class="scrollToBottomLoading"[\s\S]*<i><\/i><i><\/i><i><\/i>/);
  assert.match(styles,/\.composer button\.scrollToBottomButton\{[^}]*position:absolute;[^}]*width:42px;height:42px/);
  assert.match(styles,/\.scrollToBottomLoading i\{[^}]*animation:scrollToBottomDots/);
  assert.match(styles,/\.scrollToBottomButton\.is-loading svg\{display:none\}/);
  assert.ok(styles.lastIndexOf(':root[data-theme="dark"] .composer button.scrollToBottomButton')>styles.lastIndexOf(':root[data-theme="dark"] .composer button {'));
});
