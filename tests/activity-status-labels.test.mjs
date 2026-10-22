import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');

test('background and network activity labels describe the actual wait state',()=>{
  assert.match(source,/后台任务仍在运行/);
  assert.match(source,/正在读取任务结果/);
  assert.match(source,/正在等待网络响应/);
  assert.doesNotMatch(source,/正在读取后台任务结果/);
});

test('actual commands override model prose when distinguishing local compute from network work',()=>{
  const networkIndex=source.indexOf('const directNetworkCommand');
  const reasoningIndex=source.indexOf('const reasoning = data?.thoughtSummary',networkIndex);
  assert.ok(networkIndex>0 && reasoningIndex>networkIndex);
  assert.match(source,/正在执行本地计算/);
  assert.match(source,/requests\\\.\(\?:get\|post\|request\)/);
  assert.doesNotMatch(source,/\(\?:curl\|wget\|http\)/);
});

test('DeepSeek connection steps use concise titles without descriptions',()=>{
  assert.match(source,/data\?\.phase === "deepseek-connect"\) return "agent-connect"/);
  assert.match(source,/正在连接Agent/);
  assert.match(source,/if \(key === "agent-connect"\) return ""/);
  assert.match(source,/const isModelConnection = phase === "run" && status === "started" && \/DeepSeek Harness\/i\.test\(engine\)/);
  assert.match(source,/isModelConnection \? \(isChinese \? "连接模型"/);
  assert.match(source,/detailHtml: isModelConnection \? ""/);
});
