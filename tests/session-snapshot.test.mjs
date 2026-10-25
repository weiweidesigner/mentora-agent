import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const start=source.indexOf('function isStaleChatSessionSnapshot(');
const end=source.indexOf('\nasync function syncServerSessions(',start);
const stale=vm.runInNewContext('('+source.slice(start,end)+')');

test('terminal runs cannot regress to delayed running or queued snapshots',()=>{
  for(const status of ['completed','failed','interrupted']) {
    for(const pending of ['running','queued']) {
      assert.equal(stale({status,requestId:'request-1',lastRunId:'run-1'},{status:pending,requestId:'request-1',activeRunId:'run-1',updatedAt:Date.now()+60000}),true);
    }
  }
});

test('run identity protects older sessions without request ids',()=>{
  assert.equal(stale({status:'completed',lastRunId:'run-1'},{status:'running',activeRunId:'run-1'}),true);
  assert.equal(stale({status:'completed',lastRunId:'run-1'},{status:'running',activeRunId:'run-2'}),false);
});

test('new follow-ups and terminal results are accepted normally',()=>{
  const completed={status:'completed',requestId:'request-1',lastRunId:'run-1'};
  assert.equal(stale(completed,{status:'running',requestId:'request-2',activeRunId:'run-2',lastRunId:'run-1'}),false);
  assert.equal(stale(completed,{status:'completed',requestId:'request-1',lastRunId:'run-1'}),false);
  assert.equal(stale({status:'running',requestId:'request-1'},{status:'completed',requestId:'request-1'}),false);
  assert.equal(stale(undefined,{status:'running',requestId:'request-1'}),false);
});
