import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function publicToolObservation('),source.indexOf('function cachedToolStepData(')),context);
function observation(value){context.input=value;return vm.runInContext('publicToolObservation(input)',context);}
test('saved pending invocation envelopes are not displayed as completed output',()=>{
 assert.equal(observation(JSON.stringify({turn:1,step:39,callId:'call',name:'bash',arguments:'{"command":"cat SKILL.md"}'})),'');
});
test('native result envelopes expose returned text while ordinary JSON output stays intact',()=>{
 assert.equal(observation(JSON.stringify({message:{role:'tool',content:[{type:'text',text:'Actual result'},{type:'image',data:'not public text'}]}})),'Actual result');
 const result=JSON.stringify({ok:true,count:5});assert.equal(observation(result),result);
 assert.equal(observation('Usage: tool --input file'),'Usage: tool --input file');
});
test('empty file probes are hidden and failed file handoffs become user-facing text',()=>{
 assert.equal(observation('No files found'),'');
 const failure=JSON.stringify({failed:true,summary:'Error: cannot read "/srv/outputs/missing.json": not found',handoff:'internal'});
 assert.equal(observation(failure),'所需中间文件未生成，已停止读取并切换可用结果。');
});
test('a running tool has no result card and completion replaces a stale card on the same row',()=>{
 const dom=new JSDOM('<article><ol class="thinkingSteps"></ol></article>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.normalizeLang=value=>value;w.toolActivityTitle=()=> 'Reading instructions';w.toolStepDescription=()=>'';
  w.escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;');
  w.toolBlockHtml=(label,value)=>`<pre>${w.escapeHtml(value)}</pre>`;
  w.skillOutputLabel=()=> 'Tool result';w.compactReasoningTitle=value=>value||'';
  w.modelActivitySummary=value=>value||'';
  w.updateThinkingSummary=()=>{};w.copyFor=()=>'';w.syncActivityDrawer=()=>{};
  w.appendRichStep=(article,options)=>{
   const li=w.document.createElement('li');li.className='is-tool-step is-loading';
   li.innerHTML=`<div class="activityStepTitle">${options.titleHtml}</div><div class="activityDrawerOnly">${options.drawerDetailHtml}</div>`;
   article.querySelector('.thinkingSteps').appendChild(li);return li;
  };
  w.eval(source.slice(source.indexOf('function appendToolStep('),source.indexOf('function cachedToolStepData(')));
  const article=w.document.querySelector('article'),base={tool:'bash',script:'bash',callId:'same-call'};
  w.appendToolStep(article,{...base,phase:'started',observation:'transport metadata'});
  assert.equal(article.querySelector('.toolStepOutputBlock'),null);
  article.querySelector('details .toolStepDetail').insertAdjacentHTML('beforeend','<div class="toolStepOutputBlock">stale call envelope</div>');
  w.appendToolStep(article,{...base,phase:'completed',observation:'Actual <result>'});
  assert.equal(article.querySelectorAll('li').length,1);
  assert.equal(article.querySelectorAll('.toolStepOutputBlock').length,1);
  assert.equal(article.querySelector('.toolStepOutputBlock').textContent,'Actual <result>');
  assert.equal(article.querySelector('result'),null);
  assert.ok(article.querySelector('li').classList.contains('is-done'));
 }finally{dom.window.close();}
});
