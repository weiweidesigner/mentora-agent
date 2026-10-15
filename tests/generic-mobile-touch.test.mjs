import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const saved = readFileSync(new URL('../app/skills/generic-chart/runtime/mobile_interactions.html', import.meta.url), 'utf8');
const runtime = saved.match(/<script id="genericMobileTouch">([\s\S]*?)<\/script>/)[1];
function fixture() {
  const dom = new JSDOM('<svg id="chart"><rect class="hover-zone"/></svg><aside class="tip"></aside><button>其他位置</button>', { runScripts: 'outside-only' });
  const { window } = dom;
  const hit = window.document.querySelector('rect'), tip = window.document.querySelector('.tip');
  window.document.elementFromPoint = () => hit;
  window.hideTooltip = () => tip.classList.remove('active');
  for (const type of ['mouseenter','mousemove']) hit.addEventListener(type, () => tip.classList.add('active'));
  hit.addEventListener('mouseleave', window.hideTooltip);
  window.eval(runtime);
  const touch = type => {
    const event = new window.Event(type, { bubbles: true });
    Object.assign(event, { pointerType:'touch', pointerId:1, clientX:20, clientY:20 });
    hit.dispatchEvent(event);
  };
  return { window, hit, tip, touch, close: () => window.close() };
}
test('a touch tooltip is readable briefly and cannot remain pinned', async () => {
  const f = fixture();
  try {
    f.touch('pointerdown');f.touch('pointerup');assert(f.tip.classList.contains('active'));
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert(!f.tip.classList.contains('active'));
  } finally { f.close(); }
});
test('scroll and navigation dismiss native hover even without a tracked touch target', () => {
  const f = fixture();
  try {
    for (const type of ['scroll','veya:chat-navigate']) {
      f.hit.dispatchEvent(new f.window.MouseEvent('mouseenter'));assert(f.tip.classList.contains('active'));
      f.window.dispatchEvent(new f.window.Event(type));assert(!f.tip.classList.contains('active'));
    }
  } finally { f.close(); }
});
test('touch compatibility mouse events cannot reopen a dismissed tooltip', () => {
  const f = fixture();
  try {
    const event = new f.window.MouseEvent('mousemove', { bubbles:true });
    Object.defineProperty(event, 'sourceCapabilities', { value:{firesTouchEvents:true} });
    f.hit.dispatchEvent(event);assert(!f.tip.classList.contains('active'));
  } finally { f.close(); }
});
test('vertical touch moves stay native after pointercancel, without legacy chart interception', () => {
  const f = fixture();
  try {
    const touchEvent = (type, y) => {
      const event = new f.window.Event(type, { bubbles:true, cancelable:true });
      Object.assign(event, { touches:[{clientX:20,clientY:y}] });
      f.hit.dispatchEvent(event);return event;
    };
    f.hit.addEventListener('touchmove', event => event.preventDefault());
    touchEvent('touchstart',20);f.touch('pointercancel');
    assert(!touchEvent('touchmove',40).defaultPrevented);
    assert(!touchEvent('touchmove',80).defaultPrevented);
  } finally { f.close(); }
});
test('scrolling past an inactive chart does not repeatedly measure or hide its tooltip', () => {
  const f = fixture();let calls=0;
  f.window.hideTooltip=()=>calls++;
  try {
    for(let i=0;i<30;i++)f.window.dispatchEvent(new f.window.Event('scroll'));
    assert.equal(calls,0);
  } finally { f.close(); }
});
test('moving within the same data row does not rebuild its tooltip on every touch move', () => {
  const f = fixture();let enters=0,moves=0;
  f.hit.addEventListener('mouseenter',()=>enters++);f.hit.addEventListener('mousemove',()=>moves++);
  try {
    f.touch('pointerdown');
    for(const x of [30,40,50]) {
      const event=new f.window.Event('pointermove',{bubbles:true});
      Object.assign(event,{pointerType:'touch',pointerId:1,clientX:x,clientY:20});f.hit.dispatchEvent(event);
    }
    assert.equal(enters,1);assert.equal(moves,0);
  } finally {f.close();}
});
test('a held horizontal gesture follows the finger and remains horizontal on the return sweep', () => {
  const f=fixture();let contexts=0;
  Object.defineProperty(f.tip,'offsetWidth',{value:100});
  f.window.parentTooltipContext=()=>{contexts++;return {element:f.tip,win:f.window,offsetLeft:0};};
  try {
    f.touch('pointerdown');
    const move=(x,y)=>{
      const event=new f.window.Event('pointermove',{bubbles:true});
      Object.assign(event,{pointerType:'touch',pointerId:1,clientX:x,clientY:y});f.hit.dispatchEvent(event);
    };
    move(100,20);assert.equal(f.tip.style.left,'50px');
    move(120,20);assert.equal(f.tip.style.left,'70px');
    move(20,30);assert(f.tip.classList.contains('active'));assert.equal(f.tip.style.left,'8px');
    assert.equal(contexts,1);
  } finally {f.close();}
});
test('local pie tooltips follow outside the chart without rebuilding data or copying event attributes', () => {
  const dom=new JSDOM('<svg><path class="pie-slice"/></svg><div class="stage"><aside class="pie-tooltip" style="background:rgb(21,25,34)"><div onclick="throw 1">甲</div></aside></div>',{runScripts:'outside-only'});
  const w=dom.window,hit=w.document.querySelector('path'),source=w.document.querySelector('aside'),stage=w.document.querySelector('.stage');
  Object.defineProperties(source,{offsetParent:{value:stage},offsetWidth:{value:120},offsetHeight:{value:40}});
  Object.defineProperties(stage,{clientWidth:{value:320},clientHeight:{value:360}});stage.getBoundingClientRect=()=>({left:0,top:0});
  w.document.elementFromPoint=()=>hit;w.hideTooltip=()=>source.classList.remove('active');hit.addEventListener('mouseenter',()=>source.classList.add('active'));hit.addEventListener('mouseleave',w.hideTooltip);w.eval(runtime);
  const touch=(type,x)=>{const e=new w.Event(type,{bubbles:true});Object.assign(e,{pointerType:'touch',pointerId:1,clientX:x,clientY:80});hit.dispatchEvent(e);};
  try{
    touch('pointerdown',20);const portal=w.document.querySelector('.generic-local-tooltip-portal');assert(portal&&!portal.hidden);assert.equal(source.style.visibility,'hidden');assert.equal(portal.querySelector('[onclick]'),null);
    const data=portal.innerHTML;touch('pointermove',100);assert.equal(portal.style.left,'114px');assert.equal(portal.innerHTML,data);assert.equal(portal.style.getPropertyValue('--local-tip-bg'),'rgb(21, 25, 34)');
    w.dispatchEvent(new w.Event('scroll'));assert(portal.hidden);assert.equal(source.style.visibility,'');
  }finally{w.close();}
});
test('canvas charts use public tooltip actions to select the nearest bubble and follow the finger', () => {
  const f=fixture(),actions=[],dom=f.window.document.querySelector('#chart');
  dom.getBoundingClientRect=()=>({left:0,top:0,width:390,height:400});
  const instance={getOption:()=>({tooltip:[{show:true}],series:[{type:'scatter',data:[[50,80],[150,80]]}]}),getWidth:()=>390,getHeight:()=>400,containPixel:()=>true,convertToPixel:(_,value)=>value,dispatchAction:action=>actions.push(action)};
  f.window.echarts={getInstanceByDom:()=>instance};
  try{
    f.touch('pointerdown');
    const e=new f.window.Event('pointermove',{bubbles:true});Object.assign(e,{pointerType:'touch',pointerId:1,clientX:150,clientY:80});f.hit.dispatchEvent(e);
    const show=actions.filter(a=>a.type==='showTip');assert.equal(show[0].dataIndex,0);assert.equal(show.at(-1).dataIndex,1);assert.deepEqual(Array.from(show.at(-1).position),[150,80]);
    f.window.dispatchEvent(new f.window.Event('scroll'));assert(actions.some(a=>a.type==='hideTip'));
  }finally{f.close();}
});
test('canvas tooltip interaction preserves a component with tooltips explicitly disabled', () => {
  const f=fixture(),actions=[],dom=f.window.document.querySelector('#chart');dom.getBoundingClientRect=()=>({left:0,top:0,width:390,height:400});
  f.window.echarts={getInstanceByDom:()=>({getOption:()=>({tooltip:[{show:false}]}),dispatchAction:a=>actions.push(a)})};
  try{f.touch('pointerdown');f.touch('pointerup');assert(!actions.some(a=>a.type==='showTip'));}finally{f.close();}
});


test('ECharts repaint cannot reveal a second tooltip behind the touch portal', async () => {
  const dom = new JSDOM('<div id="chart"><canvas></canvas><div class="generic-canvas-tooltip" style="opacity:1;background:rgb(32,39,51)">NVDA</div></div>', {runScripts:'outside-only'});
  const w=dom.window, chart=w.document.querySelector('#chart'), tip=w.document.querySelector('.generic-canvas-tooltip'), canvas=w.document.querySelector('canvas');
  const instance={getWidth:()=>320,getHeight:()=>300,getOption:()=>({tooltip:[{}],series:[{type:'scatter',data:[[1,2]]}]}),containPixel:()=>true,convertToPixel:()=>[30,50],dispatchAction:a=>{if(a.type==='showTip')tip.style.visibility='visible';}};
  w.echarts={getInstanceByDom:()=>instance};
  Object.defineProperties(tip,{offsetWidth:{value:180},offsetHeight:{value:90}});
  chart.getBoundingClientRect=()=>({left:0,top:0,width:320,height:300});
  try {
    w.eval(runtime);
    const event=new w.Event('pointerdown',{bubbles:true});Object.assign(event,{pointerType:'touch',pointerId:1,clientX:30,clientY:50});canvas.dispatchEvent(event);
    await new Promise(r=>setTimeout(r,0));
    assert.equal(tip.style.visibility,'hidden');
    assert.equal(w.document.querySelectorAll('.generic-local-tooltip-portal:not([hidden])').length,1);
    tip.style.visibility='visible';await new Promise(r=>setTimeout(r,0));
    assert.equal(tip.style.visibility,'hidden');
    w.dispatchEvent(new w.Event('scroll'));
    assert(w.document.querySelector('.generic-local-tooltip-portal').hidden);
  } finally {w.close();}
});
