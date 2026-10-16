import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const runtime=readFileSync(new URL('../app/static/tradingview-surface.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
function setup(widget='single-ticker',format){
 const dom=new JSDOM('<iframe></iframe>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,frame=w.document.querySelector('iframe'),doc=frame.contentDocument;
 doc.head.innerHTML='<style data-tv-host-footer>.tradingview-widget-container>iframe{height:100%!important}</style>';
 doc.body.innerHTML=`<main><header>Extra title</header><div class="stage"><div id="mount"><div class="tradingview-widget-container">${format?'<tv-broker-rating style="height:100%"></tv-broker-rating>':'<iframe style="height:69px"></iframe>'}</div></div><div id="state" hidden>Loading</div></div><footer>Extra footer</footer></main><script id="tv-config" type="application/json">${JSON.stringify({widget,format,tag:format?'tv-broker-rating':undefined})}</script>`;
 let height=69;
 doc.querySelector('main').getBoundingClientRect=()=>({height});
 doc.querySelector('#mount iframe,tv-broker-rating').getBoundingClientRect=()=>({height});
 frame.getBoundingClientRect=()=>({height:parseFloat(frame.style.height)||560});
 w.eval(runtime);
 return {dom,w,frame,doc,setHeight:value=>height=value};
}
test('native quote removes host chrome and shrinks and grows with provider dimensions',async()=>{
 const h=setup();
 assert(h.w.installTradingViewSurface(h.frame));
 assert.equal(h.frame.style.height,'69px');
 assert.equal(h.doc.documentElement.dataset.tvIntrinsic,'true');
 assert.doesNotMatch(h.doc.querySelector('[data-tv-host-footer]').textContent,/height:100%/);
 assert.equal(h.w.installTradingViewSurface(h.frame),true,'reinstallation is supported');
 h.setHeight(110);h.doc.querySelector('#mount iframe').style.height='110px';await tick();
 assert.equal(h.frame.style.height,'110px');
 h.setHeight(46);h.doc.querySelector('#mount iframe').style.height='46px';await tick();
 assert.equal(h.frame.style.height,'46px');
 const style=h.doc.querySelector('[data-tv-surface]').textContent;
 assert.match(style,/border:0!important/);assert.match(style,/main>header.*display:none!important/);
 h.frame.tradingViewSurfaceCleanup();h.dom.window.close();
});
test('content web components use intrinsic height and notify the canvas',()=>{
 const h=setup('broker-rating','web-component'),updates=[];
 h.w.installTradingViewSurface(h.frame,(...args)=>updates.push(args));
 assert.equal(updates[0][0],69);assert.equal(updates[0][1],true);
 assert.match(h.doc.querySelector('[data-tv-surface]').textContent,/#mount tv-broker-rating\{height:auto!important/);
 h.frame.tradingViewSurfaceCleanup();h.dom.window.close();
});
test('interactive charts preserve a sized viewport and non-TradingView charts are untouched',()=>{
 const h=setup('advanced-chart');const updates=[];
 h.w.installTradingViewSurface(h.frame,(...args)=>updates.push(args));
 assert.equal(h.doc.documentElement.hasAttribute('data-tv-intrinsic'),false);
 assert.equal(updates[0][1],false);
 h.frame.tradingViewSurfaceCleanup();h.doc.querySelector('#tv-config').remove();
 assert.equal(h.w.installTradingViewSurface(h.frame),false);
 h.dom.window.close();
});
