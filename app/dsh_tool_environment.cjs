/* Explicitly forward the configured tool credentials through the Harness
 * subprocess seam. Its default parent-environment scrub intentionally removes
 * KEY/TOKEN/SECRET names; supplying Harness.env alone does not reach CLI tools.
 * Values live only in ShellSpec.env, never in commands, prompts or tool events.
 */
const name = 'mentora-tool-environment';
const inject = ['shell'];
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function configuredEnvironment(env = process.env) {
  const result = {};
  for (const key of String(env.MENTORA_TOOL_ENV_KEYS || '').split(',').map(value => value.trim())) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || key.startsWith('DSH_')) continue;
    if (typeof env[key] === 'string' && env[key].trim()) result[key] = env[key];
  }
  // Service ExecStart may use venv Python without activating its PATH. CLI
  // tools must use those same installed dependencies instead of /usr/bin/python3.
  if (env.MENTORA_PROJECT_ROOT) {
    const venv = path.join(env.MENTORA_PROJECT_ROOT, '.venv');
    const bin = path.join(venv, 'bin');
    if (fs.existsSync(path.join(bin, 'python3'))) {
      result.VIRTUAL_ENV = venv;
      result.PATH = [bin, env.PATH].filter(Boolean).join(path.delimiter);
    }
  }
  if (env.MENTORA_STREAMVIZ_EVENTS) result.MENTORA_STREAMVIZ_EVENTS = env.MENTORA_STREAMVIZ_EVENTS;
  return result;
}

function apply(ctx) {
  // One public-market read namespace per user turn. Cached SDK sessions may
  // serve later turns, so process identity alone must not define the cache.
  let namespace = crypto.randomUUID();
  ctx.on('agent/pre-step', ({messages = []}, next) => {
    if (messages.some(message => message.source?.kind === 'user')) namespace = crypto.randomUUID();
    return next();
  });
  ctx.effect(() => {
    const shell = ctx.shell;
    const resolve = shell.resolve;
    function resolveWithToolEnvironment(request) {
      const spec = resolve.call(this, request);
      const scoped = process.env.MENTORA_PROJECT_ROOT ? {
        MENTORA_MARKET_CACHE_DIR: path.join(process.env.MENTORA_PROJECT_ROOT,
          'outputs', '.market-read-cache', namespace),
      } : {};
      return {...spec, env: {...configuredEnvironment(), ...scoped, ...spec.env}};
    }
    shell.resolve = resolveWithToolEnvironment;
    return () => { if (shell.resolve === resolveWithToolEnvironment) shell.resolve = resolve; };
  });
}

module.exports = {name, inject, apply, configuredEnvironment};
