import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const code=readFileSync(new URL('../app/static/chart-activation.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM('<main><article class="widgetCard"><header class="widgetCardHeader"></header><iframe></iframe></article><article class="widgetCard"><iframe></iframe></article><button id="outside">外部</button></main>',{runScripts:'outside-only'});
 dom.window.eval(code);return{dom,w:dom.window,d:dom.window.document,frames:[...dom.window.document.querySelectorAll('iframe')]};
}
test('charts start locked; clicking enables interaction and leaving or clicking outside relocks',()=>{
 const s=setup(),[frame]=s.frames;s.w.installChartActivation(frame,'advanced-chart');const button=s.d.querySelector('.widgetChartActivation');
 assert.equal(button.hidden,false);let bubbled=false;s.d.querySelector('main').addEventListener('wheel',()=>bubbled=true);
 const wheel=new s.w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100});button.dispatchEvent(wheel);assert.equal(wheel.defaultPrevented,false);assert(bubbled);
 button.click();assert.equal(button.hidden,true);assert(frame.closest('article').classList.contains('is-chart-active'));
 s.d.querySelector('#outside').dispatchEvent(new s.w.Event('pointerdown',{bubbles:true}));assert.equal(button.hidden,false);
 button.click();frame.closest('article').dispatchEvent(new s.w.Event('pointerleave'));assert.equal(button.hidden,false);s.dom.window.close();
});
test('only one chart activates at a time and ordinary data widgets remain interactive',()=>{
 const s=setup(),[a,b]=s.frames;s.w.installChartActivation(a,'advanced-chart');s.w.installChartActivation(b,'market-data');assert.equal(s.d.querySelectorAll('.widgetChartActivation').length,1);
 s.w.installChartActivation(b,'advanced-chart');const buttons=[...s.d.querySelectorAll('.widgetChartActivation')];buttons[0].click();buttons[1].click();assert.equal(buttons[0].hidden,false);assert.equal(buttons[1].hidden,true);
 s.w.installChartActivation(b,'advanced-chart');assert.equal(s.d.querySelectorAll('.widgetChartActivation').length,2);s.dom.window.close();
});

test('conversation charts use the same click gate, relock on reload and support Escape',()=>{
 const s=setup(),[frame]=s.frames,card=frame.closest('article');card.className='reportFrameShell';
 s.w.installChartActivation(frame,'advanced-chart');const button=card.querySelector('.widgetChartActivation');
 assert.equal(button.style.top,'0px');assert.equal(button.hidden,false);
 button.click();assert.equal(button.hidden,true);
 s.w.installChartActivation(frame,'advanced-chart');assert.equal(button.hidden,false);assert.equal(card.querySelectorAll('.widgetChartActivation').length,1);
 button.click();s.d.dispatchEvent(new s.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(button.hidden,false);
 s.dom.window.close();
});
