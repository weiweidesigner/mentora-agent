import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/case-chat.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(){
 const dom=new JSDOM('<main class="caseOverlayPanel"><section class="conversation is-case"></section><aside class="activityDrawer"></aside></main>',{url:'https://example.com/mentora/',runScripts:'outside-only'});
 const w=dom.window,requests=[];w.closeActivityDrawer=()=>w.document.querySelector('.activityDrawer').classList.remove('is-open');
 w.readEventStream=async(_body,emit)=>{emit('progress',{text:'正在核对案例'});emit('answer_text',{text:'结合案例的回答'});emit('final',{interpretation:'结合案例的回答'});};
 w.fetch=async(url,options)=>{requests.push({url,...options,body:JSON.parse(options.body)});return {ok:true,body:{}};};
 w.eval(source);
 const open=(id='demo')=>w.dispatchEvent(new w.CustomEvent('veya:case-chat-ready',{detail:{row:{id,title:'测试案例',cachedDate:'2026-10-15'},question:'原始问题',answer:{interpretation:'真实缓存中的分析结论'}}}));
 return {dom,w,d:w.document,requests,open};
}
test('case robot opens a separate drawer and sends current case plus previous turns',async()=>{
 const h=setup();h.open();assert.equal(h.requests.length,0);
 const launcher=h.d.querySelector('.caseChatLauncher');launcher.click();
 assert.equal(h.d.querySelector('.caseChatDrawer').hidden,false);assert.equal(h.d.activeElement,h.d.querySelector('textarea'));
 h.d.querySelector('.caseChatSuggestions button').click();await tick();
 assert.equal(h.requests[0].url,'/api/chat/stream');assert.match(h.requests[0].body.history[0].text,/测试案例.*原始问题/);assert.match(h.requests[0].body.history[1].text,/真实缓存/);
 assert.match(h.d.querySelector('.caseChatThread').textContent,/结合案例的回答/);
 const input=h.d.querySelector('textarea');input.value='还有什么风险？';input.dispatchEvent(new h.w.Event('input'));h.d.querySelector('form').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();
 assert.equal(h.requests[1].body.history.length,4);
 h.d.querySelector('.caseChatClose').click();assert.equal(h.d.querySelector('.caseChatDrawer').hidden,true);assert.equal(h.d.activeElement,launcher);
 launcher.click();assert.equal(h.d.querySelectorAll('.caseChatUser').length,2);
 h.w.dispatchEvent(new h.w.Event('veya:case-chat-reset'));assert.equal(h.d.querySelector('.caseChatDrawer'),null);
 h.open('another');h.d.querySelector('.caseChatLauncher').click();assert.equal(h.d.querySelectorAll('.caseChatUser').length,0);
 h.open('demo');await tick();assert.equal(h.d.querySelectorAll('.caseChatUser').length,2,'completed turns survive returning to the case');h.dom.window.close();
});
test('failed requests keep an editable draft and switching cases aborts without leaking an answer',async()=>{
 const h=setup();h.open();h.d.querySelector('.caseChatLauncher').click();
 h.w.fetch=async()=>{throw new Error('连接失败');};h.d.querySelector('.caseChatSuggestions button').click();await tick();
 assert.equal(h.d.querySelector('.caseChatError').textContent,'连接失败');assert.ok(h.d.querySelector('textarea').value);assert.equal(h.d.querySelectorAll('.caseChatUser').length,0);
 let signal,release;h.w.fetch=(_url,options)=>{signal=options.signal;return new Promise(resolve=>release=()=>resolve({ok:true,body:{}}));};
 h.d.querySelector('form').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await tick();
 h.open('other');assert.equal(signal.aborted,true);release();await tick();assert.equal(h.d.querySelectorAll('.caseChatUser').length,0);assert.doesNotMatch(h.d.querySelector('.caseChatThread').textContent,/结合案例的回答/);h.dom.window.close();
});
test('opening execution activity collapses chat, and Escape-close event returns focus to robot',async()=>{
 const h=setup();h.open();h.d.querySelector('.caseChatLauncher').click();h.w.dispatchEvent(new h.w.Event('veya:case-chat-close'));
 assert.equal(h.d.querySelector('.caseChatDrawer').hidden,true);
 h.d.querySelector('.caseChatLauncher').click();h.d.querySelector('.activityDrawer').classList.add('is-open');await tick();assert.equal(h.d.querySelector('.caseChatDrawer').hidden,true);h.dom.window.close();
});
