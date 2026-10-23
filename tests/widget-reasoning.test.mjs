import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(process.env.MENTORA_APP_JS||new URL('../app/static/app.js',import.meta.url),'utf8');
const start=source.indexOf('function syncReasoningStrengthComposer('),end=source.indexOf('\nreasoningStrengthButton?.addEventListener',start);
test('dashboard, trading and home reuse one selector and preserve its selected value',()=>{
 const dom=new JSDOM('<div id="home"><div id="control"><input value="3"></div><button id="submitButton"></button></div><section id="widgetWorkspace" hidden><div class="widgetComposerBox"><textarea></textarea><button id="widgetGenerate"></button></div></section><section class="portfolioWorkspace" hidden><div class="pfIdeaComposer"><textarea></textarea><button class="pfIdeaSubmit"></button></div></section>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.eval(`const reasoningStrengthControl=document.querySelector('#control');const reasoningStrengthHomeAnchor=document.createComment('home');reasoningStrengthControl.before(reasoningStrengthHomeAnchor);window.setReasoningStrengthPopover=()=>{};window.resizeComposerInput=()=>{};${source.slice(start,end)}`);
  const widget=w.document.querySelector('#widgetWorkspace'),portfolio=w.document.querySelector('.portfolioWorkspace'),control=w.document.querySelector('#control');
  widget.hidden=false;w.syncReasoningStrengthComposer();
  assert.equal(control.nextElementSibling.id,'widgetGenerate');
  portfolio.hidden=false;widget.hidden=true;w.syncReasoningStrengthComposer();
  assert.equal(control.nextElementSibling.className,'pfIdeaSubmit');
  portfolio.hidden=true;widget.hidden=false;w.syncReasoningStrengthComposer();
  assert.equal(control.nextElementSibling.id,'widgetGenerate');
  widget.hidden=true;w.syncReasoningStrengthComposer();
  assert.equal(control.parentElement.id,'home');
  assert.equal(control.querySelector('input').value,'3');
  assert.equal(w.document.querySelectorAll('#control').length,1);
 }finally{w.close();}
});
