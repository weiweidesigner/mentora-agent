(() => {
'use strict';
const workspace=document.getElementById('characterWorkspace');if(!workspace||document.getElementById('chSongSection'))return;
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const section=document.createElement('section');section.id='chSongSection';section.className='chCard chSongSection';
section.innerHTML=`<header class="chGalleryHeader"><div><h2>会唱的歌</h2><p>把喜欢的歌交给我，慢慢练给你听。</p></div><button type="button" id="chSongUploadToggle">上传 MP3</button><input type="file" id="chSongFile" accept=".mp3,audio/mpeg" multiple hidden aria-label="选择 MP3，可多选" /></header>
<label id="chSongRecipientLabel" class="chSongRecipient" hidden>接收通知的 QQ 会话<span class="chSelect"><select id="chSongRecipient" aria-label="接收通知的 QQ 会话"></select></span></label>
<div class="chGalleryTabs chSongTabs" role="tablist" aria-label="歌曲学习状态"><button type="button" role="tab" id="chSongTabLearned" aria-controls="chSongLearnedPanel" aria-selected="true" tabindex="0" data-song-tab="learned">已经学会 <span id="chSongLearnedCount">0</span></button><button type="button" role="tab" id="chSongTabPracticing" aria-controls="chSongPracticingPanel" aria-selected="false" tabindex="-1" data-song-tab="practicing">正在练习 <span id="chSongPracticingCount">0</span></button></div>
<div id="chSongLearnedPanel" role="tabpanel" aria-labelledby="chSongTabLearned" class="chSongPanel"><p class="chEmpty">正在读取曲库…</p></div><div id="chSongPracticingPanel" role="tabpanel" aria-labelledby="chSongTabPracticing" class="chSongPanel" hidden></div><p id="chSongStatus" class="chHint" role="status" aria-live="polite"></p>`;
workspace.querySelector('.chStickerSection').before(section);
let data={learned:[],practicing:[],recipients:[],online:false},view='learned',loading=false,uploading=false,practicing=false;
const previewLoading=new Set();
const duration=value=>{const seconds=Number(value);return Number.isFinite(seconds)&&seconds>0?seconds.toFixed(2):'';};
const api=async(path='',method='GET',body)=>{const r=await fetch('/api/character/songs'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Veya-Day':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'操作未完成，请稍后重试');return d;};
function tab(next){view=next;for(const b of section.querySelectorAll('[data-song-tab]')){const active=b.dataset.songTab===view;b.setAttribute('aria-selected',String(active));b.setAttribute('tabindex',active?'0':'-1');}$('chSongLearnedPanel').hidden=view!=='learned';$('chSongPracticingPanel').hidden=view!=='practicing';}
function notice(song){if(song.notificationError)return song.notificationError;return {sent:'已通过 QQ 告诉你，并发送试唱',sending:'正在发送 QQ 通知与试唱',unknown:'QQ 送达状态未确认'}[song.notification]||'';}
function row(song,ready){const state={uploaded:'待练习',uploading:'正在上传',queued:'排队中',practicing:'正在练习',failed:'练习未完成',ready:'已经学会'}[song.state]||'待练习';const busy=['queued','practicing','uploading'].includes(song.state);return `<li class="chSongRow" data-song-id="${esc(song.id)}"><div class="chSongInfo"><h3>${esc(song.title)}</h3><p class="chHint">${ready?(duration(song.seconds)?'约 '+duration(song.seconds)+' 秒 · ':'')+'可以在 QQ 直接点唱':song.state==='practicing'?'正在练习，练会后，我会主动唱给你～':state}</p>${song.error?`<p class="chSongError">${esc(song.error)}</p>`:''}${notice(song)?`<p class="chHint">${esc(notice(song))}</p>`:''}</div><div class="chSongActions">${ready?`<button type="button" data-song-preview="${esc(song.id)}" aria-label="试听 ${esc(song.title)}">试听</button>`:`<button type="button" data-song-practice="${esc(song.jobId)}" ${busy||practicing?'disabled':''}>${busy?state:song.state==='failed'?'重新练习':'练习'}</button>`}</div></li>`;}
function render(){
 $('chSongLearnedCount').textContent=data.learned.length;$('chSongPracticingCount').textContent=data.practicing.length;
 for(const [kind,id] of [['learned','chSongLearnedPanel'],['practicing','chSongPracticingPanel']]){const html=data[kind].length?'<ul class="chSongList">'+data[kind].map(s=>row(s,kind==='learned')).join('')+'</ul>':`<p class="chEmpty">${kind==='learned'?'还没有学会的歌，上传一首喜欢的 MP3 开始吧。':'这里会放刚上传、排队中和正在练习的歌。'}</p>`;const panel=$(id);if(panel.dataset.content!==html){panel.innerHTML=html;panel.dataset.content=html;}}
 const previous=$('chSongRecipient').value;$('chSongRecipient').innerHTML=(data.recipients.length>1?'<option value="">请选择 QQ 会话</option>':'')+data.recipients.map(r=>`<option value="${esc(r.id)}">${esc(r.label)}</option>`).join('');if(data.recipients.some(r=>r.id===previous))$('chSongRecipient').value=previous;$('chSongRecipientLabel').hidden=data.recipients.length<2;
 tab(view);syncPreviewButtons();
}
async function load(){if(loading)return;loading=true;try{const previous=new Set(data.practicing.map(x=>x.id));const result=await api();data={learned:result.learned||[],practicing:result.practicing||[],recipients:result.recipients||[],online:Boolean(result.online)};render();const done=data.learned.find(s=>previous.has(s.id));if(done)$('chSongStatus').textContent='《'+done.title+'》练好啦，已移到已经学会。';else if(!data.online&&!uploading&&!practicing)$('chSongStatus').textContent='本地歌声服务暂不可用，已上传的歌曲和进度会保留。';else if($('chSongStatus').textContent.startsWith('本地歌声服务'))$('chSongStatus').textContent='';}catch(e){$('chSongStatus').textContent=e.message;}finally{loading=false;}}
$('chSongUploadToggle').addEventListener('click',()=>{$('chSongFile').click();});
$('chSongFile').addEventListener('change',async()=>{
 const files=Array.from($('chSongFile').files||[]);$('chSongFile').value='';if(!files.length||uploading)return;
 uploading=true;$('chSongUploadToggle').disabled=true;tab('practicing');let count=0;const errors=[];
 try{for(const [index,file] of files.entries()){
  $('chSongStatus').textContent='正在上传 '+(index+1)+'/'+files.length+'：'+file.name;
  try{if(!/\.mp3$/i.test(file.name)||file.size>30*1024*1024)throw Error('请选择不超过 30MB 的 MP3 文件');
   const r=await fetch('/api/character/songs/upload?'+new URLSearchParams({filename:file.name}),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'audio/mpeg','X-Veya-Day':'1'},body:file});const result=await r.json();if(!r.ok)throw Error(typeof result.detail==='string'?result.detail:'上传未完成');count++;
  }catch(error){errors.push(file.name+'：'+error.message);}
 }
 await load();$('chSongStatus').textContent=(count?'已添加 '+count+' 首，点击右侧“练习”开始练习。':'')+(errors.length?' '+errors.join('；'):'');
 }finally{uploading=false;$('chSongUploadToggle').disabled=false;}
});
async function practiceSong(id){
 if(practicing||!id)return;if(data.recipients.length>1&&!$('chSongRecipient').value){$('chSongStatus').textContent='请选择接收通知的 QQ 会话';return;}
 const recipientId=$('chSongRecipient').value;practicing=true;render();
 let message='';
 try{await api('/'+encodeURIComponent(id)+'/practice','POST',{notify:true,recipientId});message='已开始练习，练会后，我会主动唱给你～';}
 catch(error){message=error.message;}
 finally{practicing=false;await load();render();$('chSongStatus').textContent=message;}
}
function syncPreviewButtons(){for(const button of section.querySelectorAll('[data-song-preview]')){const pending=previewLoading.has(button.dataset.songPreview);button.disabled=pending;button.textContent=pending?'准备中…':'试听';}}
function previewRow(id){return [...section.querySelectorAll('.chSongRow')].find(row=>row.dataset.songId===id);}
async function playPreview(id){
 if(previewLoading.has(id))return;previewLoading.add(id);syncPreviewButtons();
 $('chSongStatus').textContent='正在准备试听音频，首次生成需要一点时间…';
 try{
  let status=await api('/'+encodeURIComponent(id)+'/preview','POST',{});
  while(status.state==='queued'||status.state==='preparing'){
   if(!previewRow(id))return;
   await new Promise(resolve=>setTimeout(resolve,1500));
   status=await api('/'+encodeURIComponent(id)+'/preview-status');
  }
  if(status.state!=='ready')throw Error(status.error||'试听音频尚未准备好，请重试');
  const row=previewRow(id);if(!row)return;let audio=row.querySelector('audio');
  if(!audio){audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';
   const script=document.querySelector('script[src*="/static/character-songs.js"]');
   const path=encodeURIComponent(id)+'/preview';
   audio.src=script?new URL('../api/character/songs/'+path,script.src).href:new URL('api/character/songs/'+path,new URL('.',location.href)).href;
   audio.setAttribute('aria-label','歌曲试听');
   audio.addEventListener('error',()=>{$('chSongStatus').textContent='试听加载失败，请点击试听重试';audio.remove();});row.append(audio);
  }
  $('chSongStatus').textContent='';
  if(workspace.hidden||document.hidden){$('chSongStatus').textContent='试听已准备好，点击播放器即可播放';return;}
  try{await audio.play();}catch(error){$('chSongStatus').textContent=error.name==='NotAllowedError'?'试听已准备好，点击播放器即可播放':'试听暂未开始，请点击播放器重试';}
 }catch(error){$('chSongStatus').textContent=error.message;}
 finally{previewLoading.delete(id);syncPreviewButtons();}
}
section.addEventListener('click',async e=>{const t=e.target.closest('[data-song-tab]');if(t){tab(t.dataset.songTab);return;}const practice=e.target.closest('[data-song-practice]'),preview=e.target.closest('[data-song-preview]');if(practice){void practiceSong(practice.dataset.songPractice);return;}if(preview)void playPreview(preview.dataset.songPreview);});
section.querySelector('[role=tablist]').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'learned':e.key==='End'?'practicing':view==='learned'?'practicing':'learned';tab(next);section.querySelector('[data-song-tab="'+next+'"]').focus();});
new MutationObserver(()=>{if(!workspace.hidden)void load();}).observe(workspace,{attributes:true,attributeFilter:['hidden']});
setInterval(()=>{if(!workspace.hidden&&!document.hidden)void load();},4000);
if(!workspace.hidden)void load();
})();
