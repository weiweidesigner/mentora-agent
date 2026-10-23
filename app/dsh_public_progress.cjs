/* An explicit public progress channel for providers without commentary/final.
 * The host translates the tool/call event, not ordinary text or private reasoning.
 */
exports.name = 'mentora-public-progress';
exports.inject = ['tools'];
exports.apply = ctx => ctx.tools.register({
  name: 'report_progress',
  description: 'Update the single current public activity status, not the answer. Use a short user-language action summary when a separate progress update is useful. Never include private reasoning, analysis, conclusions, commands, paths or tool results. Do not repeat this summary in assistant text. Ordinary assistant text is the public answer and streams immediately. Existing tool descriptions can already describe their actions; do not add redundant progress calls.',
  parameters: {type:'object',properties:{summary:{type:'string',minLength:1,maxLength:240}},required:['summary'],additionalProperties:false},
  output: {schema:{type:'object'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
  async execute(args) {
    if (typeof args.summary !== 'string' || !args.summary.trim() || args.summary.length > 240) throw Error('summary must be 1–240 characters');
    return {ok:true,channel:'progress'};
  }
});
