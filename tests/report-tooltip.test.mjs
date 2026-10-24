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
 w.dismissReportTooltip();assert.equal(portal.hidden,true);frame.reportTooltipCleanup();dom.window.close();
});
