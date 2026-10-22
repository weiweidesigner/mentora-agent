import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const start=source.indexOf('function applyRunTiming('),end=source.indexOf('\nfunction handleStreamEvent',start);
function apply(article,event,data){const ctx=vm.createContext({article,event,data,Date});vm.runInContext(source.slice(start,end)+'\napplyRunTiming(article,event,data)',ctx);}
test('restoring a running turn retains the backend start rather than page open time',()=>{
 const original=Date.now()-17*60000,article={dataset:{startedAt:String(Date.now())}};
 apply(article,'status',{runStartedAt:original});assert.equal(Number(article.dataset.startedAt),original);
 apply(article,'tool_step',{});assert.equal(Number(article.dataset.startedAt),original);
 apply(article,'error',{thinkingElapsed:1030000});assert.equal(article.dataset.cachedElapsedMs,'1030000');
});
test('scheduled-task ISO start and terminal zero durations are supported',()=>{
 const article={dataset:{}};apply(article,'status',{runStartedAt:'2026-10-21T03:00:00+00:00'});
 assert.equal(Number(article.dataset.startedAt),Date.parse('2026-10-21T03:00:00Z'));
 apply(article,'final',{thinkingElapsed:0});assert.equal(article.dataset.cachedElapsedMs,'0');
});
test('initial activity describes startup and uses normalized Chinese language tags',()=>{
 const context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('function initialActivityTitle('),source.indexOf('function showAgentIdentity('))+
   source.slice(source.indexOf('function normalizeLang('),source.indexOf('function setArticleLanguage(')),context);
 for(const lang of ['zh','zh-CN','zh-Hans']){
  assert.equal(vm.runInContext(`initialActivityTitle(${JSON.stringify(lang)})`,context),'正在启动 Agent');
  assert.match(vm.runInContext(`initialActivityDetail(${JSON.stringify(lang)})`,context),/正在连接执行进度/);
 }
 assert.equal(vm.runInContext('initialActivityTitle("zh-TW")',context),'正在啟動 Agent');
 assert.equal(vm.runInContext('initialActivityTitle("en")',context),'Starting the agent');
});
