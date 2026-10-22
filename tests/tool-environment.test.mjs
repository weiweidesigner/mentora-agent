import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
const {apply,configuredEnvironment}=createRequire(import.meta.url)('../app/dsh_tool_environment.cjs');

test('only explicitly configured credentials are forwarded, excluding reserved Harness names',()=>{
 const env={MENTORA_TOOL_ENV_KEYS:'TOOL_API_KEY, MISSING_KEY, DSH_SESSION_ID, bad-name',TOOL_API_KEY:'configured',OTHER_SECRET:'private',DSH_SESSION_ID:'spoof'};
 assert.deepEqual(configuredEnvironment(env),{TOOL_API_KEY:'configured'});
 assert.deepEqual(configuredEnvironment({TOOL_API_KEY:'configured'}),{});
});
test('project CLI commands use the project virtual environment when installed',()=>{
 const root=mkdtempSync(join(tmpdir(),'mentora-tool-python-'));
 try{
  const bin=join(root,'.venv','bin');mkdirSync(bin,{recursive:true});writeFileSync(join(bin,'python3'),'fixture');
  const forwarded=configuredEnvironment({MENTORA_PROJECT_ROOT:root,PATH:'/usr/bin'});
  assert.equal(forwarded.VIRTUAL_ENV,join(root,'.venv'));
  assert.equal(forwarded.PATH,bin+delimiter+'/usr/bin');
  rmSync(join(bin,'python3'));
  assert.deepEqual(configuredEnvironment({MENTORA_PROJECT_ROOT:root,PATH:'/usr/bin'}),{});
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('forwarding preserves command, caller overrides, deadlines and cancellation and is disposable',()=>{
 const previousKeys=process.env.MENTORA_TOOL_ENV_KEYS,previousValue=process.env.MENTORA_TEST_TOOL_KEY;
 process.env.MENTORA_TOOL_ENV_KEYS='MENTORA_TEST_TOOL_KEY';process.env.MENTORA_TEST_TOOL_KEY='host-value';
 try{
  const shell={resolve(request){return {...request};}},original=shell.resolve;let dispose;
  apply({shell,on(){},effect(fn){dispose=fn();}});
  const signal=new AbortController().signal;
  const request={command:'python tool.py',signal,timeoutMs:9000,env:{MENTORA_TEST_TOOL_KEY:'caller-value',EXPLICIT:'kept'}};
  const spec=shell.resolve(request);
  assert.equal(spec.command,request.command);assert.equal(spec.signal,signal);assert.equal(spec.timeoutMs,9000);
  assert.deepEqual(spec.env,{MENTORA_TEST_TOOL_KEY:'caller-value',EXPLICIT:'kept'});
  assert.deepEqual(shell.resolve({command:'tool'}).env,{MENTORA_TEST_TOOL_KEY:'host-value'});
  assert.deepEqual(request.env,{MENTORA_TEST_TOOL_KEY:'caller-value',EXPLICIT:'kept'});
  dispose();assert.equal(shell.resolve,original);
 }finally{
  if(previousKeys===undefined)delete process.env.MENTORA_TOOL_ENV_KEYS;else process.env.MENTORA_TOOL_ENV_KEYS=previousKeys;
  if(previousValue===undefined)delete process.env.MENTORA_TEST_TOOL_KEY;else process.env.MENTORA_TEST_TOOL_KEY=previousValue;
 }
});


test('market cache is stable within a turn, changes for the next user, and honors overrides',()=>{
 const old=process.env.MENTORA_PROJECT_ROOT;process.env.MENTORA_PROJECT_ROOT='/project';
 try{
  const shell={resolve(request){return {...request};}};let preStep,dispose;
  apply({shell,on(name,fn){assert.equal(name,'agent/pre-step');preStep=fn;},effect(fn){dispose=fn();}});
  const first=shell.resolve({}).env.MENTORA_MARKET_CACHE_DIR;
  assert.ok(first.startsWith('/project/outputs/.market-read-cache/'));
  preStep({messages:[{source:{kind:'tool'}}]},()=>{});
  assert.equal(shell.resolve({}).env.MENTORA_MARKET_CACHE_DIR,first);
  preStep({messages:[{source:{kind:'user'}}]},()=>{});
  assert.notEqual(shell.resolve({}).env.MENTORA_MARKET_CACHE_DIR,first);
  assert.equal(shell.resolve({env:{MENTORA_MARKET_CACHE_DIR:'/explicit'}}).env.MENTORA_MARKET_CACHE_DIR,'/explicit');
  dispose();
 }finally{if(old===undefined)delete process.env.MENTORA_PROJECT_ROOT;else process.env.MENTORA_PROJECT_ROOT=old;}
});
