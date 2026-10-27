import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const start=source.indexOf('function upsertStreamVisualization(');
const end=source.indexOf('window.addEventListener("aime:streamviz-followup"',start);
function fixture(){
 const dom=new JSDOM('<article><div class="finalAnswer"></div></article>',{runScripts:'outside-only'}),w=dom.window,mounts=[];
 const article=w.document.querySelector('article');
 w.streamVisualizationLane=()=>article.querySelector('.finalAnswer');w.isNearBottom=()=>false;w.keepScrollPosition=()=>{};
 w.mountStreamVisualization=(host,payload)=>{mounts.push({host,...payload});host.dataset.mounted='true';};
 w.AimeStreamViz={unmount:host=>{host.dataset.unmounted='true';}};
 w.createStreamVisualizationArtifact=()=>w.document.createElement('iframe');
 w.eval(source.slice(start,end));
 return {w,article,mounts,send:data=>w.upsertStreamVisualization(article,data),close:()=>w.close()};
}
test('incomplete native JSON is rendered on every real delta before final and settled in place',()=>{
 const f=fixture();try{
  f.send({id:'live',native:true,reset:true,argumentDelta:'{"title":"Live","widget_code":"<section>First'});
  const host=f.article.querySelector('.streamvizArtifactHost');
  assert.equal(f.mounts.length,1);assert.equal(f.mounts[0].final,false);
  assert.equal(f.mounts[0].toolRawInput,'{"title":"Live","widget_code":"<section>First');
  f.send({id:'live',native:true,argumentDelta:'</section><section>Second'});
  assert.equal(f.mounts.length,2);assert.match(f.mounts[1].toolRawInput,/First<\/section><section>Second$/);
  assert.equal(f.mounts[1].host,host);assert.equal(f.mounts[1].final,false);
  f.send({id:'live',native:true,argumentDelta:'</section>"}',final:true,htmlUrl:'/generated/live.html'});
  assert.equal(f.mounts.length,3);assert.equal(f.mounts[2].host,host);assert.equal(f.mounts[2].final,true);
  assert.equal(JSON.parse(f.mounts[2].toolRawInput).widget_code,'<section>First</section><section>Second</section>');
  assert.equal(f.article.querySelectorAll('.streamvizArtifactHost').length,1);assert(!host.classList.contains('is-live'));
 }finally{f.close();}
});
test('direct HTML deltas retain whitespace; reset replaces the earlier prefix and discard removes it',()=>{
 const f=fixture();try{
  f.send({id:'live',reset:true,delta:'<p>First '});f.send({id:'live',delta:'second</p>'});
  assert.equal(f.mounts[1].code,'<p>First second</p>');assert.equal(f.mounts[1].final,false);
  f.send({id:'live',reset:true,delta:'<p>Restarted</p>'});
  assert.equal(f.mounts[2].code,'<p>Restarted</p>');assert.equal(f.mounts[2].toolRawInput,'');
  f.send({id:'live',discard:true,final:true});assert.equal(f.article.querySelector('.streamvizArtifactHost'),null);
 }finally{f.close();}
});
test('a provisional artifact URL does not fetch a completed report before real final',()=>{
 const f=fixture();try{
  f.send({id:'live',htmlUrl:'/generated/live.html',reset:true});
  assert.equal(f.mounts.length,1);assert.equal(f.mounts[0].final,false);
  assert.equal(f.article.querySelector('iframe'),null);
  f.send({id:'live',htmlUrl:'/generated/live.html',final:true});
  assert.equal(f.article.querySelector('iframe')?.tagName,'IFRAME');
 }finally{f.close();}
});
