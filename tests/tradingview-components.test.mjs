import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const documents=JSON.parse(execFileSync('python3',['-c',`
import importlib.util,json
from pathlib import Path
path=Path('app/skills/trading-view-chart/scripts/trading_view_chart.py')
spec=importlib.util.spec_from_file_location('tv',path);tv=importlib.util.module_from_spec(spec);spec.loader.exec_module(tv)
print(json.dumps({key:tv.render(key,tv.build_config(key,language='zh-CN'),key,560,'zh-CN') for key,value in tv.CATALOG.items() if value.get('format')=='web-component'}))
`],{cwd:root,encoding:'utf8'}));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const [widget,source] of Object.entries(documents)){
 test(`${widget} uses its official tag and follows dark/light theme`,async()=>{
  const dom=new JSDOM(source,{url:'https://example.com/widget.html?theme=dark',runScripts:'dangerously',beforeParse(w){w.ResizeObserver=class{observe(){}};w.setTimeout=()=>1;w.clearTimeout=()=>{};}});
  const d=dom.window.document,spec=JSON.parse(d.querySelector('#tv-config').textContent);
  let element=d.querySelector(spec.tag),script=d.querySelector('#mount script');
  assert.ok(element);assert.equal(element.getAttribute('theme'),'dark');
  assert.equal(element.style.colorScheme,'dark');
  if(spec.module){assert.equal(script.type,'module');assert.match(script.src,/\/w\/zh_CN\/tv-/);}
  else{assert.equal(script.type,'');assert.equal(element.getAttribute('broker'),'easymarkets');}
  if(widget==='forex-table')assert.match(element.getAttribute('currencies'),/^EUR,USD,JPY/);
  if(widget==='economic-map')assert.equal(element.getAttribute('metric'),'gdp');
  dom.window.customElements.define(spec.tag,class extends dom.window.HTMLElement{});
  script.onload();await tick();assert.equal(d.querySelector('#state').hidden,true);
  d.documentElement.dataset.theme='light';await tick();
  const light=d.querySelector(spec.tag);
  assert.notEqual(element,light);assert.equal(light.getAttribute('theme'),'light');assert.equal(light.style.colorScheme,'light');
  dom.window.close();
 });
}
