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
