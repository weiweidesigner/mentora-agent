/* A native tool in the existing Agent loop, not a second generation phase. */
const {spawn} = require('node:child_process');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
exports.name = 'mentora-stream-widget';
exports.inject = ['tools'];
exports.apply = ctx => ctx.tools.register({
  name: 'visualize_show_widget',
  description: 'Arrange evidence-backed layouts and conceptual diagrams. For standard numeric charts first use deterministic generic chart scripts; pass their verified HTML paths in chart_artifacts to embed them without redrawing SVG. Prefer brief: include full verified facts, layout and conclusions; a parallel renderer generates HTML while you continue your own answer. The host buffers subsequent prose until the visual finishes. No research is performed by the renderer. A rendering receipt is pending, not proof of completion; the host validates and attaches the file before final delivery.',
  parameters: {type:'object',properties:{chart_artifacts:{type:'array',items:{type:'string'},description:'Optional verified HTML paths under outputs/generated; the host embeds chart-1, chart-2 etc. Include matching empty div data-chart-id slots in the layout.'},title:{type:'string'},brief:{type:'string',description:'Self-contained visual brief with verified data, labels, units, sources, limitations and conclusions. No research or file lookup.'}},required:['title','brief'],additionalProperties:false},
  output: {schema:{type:'object'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
  async execute(args,exec) {
    exec.signal?.throwIfAborted();
    if (typeof args.title!=='string') throw Error('Invalid widget title');
    const root=process.env.MENTORA_PROJECT_ROOT;
    if(!root)throw Error('Missing project root');
    if(typeof args.brief==='string' && args.brief.trim() ){
      if(args.brief.length>100000)throw Error('Widget brief is too large');
      const output=path.join(root,'outputs/generated','streamviz-job-'+randomUUID()+'.html');
      return {status:'rendering',output,title:args.title,message:'HTML renders concurrently. Continue your own prose now; do not wait, poll, or claim file completion. The host releases buffered prose and attaches the validated file when rendering succeeds.'};
    }
    if (typeof args.widget_code!=='string'||args.widget_code.length>500000) throw Error('Provide brief or widget_code');
    return await new Promise((resolve,reject)=>{
      const child=spawn(path.join(root,'.venv/bin/python'),[path.join(root,'scripts/save_stream_widget.py')],{cwd:root,signal:exec.signal,stdio:['pipe','pipe','pipe']});
      let output='',error='';
      child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);
      child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(Error('Widget validation or save failed'));try{resolve(JSON.parse(output));}catch(e){reject(e);}});
      child.stdin.end(JSON.stringify(args));
    });
  }
});
