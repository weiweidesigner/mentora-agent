import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const html=readFileSync(new URL('../app/static/cases/inspiration/tradingview-market-data/deepseek-tradingview-chart.html',import.meta.url),'utf8');
test('cached advanced chart uses valid watchlist and ignores repeated host theme sync',async()=>{
  const dom=new JSDOM(html,{
    url:'https://example.com/chart.html?theme=dark',runScripts:'dangerously',
    beforeParse(window){window.ResizeObserver=class{observe(){}};window.setTimeout=()=>1;window.clearTimeout=()=>{};},
  });
  const {document}=dom.window;
  await new Promise(resolve=>setImmediate(resolve));
  const first=document.querySelector('#mount script');
  const config=JSON.parse(first.textContent);
  assert.deepEqual(config.watchlist,['NASDAQ:AAPL','NASDAQ:MSFT','NASDAQ:NVDA','NASDAQ:TSLA']);
  assert.equal(config.theme,'dark');
  document.documentElement.dataset.theme='dark';
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(document.querySelector('#mount script'),first,'same host theme must not destroy the active widget');
  document.documentElement.dataset.theme='light';
  await new Promise(resolve=>setImmediate(resolve));
  const next=document.querySelector('#mount script');
  assert.notEqual(next,first);
  assert.equal(JSON.parse(next.textContent).theme,'light');
  dom.window.close();
});
