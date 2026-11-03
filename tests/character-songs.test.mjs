import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/character-songs.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,15));
function setup(recipients=[{id:"recipient",label:"QQ 私聊 1"}]){
 const dom=new JSDOM('<main id="characterWorkspace"><section class="chStickerSection"></section></main>',{url:'https://example.com/mentora/?tab=character',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 let data={learned:[{id:'twinkle',title:'小星星',seconds:20,state:'ready'}],practicing:[],online:true,recipients},calls=[];
 w.fetch=async(path,options={})=>{calls.push({path,options});let body=data;
  if(path.endsWith('/preview'))body={state:'ready'};
  else if(path.includes('/upload?')){const id='job'+data.practicing.length;body={id:'learn-'+id,jobId:id,title:new URL(path,'https://example.com').searchParams.get('filename'),state:'uploaded',notification:'none'};data.practicing.push(body);}
  else if(path.endsWith('/practice')){body=data.practicing.find(x=>path.includes('/'+x.jobId+'/'));body.state='queued';}
  return {ok:true,json:async()=>JSON.parse(JSON.stringify(body))};
 };
 w.eval(source);return{w,dom,calls,get data(){return data;}};
}
test('upload opens the file picker directly, accepts multiple files, and keeps explicit row practice',async()=>{
 const e=setup(),$=id=>e.w.document.getElementById(id);try{
 await tick();assert.equal($('chSongLearnedCount').textContent,'1');assert.equal($('chSongNotify'),null);assert.equal($('chSongUploadForm'),null);assert.equal($('chSongTitle'),null);assert.equal($('chSongStart'),null);
 let picked=0;$('chSongFile').addEventListener('click',event=>{event.preventDefault();picked++;});$('chSongUploadToggle').click();assert.equal(picked,1);assert.equal($('chSongFile').multiple,true);
 const files=[new e.w.File(['ID3data'],'新歌.mp3',{type:'audio/mpeg'}),new e.w.File(['ID3data'],'<img src=x>.mp3',{type:'audio/mpeg'})];Object.defineProperty($('chSongFile'),'files',{value:files});$('chSongFile').dispatchEvent(new e.w.Event('change'));await tick();
 assert.equal($('chSongPracticingPanel').hidden,false);assert.equal($('chSongPracticingCount').textContent,'2');assert.equal(e.calls.filter(c=>c.path.includes('/upload?')).length,2);
 assert.equal(e.calls.filter(c=>c.path.endsWith('/practice')).length,0);assert.equal($('chSongPracticingPanel').querySelector('img'),null);
 e.w.document.querySelector('[data-song-practice]').click();await tick();
 const practice=e.calls.find(c=>c.path.endsWith('/practice'));assert.deepEqual(JSON.parse(practice.options.body),{notify:true,recipientId:'recipient'});
 assert.equal($('chSongPracticingPanel').querySelector('[data-song-practice]').disabled,true);
 const song=e.data.practicing.shift();e.data.learned.push({...song,state:'ready',seconds:7.5});$('characterWorkspace').hidden=true;$('characterWorkspace').hidden=false;await tick();
 assert.equal($('chSongLearnedCount').textContent,'2');assert.equal($('chSongPracticingCount').textContent,'1');assert.match($('chSongStatus').textContent,/练好啦/);
 $('chSongTabPracticing').dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal($('chSongTabLearned').getAttribute('aria-selected'),'true');
 }finally{e.dom.window.close();}
});
test('invalid files do not prevent valid files in the same selection from uploading',async()=>{
 const e=setup(),$=id=>e.w.document.getElementById(id);try{await tick();
 Object.defineProperty($('chSongFile'),'files',{value:[new e.w.File(['data'],'bad.txt'),new e.w.File(['ID3data'],'good.mp3')]});$('chSongFile').dispatchEvent(new e.w.Event('change'));await tick();
 assert.equal(e.calls.filter(c=>c.path.includes('/upload?')).length,1);assert.match($('chSongStatus').textContent,/bad.txt/);assert.equal($('chSongPracticingCount').textContent,'1');
 }finally{e.dom.window.close();}
});
test('practice rows have no selection controls and show the completion promise while practicing',async()=>{
 const e=setup(),$=id=>e.w.document.getElementById(id);try{await tick();
 Object.defineProperty($('chSongFile'),'files',{value:[new e.w.File(['ID3data'],'a.mp3')]});$('chSongFile').dispatchEvent(new e.w.Event('change'));await tick();
 assert.equal($('chSongSelectAll'),null);assert.equal($('chSongPracticeSelected'),null);assert.equal($('chSongPracticingPanel').querySelector('input[type=checkbox]'),null);
 e.data.practicing[0].state='practicing';$('characterWorkspace').hidden=true;$('characterWorkspace').hidden=false;await tick();
 assert.match($('chSongPracticingPanel').textContent,/正在练习，练会后，我会主动唱给你～/);
 assert.equal($('chSongPracticingPanel').querySelector('[data-song-practice]').textContent,'正在练习');
 }finally{e.dom.window.close();}
});
test('multiple QQ recipients require an explicit choice before practice',async()=>{
 const e=setup([{id:'a',label:'私聊1'},{id:'b',label:'私聊2'}]),$=id=>e.w.document.getElementById(id);try{await tick();
 Object.defineProperty($('chSongFile'),'files',{value:[new e.w.File(['ID3data'],'a.mp3')]});$('chSongFile').dispatchEvent(new e.w.Event('change'));await tick();
 e.w.document.querySelector('[data-song-practice]').click();await tick();assert.equal(e.calls.filter(c=>c.path.endsWith('/practice')).length,0);assert.match($('chSongStatus').textContent,/请选择/);
 $('chSongRecipient').value='b';e.w.document.querySelector('[data-song-practice]').click();await tick();assert.equal(JSON.parse(e.calls.find(c=>c.path.endsWith('/practice')).options.body).recipientId,'b');
 }finally{e.dom.window.close();}
});

test('preview waits for preparation, formats two decimals and then loads real audio in the deployment prefix',async()=>{
 const e=setup(),$=id=>e.w.document.getElementById(id);try{await tick();
 e.data.learned[0].seconds=173.973333333;$('characterWorkspace').hidden=true;$('characterWorkspace').hidden=false;await tick();
 assert.match($('chSongLearnedPanel').textContent,/173\.97 秒/);assert.doesNotMatch($('chSongLearnedPanel').textContent,/173\.973/);
 const fetch=e.w.fetch;let resolve;let played=0;e.w.HTMLMediaElement.prototype.play=async()=>{played++;};
 e.w.fetch=async(path,options)=>path.endsWith('/preview')&&options?.method==='POST'?new Promise(r=>{resolve=r;}):fetch(path,options);
 e.w.document.querySelector('[data-song-preview]').click();assert.equal($('chSongLearnedPanel').querySelector('audio'),null);assert.equal(e.w.document.querySelector('[data-song-preview]').disabled,true);
 resolve({ok:true,json:async()=>({state:'ready'})});await tick();
 const audio=$('chSongLearnedPanel').querySelector('audio');assert.ok(audio);assert.equal(audio.preload,'metadata');assert.equal(audio.src,'https://example.com/mentora/api/character/songs/twinkle/preview');assert.equal(played,1);
 }finally{e.dom.window.close();}
});
test('failed preview preparation has a retryable message instead of an empty audio player',async()=>{
 const e=setup();try{await tick();e.w.fetch=async()=>({ok:true,json:async()=>({state:'failed',error:'试听音频准备未完成，请点击试听重试'})});
 e.w.document.querySelector('[data-song-preview]').click();await tick();assert.equal(e.w.document.querySelector('audio'),null);assert.match(e.w.document.getElementById('chSongStatus').textContent,/重试/);assert.equal(e.w.document.querySelector('[data-song-preview]').disabled,false);
 const css=readFileSync(new URL('../app/static/character.css',import.meta.url),'utf8');assert.match(css,/:root\[data-theme="dark"\] \.chSongRow audio\{color-scheme:dark\}/);
 }finally{e.dom.window.close();}
});
