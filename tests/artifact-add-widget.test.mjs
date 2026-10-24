import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('const addToWidgetIcon'),source.indexOf('function createArtifactFallbackFrame'));

test('inline score keeps the host Widget action after the score and preserves its chart title',async()=>{
  const dom=new JSDOM('<main></main>',{url:'https://example.com/',runScripts:'outside-only'}),w=dom.window;w.eval(helper);
  const chart=w.document.createElement('div');
  chart.innerHTML='<header><h1 id="title">多维投资评级</h1><span data-widget-title-action-anchor><span>6.46 / 10</span></span></header>';
  const shell=w.withArtifactWidgetControl(chart,{url:'/generated/radar.html'});w.document.body.append(shell);
  await new Promise(resolve=>w.setTimeout(resolve,0));
  assert.equal(chart.querySelectorAll('button').length,1);
  const anchor=chart.querySelector('[data-widget-title-action-anchor]'),button=anchor.lastElementChild;
  assert(button.matches('button.artifactAddToWidget'));
  assert.equal(chart.querySelector('h1 button'),null);
  let detail;w.addEventListener('mentora:add-artifact-to-widget',event=>detail=event.detail);button.click();
  assert.equal(detail.title,'多维投资评级');assert.equal(detail.url,'/generated/radar.html');
  dom.window.close();
});

for(const runtime of ['artifact-widget-control.js','artifact-presentation.js']){
 test(runtime+' moves an existing action after the inline score without duplicates',async()=>{
  const dom=new JSDOM('<header><h1 id="title">多维投资评级<button data-widget-title-action></button></h1><span data-widget-title-action-anchor><span>6.46 / 10</span></span></header>',{url:'https://example.com/',runScripts:'outside-only'}),w=dom.window;
  const parent={postMessage(){}};Object.defineProperty(w,'parent',{value:parent});
  w.eval(readFileSync(new URL('../app/static/'+runtime,import.meta.url),'utf8'));
  w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{type:'mentora:widget-control'}}));
  await new Promise(resolve=>w.setTimeout(resolve,0));
  assert.equal(w.document.querySelectorAll('button').length,1);
  assert.equal(w.document.querySelector('h1 button'),null);
  assert(w.document.querySelector('[data-widget-title-action-anchor] > button:last-child'));
  dom.window.close();
 });
 test(runtime+' creates the action after the inline score and keeps the original title',async()=>{
  const dom=new JSDOM('<header><h1 id="title">多维投资评级</h1><span data-widget-title-action-anchor><span>6.46 / 10</span></span></header>',{url:'https://example.com/',runScripts:'outside-only'}),w=dom.window;
  const parent={postMessage(){}};Object.defineProperty(w,'parent',{value:parent});
  w.eval(readFileSync(new URL('../app/static/'+runtime,import.meta.url),'utf8'));
  w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{type:'mentora:widget-control'}}));
  await new Promise(resolve=>w.setTimeout(resolve,0));
  const button=w.document.querySelector('[data-widget-title-action-anchor] > button:last-child');assert(button);
  let detail;parent.postMessage=data=>detail=data;button.click();
  assert.equal(detail.title,'多维投资评级');assert.equal(w.document.querySelectorAll('button').length,1);
  dom.window.close();
 });
}

test('conversation visualization gets the requested add-to-widget control and emits its artifact',()=>{
  const dom=new JSDOM('<main></main>',{url:'https://example.com/mentora/',runScripts:'outside-only'}),w=dom.window;
  w.eval(helper);let detail;
  w.addEventListener('mentora:add-artifact-to-widget',event=>detail=event.detail);
  const chart=w.document.createElement('div');chart.className='streamvizArtifactHost';chart.innerHTML='<h2>指数对比</h2>'; 
  const shell=w.withArtifactWidgetControl(chart,{url:'/generated/chart.html',title:'指数对比'});w.document.body.append(shell);
  assert.equal(shell.querySelector('.artifactWidgetTitle'),null);
  const button=chart.querySelector('h2 > .artifactAddToWidget');assert(button);assert.match(button.innerHTML,/viewBox="0 0 1024 1024"/);
  button.click();assert.equal(detail.url,'/generated/chart.html');assert.equal(detail.title,'指数对比');assert.equal(detail.trigger,button);dom.window.close();
});

 test('late chart titles receive one action without a synthetic heading',async()=>{
  const dom=new JSDOM('<main></main>',{url:'https://example.com/',runScripts:'outside-only'}),w=dom.window;w.eval(helper);
  const chart=w.document.createElement('div'),shell=w.withArtifactWidgetControl(chart,{url:'/generated/a.html'});w.document.body.append(shell);
  assert.equal(shell.textContent,'');chart.innerHTML='<h2>真实标题</h2>';await new Promise(resolve=>w.setTimeout(resolve,0));
  assert.equal(chart.querySelectorAll('h2 > button').length,1);assert.equal(shell.textContent,'真实标题');dom.window.close();
});
 test('sandbox action waits for host enable and preserves the actual title',async()=>{
  const dom=new JSDOM('<h2>涨跌幅分布</h2>',{url:'https://example.com/',runScripts:'outside-only'}),w=dom.window;
  const parent={postMessage(){}};Object.defineProperty(w,'parent',{value:parent});
  w.eval(readFileSync(new URL('../app/static/artifact-widget-control.js',import.meta.url),'utf8'));
  assert.equal(w.document.querySelector('button'),null);
  w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{type:'mentora:widget-control'}}));
  await new Promise(resolve=>w.setTimeout(resolve,0));
  const button=w.document.querySelector('h2 > button');assert(button);let detail;parent.postMessage=data=>detail=data;button.click();
  const actionStyle=w.document.querySelector('[data-widget-title-action-style]').textContent;
  assert.match(actionStyle,/margin:0 0 0 6px!important/);assert.match(actionStyle,/padding:5px 10px 5px 0!important/);
  assert.match(actionStyle,/position:static!important/);assert.match(actionStyle,/flex-shrink:0/);
  assert.deepEqual(JSON.parse(JSON.stringify(detail)),{type:'mentora:add-widget',title:'涨跌幅分布'});dom.window.close();
});

test('presentation runtime replaces the legacy gap without starving the event loop',async()=>{
  const dom=new JSDOM('<head><style data-widget-title-action-style>[data-widget-title-action]{margin-left:10px}</style></head><body><h2>指数表现<button data-widget-title-action></button></h2></body>',{url:'https://example.com/',runScripts:'outside-only'}),w=dom.window;
  const parent={postMessage(){}};Object.defineProperty(w,'parent',{value:parent});
  w.eval(readFileSync(new URL('../app/static/artifact-presentation.js',import.meta.url),'utf8'));
  w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{type:'mentora:widget-control'}}));
  await new Promise(resolve=>w.setTimeout(resolve,0));
  const style=w.document.querySelector('[data-widget-title-action-style]'),actionStyle=style.textContent;
  assert.match(actionStyle,/margin:0 0 0 6px!important/);assert.match(actionStyle,/justify-content:flex-start!important/);dom.window.close();
});

 test('fallback replacement still enables the current frame and opens the picker',()=>{
  const dom=new JSDOM('<main></main>',{url:'https://example.com/',runScripts:'outside-only'}),w=dom.window;w.eval(helper);
  const old=w.document.createElement('div'),shell=w.withArtifactWidgetControl(old,{url:'/generated/a.html'});w.document.body.append(shell);
  const frame=w.document.createElement('iframe');old.replaceWith(frame);let detail;w.addEventListener('mentora:add-artifact-to-widget',e=>detail=e.detail);
  w.dispatchEvent(new w.MessageEvent('message',{source:frame.contentWindow,data:{type:'mentora:add-widget',title:'实际标题'}}));
  assert.equal(detail.title,'实际标题');assert.equal(detail.url,'/generated/a.html');dom.window.close();
});
