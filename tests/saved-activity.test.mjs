import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('async function restoreSavedActivity('),source.indexOf('// History and scheduled runs share'));
function fixture(events=[]){
 const dom=new JSDOM('<article><ol class="thinkingSteps"></ol><div class="finalAnswer">原始答案</div></article>',{runScripts:'outside-only'});
 const w=dom.window,article=w.document.querySelector('article'),requests=[];
 article.activityEnded=true;
 w.appendStep=(el,title,detail,state)=>{const li=w.document.createElement('li');li.className=state==='error'?'is-error':'is-loading';li.textContent=title+' '+detail;el.querySelector('ol').append(li);};
 w.appendToolStep=(el,data)=>{assert.equal(el.activityEnded,false);w.appendStep(el,'工具 '+data.callId,data.observation||'','done');};
 w.appendAgentChatEvent=(el,data)=>w.appendStep(el,'Agent',data.message,'done');
 w.appendModuleErrorStep=(el,data)=>w.appendStep(el,'失败',data.message,'error');
 w.shouldRenderStatusEvent=()=>true;w.statusTitle=d=>d.title;w.statusDetail=d=>d.detail||'';w.syncActivityDrawer=()=>{};
 w.fetch=async url=>{requests.push(url);return{ok:true,json:async()=>({events})};};
 w.eval(helper);
 return{dom,w,article,requests};
}
test('historical activity restores real tools and public progress without replaying answers',async()=>{
 const f=fixture([{event:'progress',data:{text:'核验数据来源'}},{event:'tool_step',data:{callId:'actual-tool',observation:'真实结果'}},{event:'final',data:{interpretation:'不应重复渲染'}}]);
 await f.w.restoreSavedActivity(f.article,{runId:'saved-run',elapsedMs:851000});
 assert.equal(f.requests[0],'/api/chat/runs/saved-run/activity');
 assert.match(f.article.querySelector('ol').textContent,/核验数据来源.*真实结果/);
 assert.equal(f.article.querySelector('.finalAnswer').textContent,'原始答案');
 assert.equal(f.article.querySelectorAll('.is-loading').length,0);
 assert.equal(f.article.dataset.cachedElapsedMs,'851000');
 await f.w.restoreSavedActivity(f.article,{runId:'saved-run'});
 assert.equal(f.requests.length,1);f.dom.window.close();
});
test('case cache restores locally, preserves failures and escapes untrusted text',async()=>{
 const f=fixture();
 await f.w.restoreSavedActivity(f.article,{steps:[{title:'取数',detail:'缓存真实结果'},{title:'核验失败',detail:'<img src=x onerror=alert(1)>',state:'error'}],elapsedMs:24000});
 assert.equal(f.requests.length,0);
 assert.equal(f.article.querySelectorAll('li').length,2);
 assert.equal(f.article.querySelectorAll('img').length,0);
 assert.equal(f.article.querySelectorAll('.is-error').length,1);
 assert.equal(f.article.dataset.cachedElapsedMs,'24000');f.dom.window.close();
});
test('missing and unavailable activity is explicitly identified, never fabricated',async()=>{
 const f=fixture();await f.w.restoreSavedActivity(f.article,{});
 assert.match(f.article.textContent,/执行明细未保存/);
 assert.equal(f.article.querySelectorAll('.is-loading').length,0);f.dom.window.close();
});
