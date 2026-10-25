import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../app/skills/business-chart-recall/scripts/kline.py',import.meta.url),'utf8');
function fn(name){const start=source.indexOf('  function '+name+'(');const rest=source.slice(start+1),next=rest.search(/\n  function /);return source.slice(start,next<0?undefined:start+1+next);}
const points=[{time:1,price:109},{time:2,price:91},{time:3,price:108},{time:4,price:92},{time:5,price:110}];
function run(raw,rows=points.map(p=>({time:p.time}))){
 const operations=[],ctx=new Proxy({},{get:(_t,key)=>(...args)=>operations.push([key,...args]),set:()=>true});
 const state={all:rows,main:{x:0,y:0,w:100,h:100},xOf:i=>i*10,priceScale:{y:v=>120-v}};
 const context={window:{innerWidth:1200},normTime:Number,activePeriod:'1d',config:{dataType:'1d'},annotations:[raw],selectedAnnotationId:null,annotationDraft:null,annotationPointer:null,ctx,
 horizontalAnnotationLabelLayout:()=>new Map(),annotationBubbleLayout:()=>new Map(),annotationColor:()=> '#38bdf8',annotationPointPixel:()=>({x:0,y:0})};
 vm.createContext(context);vm.runInContext(fn('normalizeAnnotation')+'\n'+fn('drawAnnotationLayer'),context);
 context.annotations=[context.normalizeAnnotation(raw)].filter(Boolean);context.drawAnnotationLayer(state);
 return{operations,normalized:context.annotations[0]};
}
test('W polyline preserves five anchors and draws all four real segments',()=>{
 const value=run({type:'polyline',period:'1d',points,source:'jev-kline-plan'});
 assert.equal(value.normalized.points.length,5);assert.equal(value.normalized.source,'model');
 assert.equal(value.operations.filter(v=>v[0]==='lineTo').length,4);
 assert.deepEqual(value.operations.filter(v=>v[0]==='lineTo').at(-1),['lineTo',40,10]);
});
test('a missing exact candle rejects the whole path instead of snapping its anchor',()=>{
 const value=run({type:'path',period:'1d',points},[{time:1},{time:2},{time:4},{time:5}]);
 assert.equal(value.operations.filter(v=>v[0]==='stroke').length,0);
});
test('period binding hides the path on another tab and invalid anchors are not dropped',()=>{
 assert.equal(run({type:'polyline',period:'1w',points}).operations.filter(v=>v[0]==='stroke').length,0);
 assert.equal(run({type:'polyline',period:'1d',points:[...points,{time:'invalid',price:2}]}).normalized,undefined);
});

test('initial annotation fit includes the whole shape and leaves later zoom untouched',()=>{
 const list=Array.from({length:100},(_,time)=>({time})),c={config:{fitAnnotations:true,dataType:'1d'},activePeriod:'1d',annotations:[{period:'1d',type:'polyline',points:[{time:10},{time:50},{time:90}]},{period:'1d',type:'callout',points:[{time:95}]}],normTime:Number,visibleCount:null,viewEnd:null,autoVisibleCount:()=>34,clampVisibleCount:(n,rows)=>Math.min(n,rows.length)};
 vm.createContext(c);vm.runInContext(fn('visibleSlice'),c);
 const initial=c.visibleSlice(list,{});assert(initial.start<=10);assert(initial.end>=95);
 c.visibleCount=20;c.viewEnd=60;const manual=c.visibleSlice(list,{});assert.equal(manual.start,41);assert.equal(manual.end,60);
});
