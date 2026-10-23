/* SDK 0.2.1rc2 forwards durable messages but omits agent/assistant-stream.
 * Bridge public transient frames over its existing JSON-RPC stdout transport.
 * Never append transient frames to the durable Harness session log.
 */
exports.name='mentora-public-stream';
exports.apply=ctx=>{
  const widgets=new Set();
  ctx.on('agent/assistant-stream',({agent,frame})=>{
    const chunk=frame.chunk;
    if(frame.type==='chunk'){
      if(!chunk)return;
      if(chunk.type==='tool-call-delta'){
        const key=`${frame.attemptId}:${chunk.index}`;
        if(chunk.name==='visualize_show_widget')widgets.add(key);
        if(!widgets.has(key))return;
      }else if(chunk.type!=='text-delta')return;
    }else if(frame.type!=='start'&&frame.type!=='end')return;
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'mentora.public-stream',params:{sessionId:String(agent.session.id),frame}})+'\n');
    if(frame.type==='end')for(const key of widgets)if(key.startsWith(`${frame.attemptId}:`))widgets.delete(key);
  },{global:true});
};
