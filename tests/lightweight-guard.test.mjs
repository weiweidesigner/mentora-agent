import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import policy from '../app/dsh_lightweight_guard.cjs';
const {LightweightGuard, failed, webFetchFailed} = policy;
const ok = text => ({content: [{type: 'text', text}], isError: false});
const shell = (command, extra = {}) => ({name: 'bash', arguments: {command, description: 'query', ...extra}});
const setup = t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mentora-guard-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return {root, guard: new LightweightGuard(root)};
};

test('failures and changed parameters are returned to the model without retry policy', async t => {
  const {guard}=setup(t);let bodies=0;
  for(const symbol of ['bad','other','bad']){
    const result=await guard.execute(shell(`python3 app/skills/a-share-data/scripts/price_snapshot.py --thscodes ${symbol}`),async()=>{bodies++;return ok('[exit code: 1] Target not found');});
    assert.equal(result.content[0].text,'[exit code: 1] Target not found');
  }
  assert.equal(bodies,3);assert.equal(guard.cache.size,0);
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

test('direct URL reads serialize and stop after the first blocked or failed response', async t => {
  const {guard}=setup(t);let active=0,maxActive=0,bodies=0;
  const body=async text=>{bodies++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,5));active--;return ok(text);};
  const calls=[
    guard.execute({name:'web_fetch',arguments:{url:'https://one.example'}},()=>body('Fetched https://one.example (HTTP 403)')),
    guard.execute({name:'web_fetch',arguments:{url:'https://two.example'}},()=>body('Error: web fetch failed: TypeError: fetch failed')),
    guard.execute({name:'web_fetch',arguments:{url:'https://three.example'}},()=>body('should not run')),
  ];
  const results=await Promise.all(calls);
  assert.equal(maxActive,1);assert.equal(bodies,1);assert.equal(guard.stats.suppressed,2);
  assert.match(results[1].content[0].text,/do not retry web_fetch/);
  assert.match(results[2].content[0].text,/do not retry web_fetch/);
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
