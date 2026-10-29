import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const app=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const runtime=app.slice(app.indexOf('let reportTooltipPortal = null;'),app.indexOf('function createArtifactFallbackFrame('));
for(const arrow of ['bottom','none'])test(`lifted multi-series tooltip preserves layout and ${arrow} arrow preference`,async()=>{
 const dom=new JSDOM('<iframe></iframe>',{runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,frame=w.document.querySelector('iframe'),doc=frame.contentDocument;
 doc.body.innerHTML='<div class="tooltip"><div class="tip-title">5/23</div><div class="tip-rows" style="display:flex;flex-direction:column;gap:5px">'+Array.from({length:6},(_,i)=>`<div style="display:grid;grid-template-columns:minmax(48px,1fr) max-content;gap:10px"><span>${2022+i}</span><b>+2.10%</b></div>`).join('')+'</div></div>';
 const tip=doc.querySelector('.tooltip');if(arrow==='none')tip.dataset.tooltipArrow='none';tip.firstElementChild.style.fontWeight='500';tip.querySelector('.tip-rows>div').style.minHeight='22px';tip.getBoundingClientRect=()=>({width:210,height:180,left:40,top:-110,bottom:70});frame.getBoundingClientRect=()=>({width:800,height:600,left:20,top:160,bottom:760});Object.defineProperty(frame,'clientWidth',{value:800});
 w.eval(runtime);w.installReportTooltipPortal(frame);tip.classList.add('visible');await new Promise(resolve=>setTimeout(resolve,50));
 const portal=w.document.querySelector('.reportTooltipPortal');assert.ok(portal&&!portal.hidden);const rows=portal.children[1];assert.equal(rows.style.flexDirection,'column');assert.equal(rows.children.length,6);assert.equal(rows.children[0].style.gridTemplateColumns,'minmax(48px,1fr) max-content');assert.ok(parseFloat(portal.style.top)>=168);assert.equal(tip.style.visibility,'hidden');
 assert.equal(portal.dataset.arrow,arrow);assert.equal(rows.children[0].style.minHeight,'22px');assert.equal(portal.firstElementChild.style.fontWeight,'500');
 if(arrow==='none'){
  const left=portal.style.left;
  for(const [type,x] of [['pointerdown',80],['pointermove',140]]){const event=new w.Event(type,{bubbles:true});Object.assign(event,{pointerType:'touch',clientX:x,clientY:50});doc.dispatchEvent(event);}
  assert.equal(portal.style.left,left,'side-positioned tooltips must not recenter over the touch target');
 }
 w.dismissReportTooltip();assert.equal(portal.hidden,true);frame.reportTooltipCleanup();dom.window.close();
});
for (const side of ['right','left']) test(`pie tooltip keeps dot, typography and ${side} side pointer in outer portal`,async()=>{
 const dom=new JSDOM('<iframe></iframe>',{runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,frame=w.document.querySelector('iframe'),doc=frame.contentDocument;
 doc.body.innerHTML=`<div class="tooltip" data-side="${side}" style="background:#303030;padding:10px 12px"><div style="display:flex;align-items:center;gap:8px;font-weight:600"><i class="tip-dot" style="display:block;width:8px;height:8px;border-radius:50%;background:rgb(0,180,140)"></i><span>Other</span></div><div style="padding-left:16px;font-size:14px;font-weight:400">19.27%</div></div>`;
 const tip=doc.querySelector('.tooltip');tip.getBoundingClientRect=()=>({width:160,height:70,left:40,top:80,bottom:150});frame.getBoundingClientRect=()=>({width:800,height:600,left:20,top:160,bottom:760});Object.defineProperties(frame,{clientWidth:{value:800},clientHeight:{value:600}});
 Object.defineProperties(w.HTMLElement.prototype,{offsetWidth:{get(){return this.classList.contains('reportTooltipPortal')?160:0}},offsetHeight:{get(){return this.classList.contains('reportTooltipPortal')?70:0}}});
 w.eval(runtime);w.installReportTooltipPortal(frame);tip.classList.add('active');await new Promise(resolve=>setTimeout(resolve,50));
 const portal=w.document.querySelector('.reportTooltipPortal');assert.ok(portal&&!portal.hidden);assert.equal(portal.dataset.arrow,side==='right'?'left':'right');
 const dot=portal.querySelector('i');assert.ok(dot);assert.equal(dot.style.width,'8px');assert.equal(dot.style.height,'8px');assert.equal(dot.style.backgroundColor,'rgb(0, 180, 140)');assert.equal(portal.firstElementChild.style.fontWeight,'600');assert.equal(portal.lastElementChild.style.fontWeight,'400');assert.equal(portal.lastElementChild.style.paddingLeft,'16px');
 const left=portal.style.left;for(const [type,x] of [['pointerdown',80],['pointermove',140]]){const event=new w.Event(type,{bubbles:true});Object.assign(event,{pointerType:'touch',clientX:x,clientY:50});doc.dispatchEvent(event)}
 assert.equal(portal.style.left,left,'side-arrow pie tip must keep its native side position while touching');
 frame.reportTooltipCleanup();dom.window.close();
});
