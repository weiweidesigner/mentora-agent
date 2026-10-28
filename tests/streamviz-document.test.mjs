import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
const compiled=transformSync(readFileSync(new URL('../node_modules/streamviz-react/src/core/completeStreamHtml.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'}).code;
const {completeStreamHtml}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
import {prepareStreamDocument} from '../frontend/streamviz-document.mjs';

const scripts=[['data-sv-financial-semantics','/* INTERNAL_FINANCIAL_HELPER */ window.helper=true;'],['data-widget-control','/* INTERNAL_WIDGET_HELPER */ window.control=true;']];
const html='<style>.core{color:red}</style><aside class="core"><h2>核心判断</h2><p><strong>正文判断</strong> 继续解释。</p></aside>';
function visible(source){const dom=new JSDOM(source);dom.window.document.querySelectorAll('script,style').forEach(n=>n.remove());const text=dom.window.document.body.textContent;dom.window.close();return text;}

test('old helper concatenation leaks script source at an unfinished tag',()=>{
 const prefix=html.slice(0,html.indexOf('<p>')+2);
 const unsafe=prefix+`<script ${scripts[0][0]}>${scripts[0][1]}</script>`;
 assert.match(visible(completeStreamHtml(unsafe)),/INTERNAL_FINANCIAL_HELPER/);
});
test('every actual HTML prefix renders without appending internal scripts',()=>{
 for(let end=0;end<=html.length;end++){
  const code=html.slice(0,end);
  const props=prepareStreamDocument({code,exportCode:code,final:false},scripts,completeStreamHtml);
  assert.equal(props.code,code);assert.equal(props.exportCode,code);assert.equal(props.smoothStreaming,false);
  assert.doesNotMatch(visible(completeStreamHtml(props.code)),/INTERNAL_|window\.helper/);
 }
});
test('final document adds helpers once, safely outside tags, with the same visible report',()=>{
 const props=prepareStreamDocument({code:html,exportCode:html,final:true},scripts,completeStreamHtml);
 assert.equal(visible(props.code),'核心判断正文判断 继续解释。');
 assert.equal(props.code,props.exportCode);
 assert.equal((props.code.match(/data-sv-financial-semantics/g)||[]).length,1);
 assert.equal(prepareStreamDocument(props,scripts,completeStreamHtml).code,props.code);
 const unfinished=html.slice(0,html.indexOf('<p>')+2);
 assert.doesNotMatch(visible(prepareStreamDocument({code:unfinished,final:true},scripts,completeStreamHtml).code),/INTERNAL_/);
 assert.equal(prepareStreamDocument({code:'',final:true},scripts,completeStreamHtml).code,'');
});

test('saved viewport helper is upgraded once rather than keeping two viewport writers',()=>{
 const marker='data-sv-line-label-layout-v2';
 const html='<main>正文</main><script '+marker+'>oldViewport()</script>';
 const result=prepareStreamDocument({code:html,exportCode:html,final:true},[[marker,'newViewport()']],s=>s);
 assert(!result.code.includes('oldViewport()'));assert(result.code.includes('newViewport()'));assert.equal(result.code.split('<script '+marker+'>').length,2);assert(result.code.includes('<main>正文</main>'));
});
