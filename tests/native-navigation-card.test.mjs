import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM('<div id="mount"></div>',{runScripts:'outside-only',url:'https://example.com/mentora/'});
 dom.window.eval(source.slice(source.indexOf('function createNavigationArtifact('),source.indexOf('function createStreamVisualizationArtifact(')));
 return dom;
}
const entry=(url,label='券商连接与比较')=>`<!doctype html><main id="root"><a class="entry mentoraNavigationCard" href="${url}"><span class="name">${label}</span></a></main>`;
test('saved Web navigation documents render as compact native links without chart frames',()=>{
 const dom=setup(),w=dom.window;
 const card=w.createNavigationArtifact(entry('https://www.ainvest.com/brokers/?from=trade'),{url:'/generated/brokers.html'});
 w.document.body.append(card);
 assert.equal(card.querySelector('a').textContent,'券商连接与比较');
 assert.equal(card.querySelector('a').href,'https://www.ainvest.com/brokers/?from=trade');
 assert.equal(card.querySelector('a').target,'_blank');
 assert.equal(card.querySelector('a').rel,'noopener noreferrer');
 assert.equal(card.querySelectorAll('iframe').length,0);
 assert.equal(card.dataset.artifactUrl,'/generated/brokers.html');
 dom.window.close();
});
test('ordinary reports and non-Web actions keep their existing renderer',()=>{
 const dom=setup(),w=dom.window;
 for(const html of ['<main><h1>分析报告</h1></main>','<button class="entry mentoraNavigationCard" data-ainvest-feature="trade">交易</button>'])assert.equal(w.createNavigationArtifact(html),null);
 dom.window.close();
});
test('card documents never run embedded scripts or accept unapproved navigation URLs',()=>{
 const dom=setup(),w=dom.window;
 for(const url of ['javascript:alert(1)','https://example.com/','https://www.ainvest.com.evil.test/','https://name:secret@www.ainvest.com/','http://www.ainvest.com/'])assert.equal(w.createNavigationArtifact(entry(url)),null);
 const html=entry('https://www.ainvest.com/brokers/','&lt;img src=x onerror=alert(1)&gt;')+'<script>window.bad=true</script>';
 const card=w.createNavigationArtifact(html);assert.equal(w.bad,undefined);assert.equal(card.querySelectorAll('script,img').length,0);
 dom.window.close();
});
test('the normal artifact loading path replaces its loading host with a native card',async()=>{
 const dom=setup(),w=dom.window;
 w.canonicalArtifact=v=>v;w.isGeneratedImageArtifact=()=>false;
 w.mountStreamVisualization=()=>{};w.artifactLoadingMessage=()=>'正在加载';w.artifactCode=async()=>entry('https://www.ainvest.com/brokers/');
 w.AimeStreamViz={unmount:()=>{}};
 w.eval(source.slice(source.indexOf('function createStreamVisualizationArtifact('),source.indexOf('function orderedStreamFlow(')));
 const pending=w.createStreamVisualizationArtifact({url:'/generated/brokers.html'},0);
 w.document.getElementById('mount').append(pending);
 await new Promise(resolve=>setTimeout(resolve,0));
 const result=w.document.querySelector('.nativeNavigationArtifact');
 assert(result);assert.equal(w.document.querySelectorAll('iframe').length,0);
 assert.equal(result.dataset.artifactReady,'true');assert.equal(result.querySelector('a').href,'https://www.ainvest.com/brokers/');
 dom.window.close();
});
