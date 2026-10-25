import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const start=source.indexOf('function buildShareSessionForArticle(');
const end=source.indexOf('\nfunction ',start+1);
function snapshot(currentSession,preview=false){
  const context=vm.createContext({currentSession,Date,Math,
    ensureCurrentSession:()=>{throw Error('sharing must not create a chat')},
    nearbyUserQuestionForArticle:()=> 'nearby question',
    article:{dataset:{question:'case question',startedAt:'100',sessionPersistence:preview?'none':''},classList:{contains:()=>preview},querySelector:()=>null},
    data:{interpretation:'case answer',reportUrl:'/generated/case.html'},
  });
  vm.runInContext(source.slice(start,end),context);
  return {context,result:vm.runInContext('buildShareSessionForArticle(article,data)',context)};
}
test('standalone answer sharing does not manufacture a current session',()=>{
  const {context,result}=snapshot(null);
  assert.equal(context.currentSession,null);
  assert.match(result.id,/^share-/);
  assert.equal(result.question,'case question');
  assert.equal(result.messages[0].text,'case question');
});
test('case snapshot cannot borrow or mutate an unrelated live session',()=>{
  const session={id:'real-session',title:'real title',question:'real question',messages:[],engineSessionId:'real-engine'};
  const before=JSON.stringify(session);
  const {result}=snapshot(session,true);
  assert.match(result.id,/^share-/);
  assert.equal(result.question,'case question');
  assert.equal(result.engineSessionId,undefined);
  assert.equal(JSON.stringify(session),before);
});
test('live sharing keeps the real id but does not mutate the session',()=>{
  const session={id:'real-session',question:'question',messages:[],reportUrl:'/old.html'};
  const before=JSON.stringify(session);
  const {result}=snapshot(session);
  assert.equal(result.id,'real-session');
  assert.equal(result.reportUrl,'/generated/case.html');
  assert.equal(JSON.stringify(session),before);
});
