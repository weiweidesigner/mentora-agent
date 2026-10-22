import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');

test('tool activity titles come from the model thought summary',()=>{
  const functionStart=source.indexOf('function toolActivityTitle(');
  const functionEnd=source.indexOf('\nfunction refreshSavedToolStepTitles',functionStart);
  const implementation=source.slice(functionStart,functionEnd);
  assert.match(implementation,/modelActivitySummary\(data\?\.thoughtSummary\)/);
  assert.match(implementation,/return reasoningTitle/);
  assert.doesNotMatch(implementation,/正在执行本地计算|正在等待网络响应|正在处理数据与准备分析|正在生成 HTML 报告/);
  assert.match(implementation,/return String\(data\?\.tool \|\| script \|\| fallback \|\| "Tool"\)/);
});

test('DeepSeek connection steps use concise titles without descriptions',()=>{
  assert.match(source,/data\?\.phase === "deepseek-connect"\) return "agent-connect"/);
  assert.match(source,/正在连接Agent/);
  assert.match(source,/if \(key === "agent-connect"\) return ""/);
  assert.match(source,/const isModelConnection = phase === "run" && status === "started" && \/DeepSeek Harness\/i\.test\(engine\)/);
  assert.match(source,/isModelConnection \? \(isChinese \? "连接模型"/);
  assert.match(source,/if \(!isModelConnection && !summary\) return/);
});
