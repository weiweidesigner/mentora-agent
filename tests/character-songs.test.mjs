import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../app/static/character-songs.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,15));
function setup(){
 const dom=new JSDOM('<main id="characterWorkspace"><section class="chStickerSection"></section></main>',{url:'https://example.com/mentora/?tab=character',runScripts:'outside-only'}),w=dom.window;
 let data={learned:[{id:'twinkle',title:'小星星',seconds:20,state:'ready'}],practicing:[],online:true,recipients:[{id:'recipient',label:'QQ 私聊 1'}]},calls=[];
 w.fetch=async(path,options={})=>{calls.push({path,options});let body=data;
  if(path.includes('/upload?')){data.practicing=[{id:'learn-job',jobId:'job',title:'<img src=x onerror=bad()>',state:'uploaded',notification:'none'}];body=data.practicing[0];}
  else if(path.endsWith('/practice')){data.practicing[0].state='queued';body=data.practicing[0];}
  return {ok:true,json:async()=>JSON.parse(JSON.stringify(body))};
 };
 w.eval(source);return{w,dom,calls,get data(){return data;}};
}
test('song tabs support keyboard, staged MP3 upload, explicit practice, and completed transition',async()=>{
 const e=setup(),$=id=>e.w.document.getElementById(id);try{
 await tick();assert.equal($('chSongLearnedCount').textContent,'1');assert.equal($('chSongNotify').checked,true);
 $('chSongUploadToggle').click();assert.equal($('chSongUploadForm').hidden,false);assert.equal($('chSongPracticingPanel').hidden,false);
 const file=new e.w.File(['ID3data'],'新歌.mp3',{type:'audio/mpeg'});Object.defineProperty($('chSongFile'),'files',{value:[file]});$('chSongFile').dispatchEvent(new e.w.Event('change'));
 assert.equal($('chSongTitle').value,'新歌');$('chSongUploadForm').dispatchEvent(new e.w.Event('submit',{cancelable:true}));await tick();
 assert.equal(e.calls.filter(c=>c.path.endsWith('/practice')).length,0);assert.equal($('chSongPracticingPanel').querySelector('img'),null);
 e.w.document.querySelector('[data-song-practice]').click();await tick();
 const practice=e.calls.find(c=>c.path.endsWith('/practice'));assert.deepEqual(JSON.parse(practice.options.body),{notify:true,recipientId:'recipient'});
 assert.equal($('chSongPracticingPanel').querySelector('button').disabled,true);
 const song=e.data.practicing.pop();e.data.learned.push({...song,state:'ready',seconds:7.5});$('characterWorkspace').hidden=true;$('characterWorkspace').hidden=false;await tick();
 assert.equal($('chSongLearnedCount').textContent,'2');assert.equal($('chSongPracticingCount').textContent,'0');assert.match($('chSongStatus').textContent,/练好啦/);
 $('chSongTabPracticing').dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal($('chSongTabLearned').getAttribute('aria-selected'),'true');assert.equal($('chSongLearnedPanel').hidden,false);
 }finally{e.dom.window.close();}
});
test('MP3 validation prevents unsupported files reaching upload API',async()=>{
 const e=setup(),$=id=>e.w.document.getElementById(id);try{await tick();
 Object.defineProperty($('chSongFile'),'files',{value:[new e.w.File(['data'],'bad.txt')]});$('chSongUploadForm').dispatchEvent(new e.w.Event('submit',{cancelable:true}));await tick();
 assert.equal(e.calls.filter(c=>c.path.includes('/upload?')).length,0);assert.match($('chSongStatus').textContent,/MP3/);
 }finally{e.dom.window.close();}
});
