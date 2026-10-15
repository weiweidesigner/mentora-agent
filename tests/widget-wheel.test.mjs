import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
const root=new URL('../',import.meta.url).pathname;
function render(widget,canvas){
 const config={symbol:'NASDAQ:AAPL',disabled_features:['header_screenshot'],enabled_features:['mouse_wheel_scale','study_templates']};
 const source=`<html><head></head><body><script id="tv-config" type="application/json">${JSON.stringify({widget,config})}</script><script>window.captured=JSON.parse(document.getElementById('tv-config').textContent)</script></body></html>`;
 const upgraded=execFileSync('python3',['-c','import sys;from app.artifact_upgrades import upgrade_widget_tradingview;print(upgrade_widget_tradingview(sys.stdin.read()))'],{cwd:root,input:source,encoding:'utf8'});
 const dom=new JSDOM(upgraded,{url:'https://example.test/share-artifact/chart.html'+(canvas?'?canvas=1':''),runScripts:'dangerously'});
 const actual=JSON.parse(JSON.stringify(dom.window.captured.config));dom.window.close();return {actual,config};
}
test('dashboard TradingView chart disables wheel scaling and horizontal scrolling before bootstrap',()=>{
 const {actual}=render('advanced-chart',true);assert.deepEqual(actual.disabled_features,['header_screenshot','mouse_wheel_scale','mouse_wheel_scroll']);assert.deepEqual(actual.enabled_features,['study_templates']);assert.equal(actual.symbol,'NASDAQ:AAPL');
});
test('standalone charts and scrolling market tables keep their own interaction settings',()=>{
 for(const [widget,canvas] of [['advanced-chart',false],['screener',true]]){const {actual,config}=render(widget,canvas);assert.deepEqual(actual,config);}
});
