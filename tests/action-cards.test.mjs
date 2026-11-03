import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {styleNavigationCards} from '../frontend/action-card-policy.mjs';
const css=readFileSync(new URL('../app/static/action-cards.css',import.meta.url),'utf8');
const entry='<a class="entry" href="https://www.ainvest.com/market/calendar/earnings/" target="_blank" rel="noopener noreferrer"><svg class="icon"></svg><span class="name">财报日历</span><svg class="arrow"><path d="m9 5 7 7-7 7"/></svg></a>';

test('saved web entry adopts the shared presentation without changing navigation or its arrow',()=>{
 const dom=new JSDOM(entry);try{
  const d=dom.window.document,a=d.querySelector('a'),before=[a.href,a.target,a.rel],arrow=a.querySelector('.arrow');
  assert.equal(styleNavigationCards(d,css),true);assert(a.classList.contains('mentoraNavigationCard'));
  assert.deepEqual([a.href,a.target,a.rel],before);assert.equal(d.querySelector('.mentoraActionDirection svg'),arrow);
  assert.equal(d.querySelector('[data-mentora-action-cards]').textContent,css);
  styleNavigationCards(d,css+'\n/* upgraded */');
  assert.equal(d.querySelectorAll('.mentoraActionDirection').length,1);assert.equal(d.querySelectorAll('[data-mentora-action-cards]').length,1);
  assert.match(d.querySelector('[data-mentora-action-cards]').textContent,/upgraded/);
 }finally{dom.window.close();}
});
test('existing app buttons preserve feature binding and click handlers',()=>{
 const dom=new JSDOM('<button class="entry" data-ainvest-feature="market.overview"><span class="entry-name">市场</span><svg class="entry-arrow"></svg></button>');try{
  const button=dom.window.document.querySelector('button');let clicks=0;button.addEventListener('click',()=>clicks++);
  assert(styleNavigationCards(dom.window.document,css));button.click();assert.equal(clicks,1);assert.equal(button.dataset.ainvestFeature,'market.overview');
 }finally{dom.window.close();}
});
test('ordinary report links and unsafe entry URLs do not become navigation cards',()=>{
 for(const html of ['<a href="https://www.ainvest.com/">来源</a>','<a class="entry" href="javascript:alert(1)">链接</a>','<a class="entry" href="https://ainvest.com.evil.test/">链接</a>','<button class="entry">执行</button>']){
  const dom=new JSDOM(html);try{assert.equal(styleNavigationCards(dom.window.document,css),false);assert.equal(dom.window.document.querySelector('[data-mentora-action-cards]'),null);}finally{dom.window.close();}
 }
});

test('explicit generic navigation cards use the shared component without touching article links',()=>{
 const dom=new JSDOM('<a data-action-card="navigation" href="/settings">设置</a><a class="entry" href="https://example.org/article">普通文章</a>',{url:'https://example.org/mentora/'});
 try{const d=dom.window.document;styleNavigationCards(d,css);
 assert.equal(d.querySelector('[data-action-card]').classList.contains('mentoraNavigationCard'),true);
 assert.equal(d.querySelectorAll('.mentoraActionDirection').length,1);
 assert.equal(d.querySelector('a.entry').classList.contains('mentoraNavigationCard'),false);
 styleNavigationCards(d,css);assert.equal(d.querySelectorAll('.mentoraActionDirection').length,1);
 }finally{dom.window.close();}
});
