import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function activitySourceItems('),source.indexOf('\nfunction buildResultActions('));
function render(items){
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
 w.isPublicEvidenceUrl=url=>/^https:\/\//.test(url);w.domainFromUrl=url=>new URL(url).hostname;
 w.escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 w.copyFor=()=> '来源';w.sourceLogoSrc=()=> '/logo.svg';w.sourceImageFallbackAttribute=()=> '';
 w.eval(code);const html=w.buildActivitySources({activitySources:items},'zh-CN');dom.window.close();return new JSDOM(html).window.document;
}
test('bare finance and focus navigation links are omitted and source counts stay correct',()=>{
 const doc=render([{siteName:'财经',title:'财经',summary:'- 财经',url:'https://news.example.com/finance/'},{siteName:'焦点',title:'焦点',summary:'- 焦点',url:'https://news.example.com/focus/'},{siteName:'News',title:'Company reports earnings',summary:'Revenue increased.',url:'https://news.example.com/articles/1'}]);
 assert.equal(doc.querySelectorAll('.activitySourceCard').length,1);assert.equal(doc.querySelector('.activitySourcesTitle').textContent,'来源 · 1');
 assert.equal(doc.querySelector('.activitySourceSummary').textContent,'Revenue increased.');
});
test('repeated title is not used as both publisher and summary',()=>{
 const doc=render([{siteName:'AMD Q3 results',title:'AMD Q3 results',summary:'- AMD Q3 results',url:'https://ir.amd.com/news/123'}]);
 assert.equal(doc.querySelector('.activitySourceBrand span').textContent,'ir.amd.com');
 assert.equal(doc.querySelector('.activitySourceTitle').textContent,'AMD Q3 results');assert.equal(doc.querySelector('.activitySourceSummary'),null);
});
test('generic headline with substantive evidence remains and markup is escaped',()=>{
 const doc=render([{siteName:'News',title:'财经',summary:'<Revenue> grew 20%.',url:'https://news.example.com/story/1'}]);
 assert.equal(doc.querySelectorAll('.activitySourceCard').length,1);assert.equal(doc.querySelector('.activitySourceSummary').textContent,'<Revenue> grew 20%.');assert.equal(doc.querySelector('revenue'),null);
});
