const test=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../app/dsh_public_stream.cjs');
test('transient bridge forwards only public text and native widget arguments',()=>{
  let callback;const output=[];
  bridge.apply({on:(name,fn)=>{assert.equal(name,'agent/assistant-stream');callback=fn;}});
  const write=process.stdout.write;
  try{
    process.stdout.write=value=>{output.push(JSON.parse(value));return true;};
    const emit=chunk=>callback({agent:{session:{id:'root'}},frame:{type:'chunk',attemptId:'attempt',chunk}});
    emit({type:'reasoning-delta',text:'PRIVATE'});
    emit({type:'block-end',block:{type:'reasoning',text:'PRIVATE'}});
    emit({type:'text-delta',index:1,text:'public'});
    emit({type:'tool-call-delta',index:2,name:'bash',argumentsDelta:'SECRET'});
    emit({type:'tool-call-delta',index:2,argumentsDelta:'SECRET'});
    emit({type:'tool-call-delta',index:3,name:'visualize_show_widget',argumentsDelta:'{"title":'});
    emit({type:'tool-call-delta',index:3,argumentsDelta:'"Chart"}'});
  }finally{process.stdout.write=write;}
  assert.equal(output.length,3);
  assert.equal(output[0].params.sessionId,'root');
  assert.ok(!JSON.stringify(output).includes('PRIVATE'));
  assert.ok(!JSON.stringify(output).includes('SECRET'));
});
