/* Transparent per-turn cache. Historical plugin/file names remain compatible.
 * The model retains every tool and decides its own workflow and stopping point.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const name = 'mentora-lightweight-guard';
const inject = ['tools'];
const READ_TOOLS = new Set(['read', 'skill', 'web_fetch', 'web_search']);
const DEFAULT_COMPACTION_THRESHOLD = 4000;
const STRUCTURED_FILE_THRESHOLD = 1000;
const EXTERNAL_CALL_TIMEOUT_MS = 10000;
const EXTERNAL_BATCH_TIMEOUT_MS = 30000;
const JOB_POLL_TIMEOUT_MS = 8000;
const JOB_POLL_COOLDOWN_MS = 5000;
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
  const actualArgs = Object.fromEntries(Object.entries(args).filter(([key]) => !['description', 'timeoutMs', 'timeout_ms', 'justification'].includes(key)));
  return {cacheable, key:hash(stable({name:exec.name,cwd,args:actualArgs})),
    signature:()=>stable(dependencies.map(f=>[f,fingerprint(f)]))};
}
function textOf(result) {
  return (result.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('\n');
}

function plainJson(value, fallback) {
  const seen = new WeakSet();
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') return String(item);
      if (typeof item === 'number' && !Number.isFinite(item)) return null;
      if (typeof item === 'undefined' || typeof item === 'function' || typeof item === 'symbol') return undefined;
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[circular]';
        seen.add(item);
      }
      return item;
    }));
  } catch { return fallback; }
}

function transformedResult(content, isError = false) {
  return {content: plainJson(content, []), isError: Boolean(isError)};
}

function boundedString(value, limit = 500) {
  const text = String(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function compactValue(value, depth = 0) {
  if (depth >= 3) {
    if (Array.isArray(value)) return {count: value.length};
    if (value && typeof value === 'object') return {keys: Object.keys(value).slice(0, 30)};
    return value;
  }
  if (Array.isArray(value)) {
    const summary = {count: value.length};
    if (value.length) summary.sample = compactValue(value[0], depth + 1);
    return summary;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 40)
      .map(([key, item]) => [key, compactValue(item, depth + 1)]));
  }
  return typeof value === 'string' ? boundedString(value) : value;
}

function hasStructuredRows(value, depth = 0) {
  if (depth > 2 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length > 1;
  return Object.values(value).some(item => Array.isArray(item) && item.length > 1 || hasStructuredRows(item, depth + 1));
}

function compactToolResult(exec, result, root, threshold = DEFAULT_COMPACTION_THRESHOLD) {
  const text = textOf(result);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* Preserve arbitrary text as a file. */ }
  const structured = parsed && typeof parsed === 'object' && hasStructuredRows(parsed);
  if (text.length <= threshold && !(structured && text.length > STRUCTURED_FILE_THRESHOLD)) {
    return transformedResult(result.content || [], result.isError || failed(result));
  }
  const directory = path.join(root, 'outputs', 'tool-results');
  fs.mkdirSync(directory, {recursive: true});
  const suffix = parsed && typeof parsed === 'object' ? '.json' : '.txt';
  const reference = path.join(directory, `${String(exec.name || 'tool').replace(/[^a-z0-9_-]+/gi, '-')}-${crypto.randomUUID()}${suffix}`);
  fs.writeFileSync(reference, parsed && typeof parsed === 'object' ? JSON.stringify(parsed) : text, {encoding: 'utf8', mode: 0o600});
  const summary = parsed && typeof parsed === 'object'
    ? compactValue(parsed)
    : {characters: text.length, head: text.slice(0, 700), tail: text.slice(-240)};
  const receipt = JSON.stringify({
    compacted: true,
    failed: failed(result),
    summary,
    fullOutputPath: reference,
    handoff: 'Pass this file path to downstream tools; do not copy its contents into model context.',
  });
  let replaced = false;
  const content = [];
  for (const block of result.content || []) {
    if (block.type !== 'text') { content.push(block); continue; }
    if (!replaced) { content.push({...block, text: receipt}); replaced = true; }
  }
  if (!replaced) content.unshift({type: 'text', text: receipt});
  return transformedResult(content, result.isError || failed(result));
}

function isNetworkUnavailable(result) {
  return /network is unreachable|network unreachable|enetunreach|ehostunreach|temporary failure in name resolution|urlerror\([^\n]*(?:timed out|unreachable)/i.test(textOf(result));
}

function isDirectExternalCall(exec) {
  if (exec.name === 'web_fetch') return true;
  if (exec.name !== 'bash') return false;
  const command = String(exec.arguments?.command || '');
  return !DATA_SCRIPT.test(command) && /(?:https?:\/\/|\bcurl\b|\bwget\b|urllib\.request|requests\.(?:get|post|request))/i.test(command);
}

function capTimeout(exec, timeoutMs) {
  const args = exec.arguments || (exec.arguments = {});
  if (Object.hasOwn(args, 'timeout_ms')) args.timeout_ms = Math.min(Number(args.timeout_ms) || timeoutMs, timeoutMs);
  else if (Object.hasOwn(args, 'timeoutMs')) args.timeoutMs = Math.min(Number(args.timeoutMs) || timeoutMs, timeoutMs);
  else args.timeout_ms = timeoutMs;
}

function jobKey(exec) {
  const args = exec.arguments || {};
  return String(args.job_id || args.jobId || args.id || args.session_id || args.sessionId || stable(args));
}

function failureKey(exec, result) {
  const normalized = textOf(result).toLowerCase().replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b\d+(?:\.\d+)?(?:ms|s)?\b/g, '<n>').replace(/\s+/g, ' ').trim();
  return hash(`${exec.name}:${normalized}`);
}

function firstFailureSummary(exec, result, root) {
  const text = textOf(result);
  if (text.length > 1200) return compactToolResult(exec, result, root, 1200);
  const summary = JSON.stringify({
    failed: true,
    summary: boundedString(text, 1200),
    handoff: 'Failure recorded once. Do not retry the same route without a materially different recovery path.',
  });
  return transformedResult([{type: 'text', text: summary}, ...(result.content || []).filter(block => block.type !== 'text')], true);
}

function repeatedFailureObservation() {
  return transformedResult([{type: 'text', text: JSON.stringify({
    failed: true,
    deduplicated: true,
    summary: 'The same failure was already reported in this turn; duplicate diagnostics were omitted.',
  })}], true);
}

function retryFamily(exec) {
  const command = String(exec.arguments?.command || '');
  if (isDirectExternalCall(exec)) return 'direct-network';
  if (exec.name === 'web_search' || DATA_SCRIPT.test(command)) return 'research-data';
  if (/render_streamviz\.py|(?:write|render|build|generate).{0,40}\.html/i.test(command)) return 'html-render';
  if (/inspect_html\.py|playwright|screenshot|(?:validate|inspect|check).{0,30}(?:html|layout)/i.test(command)) return 'html-validation';
  return '';
}

function boundedStage(exec) {
  const command = String(exec.arguments?.command || '');
  const description = String(exec.arguments?.description || '');
  // Capability discovery is read-only metadata. It must never consume the
  // single execution allowance for the corresponding delivery stage.
  if (/\bskill_runner\.py\s+contract\b/i.test(command)) return '';
  if (/render_streamviz\.py|(?:write|render|build|generate).{0,40}\.html/i.test(`${command} ${description}`)) return 'html-render';
  if (/inspect_html\.py|playwright|screenshot|(?:validate|inspect|check|核对|检查|验证).{0,30}(?:html|layout|布局)/i.test(`${command} ${description}`)) return 'html-validation';
  if (/(?:code_interpreter|transform\.py)|(?:summari[sz]e|aggregate|consolidat|汇总|聚合).{0,30}(?:data|result|数据|结果)/i.test(`${command} ${description}`)) return 'summary-calculation';
  return '';
}

function boundedObservation(message) {
  return transformedResult([{type:'text',text:JSON.stringify({
    skipped:true,
    reason:message,
    next:'Use the successful existing evidence or artifact and finish the response; do not open another research or delivery loop.',
  })}], false);
}

function failed(result) {
  if (result.isError || result.value?.exitCode != null && result.value.exitCode !== 0 || result.value?.timedOut) return true;
  const text = textOf(result);
  if (/^\[exit code: [1-9]\d*\]|^\[timed out|^Traceback \(most recent call last\):|^\S*(?:snapshot|history|screener): .*error|^All external search providers failed:/im.test(text)) return true;
  for (const line of text.split('\n')) {
    try {
      const data = JSON.parse(line);
      if (data && (data.ok === false || data.failed === true || data.status === 'error' || data.status === 'failed'
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
  return transformedResult([{type: 'text', text: 'Direct URL retrieval skipped: a direct network attempt already failed, was blocked, or exhausted its deadline in this turn. Reuse available search/market observations or use the external-search skill once; do not retry direct reads with more domains.'}], false);
}

// The export name is retained for existing Cordis deployments.
class LightweightGuard {
  constructor(root, now = Date.now) { this.root=path.resolve(root);this.now=now;this.reset(); }
  reset() {
    this.generation=Symbol();this.cache=new Map();this.flights=new Map();
    this.directNetworkUnavailable=false;
    this.failureKeys=new Set();this.familyFailures=new Map();this.completedStages=new Set();this.jobPolls=new Map();
    this.stats={executed:0,reused:0,suppressed:0};
  }
  async execute(exec, next) {
    const family=retryFamily(exec),stage=boundedStage(exec);
    if(family && (this.familyFailures.get(family) || 0)>=2){
      this.stats.suppressed++;
      return boundedObservation('The primary route and its one allowed alternative already failed. Disclose the limitation instead of trying another route.');
    }
    if(stage && this.completedStages.has(stage)){
      this.stats.suppressed++;
      return boundedObservation(`The ${stage} step already completed successfully and may run only once.`);
    }
    if(exec.name==='job_output' && !exec.signal?.aborted){
      const key=jobKey(exec),last=this.jobPolls.get(key) || 0;
      if(this.now()-last<JOB_POLL_COOLDOWN_MS){
        this.stats.suppressed++;
        return transformedResult([{type:'text',text:'[status: running] Poll skipped during the 5-second cooldown; wait for asynchronous completion instead of immediately polling again.'}],false);
      }
      capTimeout(exec,JOB_POLL_TIMEOUT_MS);
      const result=await this.executeCached(exec,next);
      this.jobPolls.set(key,this.now());
      return result;
    }
    if(isDirectExternalCall(exec) && !exec.signal?.aborted){
      if(this.directNetworkUnavailable){this.stats.suppressed++;return webFetchCircuitObservation();}
      capTimeout(exec,exec.name==='web_fetch'?EXTERNAL_CALL_TIMEOUT_MS:EXTERNAL_BATCH_TIMEOUT_MS);
      const result=await this.executeCached(exec,next);
      if(isNetworkUnavailable(result) || exec.name==='web_fetch' && webFetchFailed(result))this.directNetworkUnavailable=true;
      if(!failed(result) && stage)this.completedStages.add(stage);
      return result;
    }
    const result=await this.executeCached(exec,next);
    if(!failed(result) && stage)this.completedStages.add(stage);
    return result;
  }
  async executeCached(exec, next) {
    const call=inspect(exec,this.root),generation=this.generation;
    const run=async()=>{
      this.stats.executed++;
      const raw=await next();
      if(failed(raw) || isNetworkUnavailable(raw)){
        const family=retryFamily(exec);
        if(family)this.familyFailures.set(family,(this.familyFailures.get(family) || 0)+1);
        const key=failureKey(exec,raw);
        if(this.failureKeys.has(key))return repeatedFailureObservation();
        this.failureKeys.add(key);
        return firstFailureSummary(exec,raw,this.root);
      }
      return compactToolResult(exec,raw,this.root);
    };
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
module.exports={name,inject,apply,LightweightGuard,inspect,failed,webFetchFailed,compactToolResult,
  isNetworkUnavailable,isDirectExternalCall,plainJson,transformedResult,retryFamily,boundedStage,
  DEFAULT_COMPACTION_THRESHOLD,JOB_POLL_TIMEOUT_MS};
