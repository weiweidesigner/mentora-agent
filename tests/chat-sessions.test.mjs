import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
function implementation(name){
  const found=source.match(new RegExp(`(?:async )?function ${name}\\(`));
  const start=found.index;
  const tail=source.slice(start+found[0].length);
  const next=tail.search(/\n(?:async )?function /);
  return source.slice(start,next<0?undefined:start+found[0].length+next);
}

test('sidebar execution indicators follow session status, including background completion',()=>{
  const sessions=['queued','running','completed','failed','interrupted'].map(status=>({id:status,title:'Research',status,activeRunId:'possibly-stale'}));
  const historyList={innerHTML:'',querySelectorAll:()=>[]};
  const context=vm.createContext({historyList,currentSession:null,loadSessions:()=>sessions,storeSessions:()=>{},escapeHtml:value=>value});
  vm.runInContext(implementation('renderHistory'),context);
  vm.runInContext('renderHistory()',context);
  assert.equal((historyList.innerHTML.match(/class="historyRunIndicator"/g)||[]).length,2);
  assert.match(historyList.innerHTML,/aria-label="排队中"/);
  assert.match(historyList.innerHTML,/aria-label="执行中"/);
  sessions[0].status='completed';sessions[1].status='failed';
  vm.runInContext('renderHistory()',context);
  assert.doesNotMatch(historyList.innerHTML,/historyRunIndicator/);
});

test('a pending user turn is immediately restorable without an answer',()=>{
  const context=vm.createContext({});vm.runInContext(implementation('isRestorableSession'),context);
  assert.equal(vm.runInContext(`isRestorableSession({id:'new',question:'new question',status:'queued',messages:[{role:'user',text:'new question'}]})`,context),true);
  assert.equal(vm.runInContext(`isRestorableSession({id:'empty',messages:[]})`,context),false);
});

test('leaving while submission is accepted still saves the original background run',async()=>{
  let accept;const pending=new Promise(resolve=>{accept=resolve;});const saved=[];
  const initial={id:'one',title:'新建对话',question:'',messages:[],frameworkSessionIds:{}};
  const context=vm.createContext({
    currentSession:initial,lastQuestion:'',activeController:null,serverSessionReady:Promise.resolve(),
    DEFAULT_REASONING_FRAMEWORK:'deepseek',DEFAULT_INFERENCE_MODEL:'test',AbortController,
    currentThemeMode:()=> 'dark',ensureCurrentSession:()=>initial,
    imageSessionPayload:()=>[],imageRequestPayload:x=>x,
    addUserMessage:()=>({}),createAssistantMessage:()=>({}),showAgentIdentity:()=>{},
    saveCurrentSession:()=>saved.push({...initial}),persistChatSession:s=>saved.push({...s}),
    updateComposerState:()=>{},input:{focus(){}},button:{disabled:false},autoFollow:false,
    fetch:()=>pending,followChatRun:()=>assert.fail('detached view must not attach a stream'),
    showError:()=>assert.fail('navigation must not be recorded as task failure'),
  });
  vm.runInContext(implementation('submitQuestion'),context);
  const result=vm.runInContext(`submitQuestion('new research')`,context);
  assert.equal(saved[0].status,'queued');assert.equal(saved[0].messages[0].text,'new research');
  context.activeController.abort();context.activeController=null;context.currentSession=null;
  accept({ok:true,json:async()=>({runId:'run-one'})});await result;
  assert.equal(saved.at(-1).id,'one');assert.equal(saved.at(-1).activeRunId,'run-one');
});

test('late title completion cannot write the answer into a different session',async()=>{
  let finishTitle;const title=new Promise(resolve=>{finishTitle=resolve;});const saved=[];
  const first={id:'first',question:'first question',messages:[]};const second={id:'second',messages:[]};
  const context=vm.createContext({currentSession:first,messages:{querySelectorAll:()=>[]},
    currentThemeMode:()=> 'dark',DEFAULT_REASONING_FRAMEWORK:'deepseek',DEFAULT_INFERENCE_MODEL:'test',
    summarizeSessionTitle:()=>title,persistChatSession:s=>saved.push(s),Date,
  });
  vm.runInContext(implementation('recordAssistantResult'),context);
  const result=vm.runInContext(`recordAssistantResult({interpretation:'first answer',chatRunId:'run-first'})`,context);
  context.currentSession=second;finishTitle('first title');await result;
  assert.equal(saved[0].id,'first');assert.equal(saved[0].messages[0].interpretation,'first answer');
  assert.deepEqual(second.messages,[]);
});
