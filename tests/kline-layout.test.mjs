import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const records=JSON.parse(readFileSync(new URL('fixtures/kline-case-data.json',import.meta.url)));
const source=readFileSync(new URL('app/skills/business-chart-recall/scripts/kline.py',root),'utf8');
const saved=readFileSync(new URL(records.find(row=>row.path.includes('business-kline/')).path,root),'utf8');
function calculations(text){
 const code=text.slice(text.indexOf('  function rsi('),text.indexOf('  function measuredTextWidth('));
 const context=vm.createContext({});vm.runInContext(code,context);return context;
}
for(const [name,text] of [['component',source],['saved case',saved]]){
 test(`${name}: RSI uses Wilder smoothing and preserves warm-up gaps`,()=>{
  const {rsi}=calculations(text);
  const closes=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00];
  const values=rsi(closes.map(close=>({close})));
  assert.ok(values.slice(0,14).every(value=>value===null));
  assert.ok(Math.abs(values[14]-70.464135)<0.000001);
  assert.ok(Math.abs(values[15]-66.249619)<0.000001);
  for(const [rows,want] of [[Array(20).fill(1),50],[Array.from({length:20},(_,i)=>i),100],[Array.from({length:20},(_,i)=>20-i),0]]){
   assert.equal(rsi(rows.map(close=>({close}))).at(-1),want);
  }
 });
 test(`${name}: configured KDJ renders valid values without fabricated warm-up`,()=>{
  const {kdj}=calculations(text);
  const rows=Array.from({length:40},(_,i)=>({close:50+Math.sin(i)*4,low:40,high:60}));
  const values=kdj(rows);
  for(const series of Object.values(values)){
   assert.ok(series.slice(0,8).every(value=>value===null));
   assert.ok(series.slice(8).every(Number.isFinite));
  }
  for(let i=8;i<rows.length;i++)assert.ok(Math.abs(values.j[i]-(3*values.k[i]-2*values.d[i]))<1e-9);
  assert.equal(kdj(Array(20).fill({close:1,low:1,high:1})).k.at(-1),50);
 });
}

test('all refreshed K-line cases retain exact data, annotations, periods and provenance',()=>{
 assert.equal(records.length,11);
 for(const record of records){
  const html=readFileSync(new URL(record.path,root),'utf8');
  const constants=html.match(/^  const (?:config|dataByPeriod|lazyPagesByPeriod|labels) = .*;$/gm);
  assert.equal(createHash('sha256').update(constants.join('\n')).digest('hex'),record.dataSha256,record.path);
  assert.match(html,/pane.type === 'RSI' \|\| pane.type === 'KDJ'/);
  assert.match(html,/drawValueAxis\(pane, minM, maxM, fmtMacdIndicator, plot\)/);
  assert.match(html,/flex:0 1 auto;width:max-content/);
  assert.doesNotMatch(html,/\.period-tabs\{[^}]*flex:1;/);
 }
});
