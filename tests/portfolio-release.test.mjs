import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('../app/static/portfolio.js',import.meta.url),'utf8');
test('trading and board refresh controls share their glyph and borderless style',()=>{
 const html=readFileSync(new URL('../app/static/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');
 const board=html.match(/<button id="widgetRefresh"[^>]*>(<svg[\s\S]*?<\/svg>)/)[1];
 const portfolio=source.match(/data-pf-action="refresh" class="pageRefreshButton"[^>]*>(<svg[\s\S]*?<\/svg>)/)[1];
 assert.equal(portfolio,board);
 assert.match(css,/\.widgetWorkspace \.pageRefreshButton,\.portfolioWorkspace \.pageRefreshButton/);
 assert.match(css,/border:0;border-radius:4px;background:transparent;padding:4px 0/);
});
test('deployed trading UI preserves the latest navigation and strategy save scopes',async()=>{
  const dom=new JSDOM('<main class="shell"><button id="railHome"></button><button id="railWidgets"></button><button id="navWidgets"></button><section id="taskWorkspace"></section><section id="widgetWorkspace"></section></main>',{url:'https://example.com/mentora/?tab=portfolio',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  const workflow={strategies:{enabled:['trend','custom-1'],customStrategies:[{id:'custom-1',name:'测试策略',description:'测试',code:'def signal(context):\n    return "hold"'}]},preferences:{},tasks:[],decisions:[]};
  const account={initial:1000,cash:1000,equity:1000,marketValue:0,positions:[],trades:[],plans:[],history:[],settings:{},valuationComplete:true,scan:{},serverTime:'2026-10-23T09:00:00Z'};
  w.setInterval=()=>1;w.clearInterval=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const calls=[];
  w.fetch=async(url,opts)=>{calls.push([url,opts]);return{ok:true,json:async()=>url.endsWith('/workflow')?workflow:url.endsWith('/opportunities')?{items:[]}:account};};
  try{
    w.eval(source);
    await new Promise(resolve=>setTimeout(resolve,30));
    const d=w.document;
    assert.deepEqual([...d.querySelectorAll('[data-pf-view]')].map(x=>x.textContent),['观察列表','持仓明细','收益情况','交易记录','策略配置','个人信息']);
    assert.equal(d.querySelector('[data-pf-view=decisions]'),null);
    d.querySelector('[data-pf-view=strategies]').click();
    const savePlan=d.querySelector('.pfCardHead button[form=pfStrategyForm]');
    assert.equal(savePlan,null);
    const saveCustom=d.querySelector('[data-pf-strategy=save-custom]');
    assert.equal(saveCustom,null);
    assert.equal(d.querySelector('textarea[name=customCode]'),null);
    assert.equal(d.querySelector('[data-pf-strategy=add]').nextElementSibling.textContent,'删除策略');
    d.querySelector('[data-pf-strategy=show-code]').click();
    assert.equal(d.querySelector('textarea[name=customCode]').getAttribute('aria-label'),'策略编辑器');
    assert.doesNotMatch(d.querySelector('#pfPanel').textContent,/新策略尚未保存|修改将在保存后生效|全部策略已保存/);
    d.querySelector('[data-pf-view=profile]').click();
    assert.ok(d.querySelector('#pfProfileForm'));
    assert.ok(d.querySelector('input[name=confidenceThresholdPct]'));
    assert.ok(d.querySelector('[data-pf-avatar]'));
    assert.equal(calls.some(([url,opts])=>/\/(order|execute|plans)(\/|$)/.test(url)&&opts?.method==='POST'),false);
  }finally{w.close();}
});
