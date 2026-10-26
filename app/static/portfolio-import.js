/* Local OCR import: no chat/VLM calls; only explicitly selected codes are added. */
(()=>{
 'use strict';
 const root=document.getElementById('portfolioWorkspace');if(!root)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dialog=document.createElement('dialog');dialog.className='pfOcrDialog';dialog.setAttribute('aria-label','从图片导入自选股票');
 dialog.innerHTML='<header><h2>识别图片中的代码</h2><button class="pfOcrClose" type="button" data-ocr-close aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><p data-ocr-status role="status" aria-live="polite" hidden></p><label class="pfOcrSelectAll" hidden><input type="checkbox" data-ocr-all><span>全选</span></label><div class="pfOcrCandidates"></div><footer><button type="button" data-ocr-close>取消</button><button type="button" data-ocr-add disabled>加入已选自选</button></footer>';
 document.body.append(dialog);
 const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;file.setAttribute('aria-label','上传股票列表截图');root.append(file);
 let candidates=[],busy=false,controller=null;
 const status=text=>{const el=dialog.querySelector('[data-ocr-status]');el.textContent=text;el.hidden=!text;},add=dialog.querySelector('[data-ocr-add]'),all=dialog.querySelector('[data-ocr-all]');
 function syncSelection(){
  const inputs=[...dialog.querySelectorAll('.pfOcrCandidates input:not(:disabled)')],selected=inputs.filter(input=>input.checked).length;
  all.checked=!!inputs.length&&selected===inputs.length;all.indeterminate=selected>0&&selected<inputs.length;all.disabled=busy||!inputs.length;
  add.disabled=busy||!selected;
 }
 dialog.querySelectorAll('[data-ocr-close]').forEach(button=>button.addEventListener('click',()=>{if(!busy)dialog.close();}));
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else controller?.abort();});
 dialog.addEventListener('change',event=>{if(event.target===all)dialog.querySelectorAll('.pfOcrCandidates input:not(:disabled)').forEach(input=>input.checked=all.checked);syncSelection();});
 function enhance(){
  const form=root.querySelector('#pfFavoriteForm');if(!form)return;
  const head=form.closest('.pfCard')?.querySelector('.pfCardHead');
  if(head&&form.parentElement!==head){head.classList.add('pfFavoriteHeader');head.append(form);}
  const actions=form.querySelector('.pfFavoriteAdd');
  const refresh=actions?.querySelector('[data-pf-action="refresh"]');
  if(refresh&&!refresh.dataset.compactRefresh){
   refresh.dataset.compactRefresh='true';refresh.setAttribute('aria-label','刷新行情');refresh.title='刷新行情';
   refresh.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 19.6 10M4.4 14a8 8 0 0 0 13.5 3.9"/></svg><span class="pfFavoriteRefreshLabel">刷新行情</span>';
  }
  if(actions&&!actions.querySelector('[data-ocr-upload]')){
   const button=document.createElement('button');button.type='button';button.dataset.ocrUpload='';button.className='pfFavoriteImage';button.title='从图片识别股票代码（OCR）';button.setAttribute('aria-label','从图片识别股票代码');
   button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg>';
   actions.querySelector('#pfFavoriteField')?.append(button);
  }
 }
 new MutationObserver(enhance).observe(root,{childList:true,subtree:true});enhance();
 root.addEventListener('click',event=>{if(event.target.closest('[data-ocr-upload]')){file.value='';file.click();}});
 async function request(path,body,signal){
  const response=await fetch('/api/portfolio'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Veya-Portfolio':'1'},body:JSON.stringify(body),signal});
  const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'请求未完成，请重试。');return data;
 }
 root.addEventListener('paste',event=>{
  if(!event.target.closest('#pfFavoriteField'))return;
  const image=[...(event.clipboardData?.items||[])].find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile();
  if(image){event.preventDefault();recognize(image);}
 });
 file.addEventListener('change',()=>recognize(file.files?.[0]));
 async function recognize(image){
  if(!image||busy)return;
  candidates=[];dialog.querySelector('.pfOcrCandidates').replaceChildren();all.closest('label').hidden=true;all.checked=false;all.indeterminate=false;add.disabled=true;
  dialog.querySelector('h2').textContent='正在识别代码…';
  if(!dialog.open)dialog.showModal();
  if(image.size>8*1024*1024){dialog.querySelector('h2').textContent='图片过大';status('图片不能超过 8 MB，请裁剪股票列表后重试。');return;}
  status('');busy=true;controller=new AbortController();
  try{
   const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('无法读取图片'));reader.readAsDataURL(image);});
   const data=await request('/favorites/ocr',{image:encoded},controller.signal);candidates=data.candidates||[];
   dialog.querySelector('.pfOcrCandidates').innerHTML=candidates.map((item,i)=>'<label><input type="checkbox" value="'+i+'"><span><strong>'+esc(item.symbol)+'</strong><small>'+esc(({us:'美股',cn:'A 股',hk:'港股'})[item.market]||'待核对市场')+' · 图片文字：'+esc(item.evidence)+'</small></span></label>').join('');
   dialog.querySelector('h2').textContent='识别到 '+candidates.length+' 个代码';all.closest('label').hidden=!candidates.length;
   status(candidates.length?'':'没有识别到股票代码，请换一张清晰截图。');
  }catch(error){dialog.querySelector('h2').textContent='未完成识别';status(error.name==='AbortError'?'识别已取消。':error.message);}
  finally{busy=false;syncSelection();}
 }
 add.addEventListener('click',async()=>{
  const selected=[...dialog.querySelectorAll('.pfOcrCandidates input:checked:not(:disabled)')].map(input=>({input,item:candidates[Number(input.value)]}));if(!selected.length||busy)return;
  busy=true;add.disabled=true;dialog.querySelectorAll('input').forEach(input=>input.disabled=true);let count=0;const errors=[];
  let completed=0,next=0;const total=selected.length;
  const progress=()=>{add.textContent='正在加入 '+completed+'/'+total;status('正在加入 '+completed+'/'+total+' 项自选…');};progress();
  async function worker(){
   while(next<total){const {input,item}=selected[next++];
    try{await request('/favorites',{symbol:item.symbol,name:item.symbol});count++;input.checked=false;input.closest('label').classList.add('is-imported');}
    catch(error){errors.push(item.symbol+'：'+error.message);}
    finally{completed++;progress();}
   }
  }
  await Promise.all(Array.from({length:Math.min(4,total)},worker));add.textContent='加入已选自选';
  busy=false;dialog.querySelectorAll('.pfOcrCandidates input').forEach(input=>input.disabled=input.closest('label').classList.contains('is-imported'));
  status('已加入 '+count+' 项自选。'+(errors.length?'\n'+errors.join('\n'):''));syncSelection();
  if(count)root.dispatchEvent(new CustomEvent('portfolio:favorites-imported',{bubbles:true}));
 });
})();
