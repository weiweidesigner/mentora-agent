/* A native tool in the existing Agent loop, not a second generation phase. */
const {spawn} = require('node:child_process');
const path = require('node:path');
exports.name = 'mentora-stream-widget';
exports.inject = ['tools'];
exports.apply = ctx => ctx.tools.register({
  name: 'visualize_show_widget',
  description: 'Render an evidence-backed HTML/SVG widget inline. Arguments stream directly to the user. Use only verified or user-provided data. No scripts, external assets, iframe or canvas. Continue your public answer after this tool if useful.',
  parameters: {type:'object',properties:{title:{type:'string'},widget_code:{type:'string'}},required:['title','widget_code'],additionalProperties:false},
  output: {schema:{type:'object'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
  async execute(args,exec) {
    if (typeof args.title!=='string'||typeof args.widget_code!=='string'||args.widget_code.length>500000) throw Error('Invalid widget arguments');
    const root=process.env.MENTORA_PROJECT_ROOT;
    if(!root)throw Error('Missing project root');
    return await new Promise((resolve,reject)=>{
      const child=spawn(path.join(root,'.venv/bin/python'),[path.join(root,'scripts/save_stream_widget.py')],{cwd:root,signal:exec.signal,stdio:['pipe','pipe','pipe']});
      let output='',error='';
      child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);
      child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(Error('Widget validation or save failed'));try{resolve(JSON.parse(output));}catch(e){reject(e);}});
      child.stdin.end(JSON.stringify(args));
    });
  }
});
