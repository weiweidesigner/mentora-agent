/* Local OCR import: no chat/VLM calls; only explicitly selected codes are added. */
(()=>{
 'use strict';
 const root=document.getElementById('portfolioWorkspace');if(!root)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dialog=document.createElement('dialog');dialog.className='pfOcrDialog';dialog.setAttribute('aria-label','从图片导入自选股票');
 dialog.innerHTML='<header><h2>从图片导入自选股票</h2><button type="button" data-ocr-close aria-label="关闭">×</button></header><p class="pfSubtle">本机 OCR 识别，不调用视觉大模型。请核对代码与市场，再选择加入自选；不会下单。</p><p data-ocr-status role="status" aria-live="polite"></p><div class="pfOcrCandidates"></div><details hidden><summary>识别到的原始文字</summary><pre></pre></details><footer><button type="button" data-ocr-close>取消</button><button type="button" data-ocr-add disabled>加入已选自选</button></footer>';
 document.body.append(dialog);
 const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;file.setAttribute('aria-label','上传股票列表截图');root.append(file);
 let candidates=[],busy=false,controller=null;
 const status=text=>{dialog.querySelector('[data-ocr-status]').textContent=text;},add=dialog.querySelector('[data-ocr-add]');
 dialog.querySelectorAll('[data-ocr-close]').forEach(button=>button.addEventListener('click',()=>{if(!busy)dialog.close();}));
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else controller?.abort();});
 dialog.addEventListener('change',()=>{add.disabled=busy||!dialog.querySelector('input[type=checkbox]:checked');});
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
   actions.querySelector('#pfFavoriteField')?.after(button);
  }
 }
 new MutationObserver(enhance).observe(root,{childList:true,subtree:true});enhance();
 root.addEventListener('click',event=>{if(event.target.closest('[data-ocr-upload]')){file.value='';file.click();}});
 async function request(path,body,signal){
  const response=await fetch('/api/portfolio'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Veya-Portfolio':'1'},body:JSON.stringify(body),signal});
  const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'请求未完成，请重试。');return data;
 }
 file.addEventListener('change',async()=>{
  const image=file.files?.[0];if(!image)return;
  candidates=[];dialog.querySelector('.pfOcrCandidates').replaceChildren();dialog.querySelector('details').hidden=true;add.disabled=true;
  if(!dialog.open)dialog.showModal();
  if(image.size>8*1024*1024){status('图片不能超过 8 MB，请裁剪股票列表后重试。');return;}
  status('正在使用本机 OCR 识别股票代码…');busy=true;controller=new AbortController();
  try{
   const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('无法读取图片'));reader.readAsDataURL(image);});
   const data=await request('/favorites/ocr',{image:encoded},controller.signal);candidates=data.candidates||[];
   dialog.querySelector('.pfOcrCandidates').innerHTML=candidates.map((item,i)=>'<label><input type="checkbox" value="'+i+'"><span><strong>'+esc(item.symbol)+'</strong><small>'+esc(({us:'美股',cn:'A 股',hk:'港股'})[item.market]||'待核对市场')+' · 图片文字：'+esc(item.evidence)+'</small></span></label>').join('');
   dialog.querySelector('details').hidden=!data.text;dialog.querySelector('pre').textContent=data.text||'';
   status(candidates.length?'识别到 '+candidates.length+' 个代码候选，请核对后勾选。':'没有识别到股票代码，请上传包含清晰代码的截图；仅有公司名称时请用名称搜索。');
  }catch(error){status(error.name==='AbortError'?'识别已取消。':error.message);}
  finally{busy=false;}
 });
 add.addEventListener('click',async()=>{
  const selected=[...dialog.querySelectorAll('input:checked')].map(input=>({input,item:candidates[Number(input.value)]}));if(!selected.length||busy)return;
  busy=true;add.disabled=true;dialog.querySelectorAll('input').forEach(input=>input.disabled=true);let count=0;const errors=[];
  for(const {input,item} of selected){
   try{await request('/favorites',{symbol:item.symbol,name:item.symbol});count++;input.checked=false;input.closest('label').classList.add('is-imported');}
   catch(error){errors.push(item.symbol+'：'+error.message);}
  }
  busy=false;dialog.querySelectorAll('input').forEach(input=>input.disabled=input.closest('label').classList.contains('is-imported'));
  status('已加入 '+count+' 项自选。'+(errors.length?'\n'+errors.join('\n'):''));add.disabled=!dialog.querySelector('input:checked');
  if(count)root.querySelector('[data-pf-action="refresh"]')?.click();
 });
})();
