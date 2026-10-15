import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../app/static/widget-symbol-picker.js',import.meta.url),'utf8');
const rows=[{symbol:'HKEX:700',code:'700',name:'腾讯控股',market:'hk'},{symbol:'HKEX:80700',code:'80700',name:'腾讯控股-R',market:'hk'}];
function setup(){const dom=new JSDOM('<dialog open><form><label id="field"><span>关注标的</span><input></label><button type="submit">添加</button></form></dialog>',{url:'https://example.com',runScripts:'outside-only'});const w=dom.window;let calls=[];w.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>({results:rows})}};w.eval(source);const picker=new w.WidgetSymbolPicker(w.document.querySelector('form'),w.document.querySelector('input'),w.document.querySelector('#field'));return{dom,w,picker,calls};}
test('market-aware names show disambiguated choices and resolve selected padded HK code',async()=>{
 const h=setup(),p=h.picker;p.configure(true,false);p.select.value='hk';p.input.value='腾讯';await p.suggest();
 assert.match(h.calls[0],/market=hk/);assert.equal(p.list.children.length,2);assert.match(p.list.textContent,/00700/);
 await assert.rejects(()=>p.resolve(),/多个/);
 p.input.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));p.input.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 assert.equal(p.input.value,'腾讯控股');assert.equal(await p.resolve(),'HKEX:700');
 p.configure(false,false);assert.equal(p.marketField.hidden,true);assert.equal(p.input.hasAttribute('role'),false);h.dom.window.close();
});
test('multi-symbol names, scope switching, and query failures never guess a listing',async()=>{
 const h=setup(),p=h.picker;p.configure(true,true);p.select.value='hk';p.input.value='腾讯控股、HKEX:9988';
 assert.equal(await p.resolve(),'HKEX:700、HKEX:9988');
 h.w.fetch=async()=>({ok:true,json:async()=>({results:[]})});p.input.value='未知名称';await assert.rejects(()=>p.resolve(),/未找到/);
 h.w.fetch=async()=>{throw Error('查询不可用')};await p.suggest();assert.match(p.status.textContent,/查询不可用/);assert.equal(p.list.hidden,true);h.dom.window.close();
});
