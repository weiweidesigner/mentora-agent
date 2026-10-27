const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const plugin=require('../app/dsh_stream_widget.cjs');
let tool;plugin.apply({tools:{register:value=>tool=value}});
test('a visual brief returns a pending job immediately without claiming a generated file',async()=>{
 const old=process.env.MENTORA_PROJECT_ROOT;process.env.MENTORA_PROJECT_ROOT='/tmp/mentora-tool-test';
 try{
  const receipt=await tool.execute({title:'Example',brief:'Verified facts and intended layout'},{signal:new AbortController().signal});
  assert.equal(receipt.status,'rendering');assert(!receipt.ok);
  assert.match(receipt.output,/\/outputs\/generated\/streamviz-job-[a-f0-9-]+\.html$/);
  assert(!fs.existsSync(receipt.output));assert.match(receipt.message,/Continue your own prose/);
 }finally{if(old===undefined)delete process.env.MENTORA_PROJECT_ROOT;else process.env.MENTORA_PROJECT_ROOT=old;}
});
test('missing visual input fails instead of scheduling an empty render',async()=>{
 const old=process.env.MENTORA_PROJECT_ROOT;process.env.MENTORA_PROJECT_ROOT='/tmp/mentora-tool-test';
 try{await assert.rejects(tool.execute({title:'Empty'},{signal:new AbortController().signal}),/Provide brief or widget_code/);}
 finally{if(old===undefined)delete process.env.MENTORA_PROJECT_ROOT;else process.env.MENTORA_PROJECT_ROOT=old;}
});
