import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const start=source.indexOf('function replayOrderedStream('),end=source.indexOf('\nfunction streamVisualizationLane',start);
test('restored native visualization shares live layout and preserves text order',()=>{
 const css=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');
 const dom=new JSDOM('<style>'+css+'</style><article><ol class="thinkingSteps"></ol><div class="finalAnswer"><section class="mixedReport"></section></div></article>');
 const document=dom.window.document,container=document.querySelector('.mixedReport'),article=document.querySelector('article');
 const context=vm.createContext({document,canonicalArtifact:x=>x,streamChartReferenceKey:x=>x,
 createStreamVisualizationArtifact:()=>{const n=document.createElement('div');n.className='streamvizArtifactHost';return n;},
 withArtifactWidgetControl:n=>{const shell=document.createElement('div');shell.className='chatArtifactShell';shell.append(n);return shell;},
 syncStreamAnswerPlacement:(_article,node)=>{node.textContent=node.streamText;}});
 vm.runInContext(source.slice(start,end),context);context.article=article;context.container=container;
 context.blocks=[{kind:'visualization',id:'chart',data:{native:true,url:'/generated/report.html'}},{kind:'text',id:'answer',text:'结论正文'}];
 vm.runInContext('replayOrderedStream(article,blocks,container)',context);
 const style=n=>dom.window.getComputedStyle(n);
 assert.equal(style(container).display,'flex');assert.equal(style(container).gap,'8px');
 assert.equal(style(container.querySelector('.streamvizLiveLane')).marginTop,'0px');
 assert.equal(style(container.querySelector('.chatArtifactShell')).marginTop,'0px');
 assert.equal(container.children[0].className,'streamvizLiveLane');assert.equal(container.children[1].textContent,'结论正文');
 assert.equal(article.streamVisualizationArtifacts[0].url,'/generated/report.html');dom.window.close();
});
