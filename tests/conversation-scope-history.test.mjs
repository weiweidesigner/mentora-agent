import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const start=source.indexOf('function boundedConversationHistory('),end=source.indexOf('\nasync function submitQuestion',start);
const context=vm.createContext({});vm.runInContext(source.slice(start,end),context);
test('long follow-ups retain the human scope within the existing eight-turn budget',()=>{
 const first={role:'user',text:'今天美股有哪些买入机会'};
 const turns=[first,...Array.from({length:11},(_,i)=>({role:i%2?'user':'assistant',text:String(i)}))];
 const result=context.boundedConversationHistory(turns);
 assert.equal(result.length,8);assert.equal(result[0],first);assert.equal(result[7],turns.at(-1));
 assert.ok(result.every(turn=>turns.includes(turn)));
});
test('short histories keep their order and do not duplicate the opening user turn',()=>{
 const turns=[{role:'user',text:'看AAPL'},{role:'assistant',text:'已研究'},{role:'user',text:'帮我下单'}];
 assert.deepEqual(Array.from(context.boundedConversationHistory(turns)),turns);
 assert.equal(context.boundedConversationHistory(null).length,0);
});
