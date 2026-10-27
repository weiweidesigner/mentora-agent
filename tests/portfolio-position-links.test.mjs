import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('../app/static/portfolio.js',import.meta.url),'utf8');
test('position assets link to TradingView with market-aware symbols and safe new-tab navigation',async()=>{
 const dom=new JSDOM('<main class="shell"><button id="railHome"></button><button id="railWidgets"></button><button id="navWidgets"></button><section id="taskWorkspace"></section><section id="widgetWorkspace"></section></main>',{url:'https://example.com/mentora/?tab=portfolio&portfolioView=positions',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.setInterval=()=>1;w.clearInterval=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const symbols={'0700.HK':'HKEX:700','DOW':'DOW','NTES':'NTES','600519.SH':'SSE:600519','000001.SZ':'SZSE:000001','430047.BJ':'BSE:430047','BRK.B':'BRK.B','AAPL" onclick="evil':'AAPL" onclick="evil'};
 const positions=Object.keys(symbols).map(symbol=>({symbol,quantity:10,availableToSell:10,averageCost:100,marketValue:1000,unrealized:0,quote:{price:100,name:'<img src=x onerror=alert(1)>'}}));
 const account={initial:10000,equity:10000,cash:2000,marketValue:8000,positions,trades:[],plans:[],history:[],settings:{},valuationComplete:true,scan:{}};
 w.fetch=async url=>({ok:true,json:async()=>url.endsWith('/workflow')?{watchlist:[],preferences:{},strategies:{}}:url.endsWith('/opportunities')?{items:[]}:account});
 try{
  w.eval(source);await new Promise(resolve=>setTimeout(resolve,30));const links=[...w.document.querySelectorAll('.pfPositionAsset a')];assert.equal(links.length,positions.length);
  links.forEach((link,index)=>{
   const symbol=positions[index].symbol,url=new URL(link.href);assert.equal(url.origin,'https://www.tradingview.com');assert.equal(url.pathname,'/chart/');assert.equal(url.searchParams.get('symbol'),symbols[symbol]);assert.equal(link.target,'_blank');assert.match(link.rel,/noopener/);assert.match(link.rel,/noreferrer/);assert.equal(link.hasAttribute('onclick'),false);
   assert(link.textContent.includes(symbol));assert.equal(link.querySelector('img'),null);assert(link.textContent.includes('<img src=x onerror=alert(1)>'));
  });
 }finally{w.close();}
});
