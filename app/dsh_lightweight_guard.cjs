/* Transparent per-turn cache. Historical plugin/file names remain compatible.
 * The model retains every tool and decides its own workflow and stopping point.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const name = 'mentora-lightweight-guard';
const inject = ['tools'];
const READ_TOOLS = new Set(['read', 'skill', 'web_fetch', 'web_search']);
const DATA_SCRIPT = /(?:a-share-data|screener|external-search|internal-search|url-content-reader|tradingview-market-data)\/scripts\//;
const SIDE_EFFECT = /portfolio[-_/ ]?(?:order|account|data)|\b(?:place_order|submit_order|cancel_order|save_candidate)\b|ainvest[-_/ ]?(?:alert|watchlist)/i;
const stable = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const unquote = value => value?.replace(/^(['"])(.*)\1$/, '$2');
const word = `(?:"[^"\\n]*"|'[^'\\n]*'|[^\\s;&|]+)`;
function fingerprint(file) {
  try { const stat = fs.statSync(file);return `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`; }
  catch { return 'missing'; }
}
function inspect(exec, root) {
  const args = exec.arguments || {};
  const command = exec.name === 'bash' ? String(args.command || '') : '';
  let cwd = path.resolve(root, args.workdir || '.');
  const cd = command.match(new RegExp(`^\\s*cd\\s+(${word})\\s*&&`));
  if (cd && !/[`$]/.test(cd[1])) cwd = path.resolve(cwd, unquote(cd[1]));
  const absolute = value => value && !/[`$]/.test(value) ? path.resolve(cwd, unquote(value)) : null;
  const scripts = [...command.matchAll(new RegExp(`(?:^|[;&|\\n])\\s*(?:python[\\d.]*|node)\\s+(${word}\\.py|${word}\\.mjs)(?=\\s|$)`, 'g'))]
    .map(match => absolute(match[1])).filter(Boolean);
  const flag = name => [...command.matchAll(new RegExp(`(?:^|\\s)--${name}(?:=|\\s+)(${word})`, 'g'))]
    .map(match => absolute(match[1])).filter(Boolean);
  const file = absolute(args.file_path || args.path);
  const dependencies = [file, ...scripts, ...flag('payload'), ...flag('input'), ...flag('file'), ...flag('output')].filter(Boolean);
  if (exec.name === 'skill' && typeof args.name === 'string') {
    dependencies.push(path.join(root, '.agents', 'skills', args.name, 'SKILL.md'), path.join(root, 'app', 'skills', args.name, 'SKILL.md'));
  }
  const simple = cd ? command.slice(cd[0].length) : command;
  const safeShell = command && !/[<>`$\n;&|]/.test(simple) && scripts.length === 1
    && DATA_SCRIPT.test(scripts[0]) && /^\s*python[\d.]*\s/.test(simple);
  const sideEffect = SIDE_EFFECT.test(command) || SIDE_EFFECT.test(exec.name) || SIDE_EFFECT.test(args.name || '');
  const cacheable = !sideEffect && (READ_TOOLS.has(exec.name) || !!safeShell);
  const actualArgs = Object.fromEntries(Object.entries(args).filter(([key]) => !['description', 'timeoutMs', 'justification'].includes(key)));
  return {cacheable, key:hash(stable({name:exec.name,cwd,args:actualArgs})),
    signature:()=>stable(dependencies.map(f=>[f,fingerprint(f)]))};
}
function textOf(result) {
  return (result.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('\n');
}

function failed(result) {
  if (result.isError || result.value?.exitCode != null && result.value.exitCode !== 0 || result.value?.timedOut) return true;
  const text = textOf(result);
  if (/^\[exit code: [1-9]\d*\]|^\[timed out|^Traceback \(most recent call last\):|^\S*(?:snapshot|history|screener): .*error|^All external search providers failed:/im.test(text)) return true;
  for (const line of text.split('\n')) {
    try {
      const data = JSON.parse(line);
      if (data && (data.ok === false || data.status === 'error' || data.status === 'failed'
        || typeof data.code === 'number' && data.code !== 0 && data.code !== 200 && data.message && data.data === null)) return true;
    } catch { /* Non-JSON tool text. */ }
  }
  return false;
}

function webFetchFailed(result) {
  const text = textOf(result);
  return failed(result)
    || /web fetch failed|Fetched https?:\/\/\S+ \(HTTP (?:4\d\d|5\d\d)\)/i.test(text);
}

function webFetchCircuitObservation() {
  return {
    content: [{type: 'text', text: 'Direct URL retrieval skipped: a web_fetch attempt already failed or was blocked in this turn. Reuse available search/market observations or use the external-search skill once; do not retry web_fetch with more domains.'}],
    isError: false,
  };
}

// The export name is retained for existing Cordis deployments.
class LightweightGuard {
  constructor(root, now = Date.now) { this.root=path.resolve(root);this.now=now;this.reset(); }
  reset() {
    this.generation=Symbol();this.cache=new Map();this.flights=new Map();
    this.webFetchTail=null;this.webFetchFailures=0;
    this.stats={executed:0,reused:0,suppressed:0};
  }
  async execute(exec, next) {
    if(exec.name==='web_fetch' && !exec.signal?.aborted){
      const previous=this.webFetchTail;let release;
      this.webFetchTail=new Promise(resolve=>{release=resolve;});
      if(previous)await previous;
      try{
        if(this.webFetchFailures>=1){this.stats.suppressed++;return webFetchCircuitObservation();}
        const result=await this.executeCached(exec,next);
        if(webFetchFailed(result))this.webFetchFailures++;
        return result;
      }finally{release();}
    }
    return this.executeCached(exec,next);
  }
  async executeCached(exec, next) {
    const call=inspect(exec,this.root),generation=this.generation;
    const run=async()=>{this.stats.executed++;return next();};
    // Never alter cancellation, failures, mutations or unknown commands.
    if(!call.cacheable || exec.signal?.aborted)return run();
    const signature=call.signature(),cached=this.cache.get(call.key);
    const ttl=['read','skill'].includes(exec.name)?Infinity:60000;
    if(cached && cached.signature===signature && this.now()-cached.at<ttl){
      this.stats.reused++;return structuredClone(cached.result);
    }
    const flightKey=call.key+':'+signature,flight=this.flights.get(flightKey);
    if(flight && flight.signal===exec.signal){this.stats.reused++;return structuredClone(await flight.pending);}
    const pending=run();this.flights.set(flightKey,{pending,signal:exec.signal});
    try{
      const result=await pending;
      if(this.generation===generation && !exec.signal?.aborted && !failed(result))
        this.cache.set(call.key,{result:structuredClone(result),at:this.now(),signature:call.signature()});
      return result;
    }finally{
      if(this.generation===generation && this.flights.get(flightKey)?.pending===pending)this.flights.delete(flightKey);
    }
  }
}
function apply(ctx) {
  const caches=new WeakMap();
  const cacheFor=agent=>{let cache=caches.get(agent);if(!cache){cache=new LightweightGuard(process.env.MENTORA_PROJECT_ROOT || process.cwd());caches.set(agent,cache);}return cache;};
  ctx.on('agent/pre-step',({agent,messages},next)=>{
    if(agent && messages.some(m=>m.source?.kind==='user'))cacheFor(agent).reset();
    return next();
  });
  ctx.on('agent/turn-stopping',({agent})=>{if(agent)cacheFor(agent).reset();});
  ctx.on('tools/execute',(exec,next)=>exec.agent?cacheFor(exec.agent).execute(exec,next):next(),{prepend:true});
}
module.exports={name,inject,apply,LightweightGuard,inspect,failed,webFetchFailed};
