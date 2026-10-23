/* Runs real runtime tools without an LLM request. Never loaded in production. */
const fs = require('node:fs');
const path = require('node:path');
exports.name = 'mentora-guard-probe';
exports.inject = ['tools', 'agents', 'agentLoop', 'systemPrompt'];
exports.apply = ctx => {
  const runProbe = async () => {
    const dir = process.env.MENTORA_GUARD_PROBE_DIR;
    if (!dir) throw Error('probe directory is required');
    try {
      const handle = await ctx.agents.create({sessionId: 'mentora-guard-runtime-probe'});
      const agent = handle.agent;
      let seq = 0;
      const run = (name, args) => ctx.tools.execute({agent, name, arguments: args, callId: `probe-${++seq}`, signal: new AbortController().signal});
      const runBash = command => run('bash', {command, description: 'Verify transparent execution cache', workdir: dir});
      const countFile = path.join(dir, 'read-bodies.txt');
      let readBodies = 0;
      ctx.on('tools/execute', (exec, next) => {if (exec.name === 'read') {readBodies++;fs.writeFileSync(countFile, String(readBodies));} return next();});
      const data = path.join(dir, 'source.txt');fs.writeFileSync(data, 'verified source');
      const reads = [await run('read', {file_path: data}), await run('read', {file_path: data})];
      const failures = [];
      for (let i = 0; i < 3; i++) failures.push(await runBash(`python3 ${dir}/screener/scripts/run.py --variant ${i}`));
      const output = path.join(dir, 'generated.html');
      const renderCommand = `python3 ${dir}/generic-chart/scripts/render.py --output ${output}`;
      const secondOutput = path.join(dir, 'generated-second.html');
      const secondRenderCommand = `python3 ${dir}/generic-chart/scripts/render.py --output ${secondOutput}`;
      const renders = [await runBash(renderCommand), await runBash(secondRenderCommand)];
      const artifacts = [output, secondOutput].map(file => ({file, exists: fs.existsSync(file)}));
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({readBodies,reads,failures,renders,artifacts}));
      await handle.dispose();
    } catch (error) {
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({error: String(error), stack: error.stack}));
    }
  };
  // SDK profiles do not use the web app's ready lifecycle event.
  void runProbe();
};
