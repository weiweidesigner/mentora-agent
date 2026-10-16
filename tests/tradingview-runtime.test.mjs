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

test('every cached TradingView type sends the host theme and keeps transparent frames on its surface',async()=>{
  const catalog=JSON.parse(readFileSync(new URL('../app/static/cases/inspiration/manifest.json',import.meta.url),'utf8'));
  const widgets=new Set();
  let count=0;
  for(const row of catalog.cases.filter(row=>row.tool==='TradingViewChart')) {
    const cached=JSON.parse(readFileSync(new URL('../app'+row.conversationUrl,import.meta.url),'utf8'));
    const source=readFileSync(new URL('../app'+cached.answer.reportArtifacts[0].url,import.meta.url),'utf8');
    const name=row.id;
    for(const theme of ['dark','light']) {
      const dom=new JSDOM(source,{
        url:`https://example.com/chart.html?theme=${theme}`,runScripts:'dangerously',
        beforeParse(w){w.ResizeObserver=class{observe(){}};w.setTimeout=()=>1;w.clearTimeout=()=>{};},
      });
      await new Promise(resolve=>setImmediate(resolve));
      const d=dom.window.document;
      const spec=JSON.parse(d.querySelector('#tv-config').textContent);
      widgets.add(spec.widget);
      const cfg=JSON.parse(d.querySelector('#mount script').textContent);
      assert.equal(cfg.colorTheme||cfg.theme,theme,name);
      if(spec.format==='web-component'){assert.equal(d.querySelector(spec.tag).getAttribute('theme'),theme);dom.window.close();continue;}
      const iframe=d.createElement('iframe');d.querySelector('#mount').append(iframe);
      assert.equal(dom.window.getComputedStyle(iframe).colorScheme,'normal',name+' must not inherit dark color-scheme');
      d.documentElement.dataset.theme=theme==='dark'?'light':'dark';
      await new Promise(resolve=>setImmediate(resolve));
      const changed=JSON.parse(d.querySelector('#mount script').textContent);
      assert.equal(changed.colorTheme||changed.theme,theme==='dark'?'light':'dark',name+' follows toggles');
      dom.window.close();
    }
    count++;
  }
  assert.equal(widgets.size,30);assert.equal(count,30);
});
