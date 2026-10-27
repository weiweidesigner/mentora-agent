/* An explicit public progress channel for providers without commentary/final.
 * The host translates the tool/call event, not ordinary text or private reasoning.
 */
exports.name = 'mentora-public-progress';
exports.inject = ['tools'];
exports.apply = ctx => ctx.tools.register({
  name: 'report_progress',
  description: 'Update the single current public activity status, not the answer. Use one concise action summary in the language explicitly requested by the user, otherwise the language of their current question (Chinese questions require Chinese even for US stocks). Describe the current business purpose, not an execution plan or internal terminology such as minimum sufficient evidence, data contracts or schema. Do not claim planned work is completed. Never include private reasoning, analysis, conclusions, commands, paths or tool results. Do not repeat this summary in assistant text. Start every ordinary assistant message containing substantive answer text with [[MENTORA_ANSWER]], then stream the answer. Never use that answer header for progress or plans; use report_progress instead. Existing tool descriptions can already describe their actions; do not add redundant progress calls.',
  parameters: {type:'object',properties:{summary:{type:'string',description:'一句简洁的当前进度，遵守用户明确指定的语言，否则跟随问句语言；中文问句用中文。说明正在做什么，不写内部术语、命令或整套计划。',minLength:1,maxLength:240}},required:['summary'],additionalProperties:false},
  output: {schema:{type:'object'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
  async execute(args) {
    if (typeof args.summary !== 'string' || !args.summary.trim() || args.summary.length > 240) throw Error('summary must be 1–240 characters');
    return {ok:true,channel:'progress'};
  }
});
