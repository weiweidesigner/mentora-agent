import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const app=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
test('cached iframe themes follow the host initially and after toggling, including deployed prefixes',()=>{
  const dom=new JSDOM('',{url:'https://example.com/veya/'});
  const context=vm.createContext({document:dom.window.document,window:dom.window,URL,currentThemeMode:()=> 'dark',resizeReportDocumentFrame:()=>{},setTimeout:()=>1,clearTimeout:()=>{}});
  vm.runInContext(app.slice(app.indexOf('function createArtifactFallbackFrame('),app.indexOf('async function artifactCode(')),context);
  for(const path of ['/static/cases/amd/chart.html','/veya/static/cases/jpm/chart.html']) {
    context.item={url:path};const shell=vm.runInContext('createArtifactFallbackFrame(item,0)',context);
    dom.window.document.body.append(shell);const frame=shell.querySelector('iframe');
    assert.equal(shell.querySelector('[role="status"]'),null);
    assert.equal(shell.classList.contains('is-chart-loading'),false);
    assert.equal(new URL(frame.src).searchParams.get('theme'),'dark');
  }
  const other=dom.window.document.createElement('iframe');other.src='https://other.example/chart.html';other.className='reportDocumentFrame';dom.window.document.body.append(other);
  vm.runInContext('syncReportFrameThemes("light")',context);
  for(const frame of [...dom.window.document.querySelectorAll('iframe')].slice(0,2)) assert.equal(new URL(frame.src).searchParams.get('theme'),'light');
  assert.equal(other.src,'https://other.example/chart.html');
});

test('saved chart runtime selects root and body palettes before chart startup',async()=>{
  const script=readFileSync(new URL('../app/static/cases/theme.js',import.meta.url),'utf8');
  for(const mode of ['dark','light']) {
    const dom=new JSDOM('<body class="theme-light"></body>',{url:`https://example.com/chart.html?theme=${mode}`});
    const w=dom.window;
    vm.runInContext(script,vm.createContext({document:w.document,location:w.location,parent:w,URLSearchParams,MutationObserver:w.MutationObserver}));
    assert.equal(w.document.documentElement.dataset.theme,mode);
    assert.ok(w.document.body.classList.contains(`theme-${mode}`));
    assert.ok(!w.document.body.classList.contains(`theme-${mode==='dark'?'light':'dark'}`));
    await new Promise(resolve=>setTimeout(resolve,0));
    w.close();
  }
});

test('cached dark palettes override light title and SVG class colors',()=>{
 const script=readFileSync(new URL('../app/static/cases/theme.js',import.meta.url),'utf8');
 for(const theme of ['light','dark']){
  const dom=new JSDOM('<head><style>.chart-title{color:#16181c}.axis-label{fill:#777}.grid-line{stroke:#e8e8e8}#title{color:#151922}</style></head><body><h2 class="chart-title">营收</h2><div id="title">气泡图</div><svg><text class="axis-label">30</text><line class="grid-line"/></svg></body>',{url:`https://example.com/chart.html?theme=${theme}`});
  const w=dom.window;
  vm.runInContext(script,vm.createContext({document:w.document,location:w.location,parent:w,URLSearchParams,MutationObserver:w.MutationObserver}));
  assert.equal(w.getComputedStyle(w.document.querySelector('.chart-title')).color,theme==='dark'?'rgb(241, 245, 249)':'rgb(22, 24, 28)');
  assert.equal(w.getComputedStyle(w.document.querySelector('#title')).color,theme==='dark'?'rgb(241, 245, 249)':'rgb(21, 25, 34)');
  assert.equal(w.getComputedStyle(w.document.querySelector('.axis-label')).fill,theme==='dark'?'rgb(193, 202, 215)':'rgb(119, 119, 119)');
  w.close();
 }
});
