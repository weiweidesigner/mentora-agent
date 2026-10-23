const fs=require('node:fs');
const path=require('node:path');
exports.name='widget-probe';
exports.inject=['tools','agents','agentLoop','systemPrompt'];
exports.apply=ctx=>{void(async()=>{
  const out=process.env.MENTORA_WIDGET_PROBE_RESULT;
  try{
    const handle=await ctx.agents.create({sessionId:'widget-probe'});
    const result=await ctx.tools.execute({agent:handle.agent,name:'visualize_show_widget',arguments:{title:'Fixture',widget_code:'<section><h2>Fixture</h2><svg viewBox="0 0 100 50"><rect x="0" y="0" width="20" height="40"/></svg></section>'},callId:'widget-1',signal:new AbortController().signal});
    fs.writeFileSync(out,JSON.stringify(result));await handle.dispose();
  }catch(e){fs.writeFileSync(out,JSON.stringify({error:String(e),stack:e.stack}));}
})();};
