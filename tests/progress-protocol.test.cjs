const test=require('node:test');
const assert=require('node:assert/strict');
const plugin=require('../app/dsh_public_progress.cjs');
test('explicit progress tool has a bounded public-only contract and no side effects',async()=>{
  let tool;
  plugin.apply({tools:{register:value=>{tool=value;}}});
  assert.equal(tool.name,'report_progress');
  assert.deepEqual(tool.parameters.required,['summary']);
  assert.equal(tool.parameters.additionalProperties,false);
  assert.match(tool.description,/not the answer/);
  assert.match(tool.description,/private reasoning/);
  assert.deepEqual(await tool.execute({summary:'核对数据口径。'}),{ok:true,channel:'progress'});
  for(const summary of [null,'','  ','x'.repeat(241)])await assert.rejects(tool.execute({summary}));
});
