import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
function code(name){const a=source.indexOf('function '+name+'(');return source.slice(a,source.indexOf('\nfunction ',a+1));}
test('StreamViz start collapses the arrow without preceding prose and respects later reopening',()=>{
 const dom=new JSDOM('<article><button class="thinkingTrigger" aria-expanded="true"></button><div class="thinkingFlow"></div></article>',{runScripts:'outside-only'}),w=dom.window,article=w.document.querySelector('article');
 let closed=0;w.activeActivityArticle=article;article.dataset.activityInlineExpanded='true';
 w.closeActivityDrawer=()=>{closed++;w.activeActivityArticle=null;};w.syncInlineActivity=a=>{const flow=a.querySelector('.thinkingFlow');flow.hidden=a.dataset.activityInlineExpanded!=='true';return flow;};w.syncStreamAnswerPlacement=()=>{};w.upsertStreamVisualization=()=>{};
 w.eval(code('setInlineActivityExpanded')+code('queueStreamVisualization'));
 w.queueStreamVisualization(article,{id:'v',reset:true,final:false});
 assert.equal(article.dataset.activityInlineExpanded,'false');assert.equal(article.querySelector('button').getAttribute('aria-expanded'),'false');assert(article.querySelector('.thinkingFlow').hidden);assert.equal(closed,1);
 w.setInlineActivityExpanded(article,true);w.queueStreamVisualization(article,{id:'v',argumentDelta:'more'});
 assert.equal(article.dataset.activityInlineExpanded,'true');assert.equal(article.querySelector('button').getAttribute('aria-expanded'),'true');
 dom.window.close();
});
test('many received snapshots mount at most once per paint, retaining latest and final payload',()=>{
 const dom=new JSDOM('<div id="host"></div>',{runScripts:'outside-only'}),w=dom.window,host=w.document.querySelector('div'),frames=[],seen=[];
 w.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};w.AimeStreamViz={mount:(_host,payload)=>seen.push(payload)};w.eval(code('mountStreamVisualization'));
 for(let i=0;i<1000;i++)w.mountStreamVisualization(host,{code:'<p>'+i,final:false});
 assert.equal(frames.length,1);assert.equal(seen.length,0);frames.shift()();assert.equal(seen[0].code,'<p>999');
 w.mountStreamVisualization(host,{code:'<p>done</p>',final:true});frames.shift()();assert.equal(seen[1].final,true);assert.equal(seen.length,2);
 w.mountStreamVisualization(host,{code:'stale'});host.remove();frames.shift()();assert.equal(seen.length,2);dom.window.close();
});
