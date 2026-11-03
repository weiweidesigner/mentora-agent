import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {FilePreviewCard,NavigationCard} from '../frontend/action-card-components.mjs';

test('file component separates preview from download and escapes user-provided names',()=>{
 const dom=new JSDOM(FilePreviewCard({name:'<img src=x>.html',type:'HTML',download:'/api/files/1/download'}));
 try{const d=dom.window.document;assert.equal(d.querySelector('img'),null);assert.equal(d.querySelector('.generatedFileName').textContent,'<img src=x>.html');assert.equal(d.querySelectorAll('button').length,1);assert.equal(d.querySelectorAll('a[download]').length,1);assert.equal(d.querySelector('.mentoraActionDirection'),null);}finally{dom.window.close();}
});
test('navigation component supports a generic web destination or an application action',()=>{
 const dom=new JSDOM('',{url:'https://example.org/mentora/'}),d=dom.window.document;
 try{const link=NavigationCard({label:'<Settings>',href:'/settings'},d);assert.equal(link.href,'https://example.org/settings');assert.equal(link.querySelector('.entry-name').textContent,'<Settings>');assert.equal(link.querySelectorAll('.mentoraActionDirection').length,1);assert.equal(link.hasAttribute('download'),false);
 let clicks=0;const button=NavigationCard({label:'行情',feature:'quote.aapl',onNavigate:()=>clicks++},d);button.click();assert.equal(clicks,1);assert.equal(button.dataset.ainvestFeature,'quote.aapl');assert.equal(button.tagName,'BUTTON');
 }finally{dom.window.close();}
});
test('both components reject executable links and credentials',()=>{
 const dom=new JSDOM('',{url:'https://example.org/'});
 try{for(const url of ['javascript:alert(1)','data:text/html,hello','https://user:password@example.org/']){assert.throws(()=>NavigationCard({label:'x',href:url},dom.window.document));assert.throws(()=>FilePreviewCard({name:'x',type:'HTML',download:url}));}}finally{dom.window.close();}
});
