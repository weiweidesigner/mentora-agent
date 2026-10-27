import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import policy from '../app/dsh_lightweight_guard.cjs';
const {LightweightGuard, failed, webFetchFailed, compactToolResult, JOB_POLL_TIMEOUT_MS} = policy;
const ok = text => ({content: [{type: 'text', text}], isError: false});
const shell = (command, extra = {}) => ({name: 'bash', arguments: {command, description: 'query', ...extra}});
const setup = t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mentora-guard-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return {root, guard: new LightweightGuard(root)};
};

test('failed research does not substitute its receipt for another data or search command', async t => {
  const {guard}=setup(t);let bodies=0;
  for(const symbol of ['bad','other','bad']){
    const result=await guard.execute(shell(`python3 app/skills/a-share-data/scripts/price_snapshot.py --thscodes ${symbol}`),async()=>{bodies++;return ok('[exit code: 1] Target not found');});
    assert.match(result.content[0].text,/Target not found|deduplicated|one allowed alternative/);
  }
  assert.equal(bodies,3);assert.equal(guard.cache.size,0);
  const search=await guard.execute({name:'web_search',arguments:{query:'independent evidence'}},async()=>ok('actual search evidence'));
  assert.equal(search.content[0].text,'actual search evidence');
});

test('every wrapped result contains only losslessly serializable content and isError', async t => {
  const {guard}=setup(t);
  const raw={content:[{type:'text',text:'small result',metadata:{count:1n}}],isError:false,value:{exitCode:0},internal:()=>{}};
  const result=await guard.execute(shell('python3 local.py'),async()=>raw);
  assert.deepEqual(Object.keys(result).sort(),['content','isError','value']);
  assert.equal(result.content[0].metadata.count,'1');
  assert.equal(result.value.exitCode,0);
  const encoded=JSON.stringify(result);
  assert.deepEqual(JSON.parse(encoded),result);
});

test('different renderers, calculations and file checks always execute their actual commands', async t => {
  const {guard}=setup(t);const calls=[];
  const commands=[
    'python3 app/skill_runner.py execute --script bar_chart.py -- --payload bar.json --output outputs/generated/bar.html',
    'python3 app/skill_runner.py execute --script group_line.py -- --payload line.json --output outputs/generated/line.html',
    'ls -l outputs/generated/line.html',
    'python3 app/skills/code-interpreter/scripts/code_interpreter.py --input first.json',
    'python3 app/skills/code-interpreter/scripts/code_interpreter.py --input second.json',
    'python3 app/skills/streamviz/scripts/inspect_html.py outputs/generated/bar.html',
    'python3 app/skills/streamviz/scripts/inspect_html.py outputs/generated/line.html',
  ];
  for(const command of commands){
    const result=await guard.execute(shell(command),async()=>{calls.push(command);return ok(command);});
    assert.equal(result.content[0].text,command);
  }
  assert.deepEqual(calls,commands);
  const missing=await guard.execute(shell('ls outputs/generated/missing.html'),async()=>({content:[{type:'text',text:'No such file'}],isError:true}));
  assert.equal(missing.isError,true);
  assert.doesNotMatch(missing.content[0].text,/bar_chart/);
});

test('large executable contracts retain exact CLI and schema instead of dataset compaction', t => {
  const {root}=setup(t);
  const contract={ok:true,capability:'group_line',cliHelp:'help '.repeat(1200),schema:{required:['data','series'],properties:{series:{description:'field '.repeat(1000)}}}};
  const text=JSON.stringify(contract);
  const result=compactToolResult(shell('python3 app/skill_runner.py contract --script group_line.py'),ok(text),root);
  assert.deepEqual(JSON.parse(result.content[0].text),contract);
});

test('reading a capability contract does not consume its execution stage', async t => {
  const {guard}=setup(t);let bodies=0;
  const contract=shell('python3 app/skill_runner.py contract --script code_interpreter.py');
  const execute=shell('python3 app/skill_runner.py execute --script code_interpreter.py -- --payload input.json --transform-file transform.py --output receipt.html --payload-output result.json');
  assert.equal((await guard.execute(contract,async()=>{bodies++;return ok('contract');})).content[0].text,'contract');
  assert.equal((await guard.execute(execute,async()=>{bodies++;return ok('computed');})).content[0].text,'computed');
  assert.equal(bodies,2);
});

test('elapsed time and many tool calls never force a workflow phase or stop research', async t => {
  const {root}=setup(t);let time=0,bodies=0;const guard=new LightweightGuard(root,()=>time);
  for(let i=0;i<24;i++){
    time+=100000;
    for(const exec of [{name:'web_search',arguments:{query:`new evidence ${i}`}}, {name:'web_fetch',arguments:{url:`https://example.com/${i}`}}]){
      const result=await guard.execute(exec,async()=>{bodies++;return ok('evidence');});
      assert.equal(result.isError,false);
    }
  }
  assert.equal(bodies,48);
});

test('model can revise a completed report, render again, inspect images and delegate', async t => {
  const {root,guard}=setup(t);let bodies=0;
  const file=path.join(root,'report.html');fs.writeFileSync(file,'<html>existing</html>');
  const calls=[shell(`python3 app/skills/generic-chart/scripts/bar_chart.py --output ${file}`),
    {name:'edit',arguments:{file_path:file}},shell(`python3 -c 'open("${file}", "w").write("corrected")'`),
    {name:'read_image',arguments:{file_path:path.join(root,'outputs','validation','chart.png')}},
    {name:'subagent',arguments:{task:'independent investigation'}},shell('python3 fetch.py',{run_in_background:true})];
  for(const exec of calls)for(let i=0;i<2;i++){
    assert.equal((await guard.execute(exec,async()=>{bodies++;return ok('actual result');})).isError,false);
  }
  assert.equal(bodies,12);
});

test('changed payloads and deleted output files invalidate a cached data CLI result', async t => {
  const {root,guard}=setup(t),input=path.join(root,'input.json'),output=path.join(root,'output.json');
  fs.writeFileSync(input,'one');let bodies=0;
  const exec=shell(`python3 app/skills/screener/scripts/run.py --input ${input} --output ${output}`);
  const body=async()=>{bodies++;fs.writeFileSync(output,fs.readFileSync(input));return ok('data');};
  await guard.execute(exec,body);await guard.execute(exec,body);assert.equal(bodies,1);
  fs.writeFileSync(input,'changed');await guard.execute(exec,body);assert.equal(bodies,2);
  fs.unlinkSync(output);await guard.execute(exec,body);assert.equal(bodies,3);
});

test('completion from a previous turn cannot repopulate the next turn cache', async t => {
  const {guard}=setup(t);let release;
  const pending=guard.execute({name:'web_fetch',arguments:{url:'https://example.com'}},()=>new Promise(resolve=>{release=resolve;}));
  guard.reset();release(ok('old result'));await pending;assert.equal(guard.cache.size,0);
});

test('caller cancellation and exceptions pass through unchanged', async t => {
  const {guard}=setup(t),controller=new AbortController(),failure=new Error('actual tool error');
  const exec={name:'web_fetch',arguments:{url:'https://example.com'},signal:controller.signal};
  await assert.rejects(guard.execute(exec,async()=>{assert.equal(exec.signal,controller.signal);throw failure;}),error=>error===failure);
  assert.equal(guard.cache.size,0);assert.equal(guard.flights.size,0);
});

test('runtime cache never injects a prompt or hides tools and resets on a new turn', async () => {
  const handlers=new Map();policy.apply({on:(name,fn)=>handlers.set(name,fn)});
  assert.deepEqual(policy.inject,['tools']);
  const agent={},file={name:'read',arguments:{file_path:'/nonexistent-fixture'},agent};let bodies=0;
  const call=()=>handlers.get('tools/execute')(file,async()=>{bodies++;return ok('actual read');});
  for(let i=0;i<20;i++){handlers.get('agent/pre-step')({agent,messages:[]},()=>{});await call();}
  assert.equal(bodies,1);
  handlers.get('agent/turn-stopping')({agent});await call();assert.equal(bodies,2);
  handlers.get('agent/pre-step')({agent,messages:[{source:{kind:'user'}}]},()=>{});await call();assert.equal(bodies,3);
});

test('identical reads reuse the actual result; changed files and later turns invalidate it', async t => {
  const {root, guard} = setup(t); const file = path.join(root, 'data.json');fs.writeFileSync(file, 'one');
  const exec = {name: 'read', arguments: {file_path: file}}; let bodies = 0;
  const body = async () => {bodies++;return ok(fs.readFileSync(file, 'utf8'));};
  assert.deepEqual(await guard.execute(exec, body), await guard.execute(exec, body));
  assert.equal(bodies, 1);
  fs.writeFileSync(file, 'changed');await guard.execute(exec, body);assert.equal(bodies, 2);
  guard.reset();await guard.execute(exec, body);assert.equal(bodies, 3);
});

test('query cache expires after 60 seconds and descriptions do not bypass reuse', async t => {
  const {root} = setup(t);let time = 0;const guard = new LightweightGuard(root, () => time);let bodies = 0;
  const command = 'python3 app/skills/screener/scripts/run.py --market china';
  const body = async () => {bodies++;return ok('market data');};
  await guard.execute(shell(command), body);
  await guard.execute(shell(command, {description: 'renamed query'}), body);assert.equal(bodies, 1);
  time = 60001;await guard.execute(shell(command), body);assert.equal(bodies, 2);
});

test('concurrent identical queries share one in-flight execution', async t => {
  const {guard} = setup(t);let release;let bodies = 0;
  const body = () => {bodies++;return new Promise(resolve => {release = resolve;});};
  const exec = shell('python3 app/skills/screener/scripts/run.py --market china');
  const a = guard.execute(exec, body), b = guard.execute(exec, body);
  release(ok('data'));assert.deepEqual(await a, await b);assert.equal(bodies, 1);
});

test('direct URL reads run concurrently and later calls stop after network unreachable', async t => {
  const {guard}=setup(t);let active=0,maxActive=0,bodies=0;
  const body=async text=>{bodies++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,5));active--;return ok(text);};
  await Promise.all([
    guard.execute({name:'web_fetch',arguments:{url:'https://one.example'}},()=>body('evidence one')),
    guard.execute({name:'web_fetch',arguments:{url:'https://two.example'}},()=>body('evidence two')),
  ]);
  assert.equal(maxActive,2);assert.equal(bodies,2);
  await guard.execute({name:'web_fetch',arguments:{url:'https://bad.example'}},()=>body('URLError: Network is unreachable'));
  const stopped=await guard.execute({name:'web_fetch',arguments:{url:'https://three.example'}},()=>body('should not run'));
  assert.equal(bodies,3);assert.equal(guard.stats.suppressed,1);
  assert.match(stopped.content[0].text,/Network is unreachable/);
});

test('trades are never memoized and cannot be reported from cache', async t => {
  const {guard} = setup(t);let bodies = 0;
  const exec = shell('python3 app/skills/portfolio-order/scripts/run.py --input order.json');
  for (let i=0;i<3;i++) await guard.execute(exec, async () => {bodies++;return ok('actual order receipt');});
  assert.equal(bodies, 3);assert.equal(guard.cache.size, 0);
});

test('arbitrary compound shell and portfolio-data writes are not cached', async t => {
  const {guard}=setup(t);let bodies=0;
  for(const command of ['python3 app/skills/screener/scripts/run.py && curl -X POST https://example.com', 'python3 app/skills/portfolio-data/scripts/run.py --input candidate.json']) {
    for(let i=0;i<2;i++) await guard.execute(shell(command),async () => {bodies++;return ok('real execution');});
  }
  assert.equal(bodies,4);assert.equal(guard.cache.size,0);
});

test('failure classifier reads structured statuses rather than any occurrence of error', () => {
  assert.equal(failed(ok('schema description mentions error handling')),false);
  assert.equal(failed(ok('{"ok":true,"output":"plot.html"}')),false);
  assert.equal(failed(ok('{"status":"error"}')),true);
  assert.equal(failed(ok('[stderr]\nTraceback (most recent call last):\nKeyError')),true);
  assert.equal(failed(ok('{"code":2003,"message":"Missing X-api-key","data":null}')),true);
  assert.equal(webFetchFailed(ok('Fetched https://example.com (HTTP 404)')),true);
  assert.equal(webFetchFailed(ok('Fetched https://example.com (HTTP 200)')),false);
});

test('large JSON from any tool is persisted and replaced by a compact file reference', t => {
  const {root}=setup(t);
  const rows=Array.from({length:2000},(_,index)=>({symbol:`S${index}`,value:index}));
  const result=compactToolResult({name:'bash'},ok(JSON.stringify({rows})),root);
  const receipt=JSON.parse(result.content[0].text);
  assert.equal(receipt.compacted,true);
  assert.equal(receipt.summary.rows.count,2000);
  assert.match(receipt.handoff,/downstream tools/);
  assert.equal(JSON.parse(fs.readFileSync(receipt.fullOutputPath,'utf8')).rows.length,2000);
  assert.ok(result.content[0].text.length<1000);
});

test('large text is persisted while the model receives bounded head and tail samples', t => {
  const {root}=setup(t);
  const text='begin\n'+'x'.repeat(15000)+'\nend';
  const result=compactToolResult({name:'web_fetch'},ok(text),root);
  const receipt=JSON.parse(result.content[0].text);
  assert.equal(receipt.summary.characters,text.length);
  assert.match(receipt.summary.head,/begin/);
  assert.match(receipt.summary.tail,/end/);
  assert.equal(fs.readFileSync(receipt.fullOutputPath,'utf8'),text);
});

test('large failures are persisted and replaced by one bounded diagnostic summary', t => {
  const {root}=setup(t);
  const result={content:[{type:'text',text:'Traceback (most recent call last):\n'+'x'.repeat(15000)}],isError:true};
  const compacted=compactToolResult({name:'bash'},result,root);
  const receipt=JSON.parse(compacted.content[0].text);
  assert.equal(receipt.failed,true);
  assert.equal(fs.readFileSync(receipt.fullOutputPath,'utf8').length,15035);
});

test('structured row data uses a file reference below the general text threshold', t => {
  const {root}=setup(t);
  const rows=Array.from({length:80},(_,value)=>({value,label:`row-${value}`}));
  const result=compactToolResult({name:'bash'},ok(JSON.stringify({rows})),root);
  assert.equal(JSON.parse(result.content[0].text).compacted,true);
});

test('duplicate failures are summarized once per turn', async t => {
  const {guard}=setup(t);const exec=shell('python3 failed.py');
  const first=await guard.execute(exec,async()=>ok('[exit code: 1] same failure'));
  const second=await guard.execute(exec,async()=>ok('[exit code: 1] same failure'));
  assert.match(first.content[0].text,/same failure/);
  assert.equal(second.content[0].text,first.content[0].text);
});

test('background job polling is capped and immediate repeat polls are suppressed', async t => {
  let now=10000;const {root}=setup(t);const guard=new LightweightGuard(root,()=>now);let bodies=0;
  const exec={name:'job_output',arguments:{job_id:'job-1',wait:true,timeout_ms:60000}};
  await guard.execute(exec,async()=>{bodies++;return ok('(no new output)\n[status: running]');});
  assert.equal(exec.arguments.timeout_ms,JOB_POLL_TIMEOUT_MS);
  const repeat=await guard.execute({name:'job_output',arguments:{job_id:'job-1',wait:true,timeout_ms:60000}},async()=>{bodies++;return ok('done');});
  assert.equal(bodies,1);assert.match(repeat.content[0].text,/status: running/);
});

test('environment adapter only forwards the configured shell environment', async () => {
  const adapter=(await import('../app/dsh_tool_environment.cjs')).default;
  const handlers=new Map();
  const shell={resolve:()=>({env:{}})};
  adapter.apply({
    shell,
    on:(event,handler)=>handlers.set(event,handler),
    effect:callback=>callback(),
  });
  assert.deepEqual(adapter.inject,['shell']);
  assert.equal(handlers.has('tools/execute'),false);
});

test('SDK canonical value rendering is compacted at post-execute without changing tool value',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mentora-post-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const previous=process.env.MENTORA_PROJECT_ROOT;process.env.MENTORA_PROJECT_ROOT=root;
 const handlers=new Map();try{policy.apply({on:(name,fn)=>handlers.set(name,fn)});}finally{if(previous===undefined)delete process.env.MENTORA_PROJECT_ROOT;else process.env.MENTORA_PROJECT_ROOT=previous;}
 const agent={},exec={name:'bash',arguments:{command:'python3 local.py'},agent};
 const stdout=JSON.stringify({rows:Array.from({length:1000},(_,i)=>({id:i,value:i*2}))});
 const native={content:[{type:'text',text:stdout}],isError:false,value:{stdout,exitCode:0},meta:{cwd:root}};
 const around=await handlers.get('tools/execute')(exec,async()=>native);
 // Match the real SDK: it discards around-dispatch content and renders value.
 const canonical={...around,content:[{type:'text',text:around.value.stdout}]};
 const result=await handlers.get('tools/post-execute')(exec,canonical,async()=>({kind:'accept',additionalContexts:[{context:'retained'}]}));
 assert.equal(result.kind,'accept');assert.equal(result.value,undefined);
 assert.deepEqual(canonical.value,native.value);assert.equal(canonical.meta.cwd,root);
 const receipt=JSON.parse(result.content[0].text);assert(receipt.compacted);assert(result.content[0].text.length<1000);
 assert.equal(JSON.parse(fs.readFileSync(receipt.fullOutputPath,'utf8')).rows.length,1000);
 assert.deepEqual(result.additionalContexts,[{context:'retained'}]);
 assert.equal((await handlers.get('tools/post-execute')(exec,canonical,async()=>({kind:'block',feedback:[]}))).kind,'block');
});

test('full skill instructions and JSON schemas never lose their execution contract',t=>{
 const {root}=setup(t);for(const file of ['app/skills/any/SKILL.md','app/skills/any/schemas/payload.schema.json']){
  const text='contract '.repeat(2000);assert.equal(compactToolResult({name:'read',arguments:{file_path:file}},ok(text),root).content[0].text,text);
 }
});

test('native parallel classification accepts independent read batches and preserves dependency barriers',()=>{
 const plan=new policy.ParallelReadPlan('/project');
 const cmd=(file,input='')=>({command:`python3 app/skill_runner.py execute --script read_market_data.py -- --operation quote --symbols TEST --output ${file}${input?' --input '+input:''}`});
 assert.equal(plan.classify(cmd('outputs/a.json')),true);
 assert.equal(plan.classify(cmd('outputs/b.json')),true);
 assert.equal(plan.classify(cmd('outputs/a.json')),false);
 assert.equal(plan.classify(cmd('outputs/c.json','outputs/b.json')),false);
 plan.reset();assert.equal(plan.classify(cmd('outputs/a.json')),true);
 for(const command of ['python3 app/skill_runner.py execute --script order.py -- --operation quote','python3 app/skill_runner.py execute --script read_market_data.py -- --operation trade','python3 app/skill_runner.py execute --script read_market_data.py -- --operation quote; touch file','python3 arbitrary.py','cat file | python3 app/skill_runner.py contract --script test.py'])assert.equal(plan.classify({command}),false);
});

test('scheduler adapter only changes safe visible bash modes and restores on disposal',()=>{
 const handlers=new Map();let dispose;
 const original=()=>({kind:'exclusive'}),tools={executionMode:original,get:()=>({name:'bash'})};
 policy.apply({tools,on:(name,fn)=>handlers.set(name,fn),effect:fn=>{dispose=fn();}});
 const agent={},exec={agent,name:'bash',arguments:{command:'python3 app/skill_runner.py execute --script read_market_data.py -- --operation quote --output outputs/one.json'}};
 assert.equal(tools.executionMode(exec).kind,'parallel');
 assert.equal(tools.executionMode(exec).kind,'exclusive');
 handlers.get('agent/pre-step')({agent,messages:[]},()=>{});
 assert.equal(tools.executionMode(exec).kind,'parallel');
 assert.equal(tools.executionMode({...exec,arguments:{command:'python3 app/skill_runner.py execute --script order.py'}}).kind,'exclusive');
 assert.equal(tools.executionMode({...exec,signal:{aborted:true}}).kind,'exclusive');
 tools.get=()=>undefined;assert.equal(tools.executionMode(exec).kind,'exclusive');
 dispose();assert.equal(tools.executionMode,original);
});
