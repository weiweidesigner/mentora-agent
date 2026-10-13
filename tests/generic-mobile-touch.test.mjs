import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const saved = readFileSync(new URL('../app/static/cases/presidents-sp500/deepseek-case-presidents-sp500-grouped-bar.html', import.meta.url), 'utf8');
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
