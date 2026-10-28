/* Icons: Lucide (ISC), see assets/brands/lucide-LICENSE.txt. No remote icon CDN. */
(() => {
  if (window.MentoraImageViewer) return;
  const ownOrigin=new URL(document.baseURI).origin;
  const icons = {
    download:'<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    close:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    external:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    image:'<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  function publicUrl(value) {
    try {
      if (typeof value !== 'string' || value.length > 8192) return '';
      const url = new URL(value), host=url.hostname.toLowerCase().replace(/\.$/,'');
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password || !host || host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.includes(':') || /^(0|10|127|169\.254|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || (/^\d+\.\d+\.\d+\.\d+$/.test(host)&&Number(host.split('.')[0])>=224)) return '';
      return url.href;
    } catch { return ''; }
  }
  let dialog,stage,canvas,picture,statusText,source,zoomButton,menu,download,original,retry;
  let current,trigger,generation=0,zoom='fit',cancelLoads=[],previousOverflow='';
  const active = token => dialog?.open && token===generation;
  function stopLoads() { cancelLoads.splice(0).forEach(cancel=>cancel()); }
  function loadImage(url,timeout=12000) {
    return new Promise((resolve,reject)=>{
      const image=new Image();image.referrerPolicy='no-referrer';image.decoding='async';let done=false;
      const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);image.onload=image.onerror=null;cancelLoads=cancelLoads.filter(x=>x!==cancel);if(error){image.removeAttribute('src');reject(error)}else resolve(image)};
      const cancel=()=>finish(new Error('cancelled'));
      const timer=setTimeout(()=>finish(new Error('timeout')),timeout);cancelLoads.push(cancel);
      image.onerror=()=>finish(new Error('load'));
      image.onload=async()=>{
        // Some hosts/formats decode slowly despite a usable loaded bitmap.
        try { await Promise.race([image.decode(),new Promise(r=>setTimeout(r,1000))]); } catch {}
        finish(image.naturalWidth>0 && image.naturalHeight>0 ? null : new Error('decode'));
      };
      image.src=url;
    });
  }
  function layout(center=false) {
    menu?.querySelectorAll('[data-zoom]').forEach(button=>button.setAttribute('aria-checked',String(String(zoom)===button.dataset.zoom)));
    if(zoom!=='fit')zoomButton.querySelector('span').textContent=`${zoom}%`;
    if(!dialog?.open || !picture?.naturalWidth)return;
    const fit=Math.min(1,Math.max(1,stage.clientWidth-32)/picture.naturalWidth,Math.max(1,stage.clientHeight-24)/picture.naturalHeight);
    const scale=zoom==='fit'?fit:zoom/100,w=picture.naturalWidth*scale,h=picture.naturalHeight*scale;
    picture.style.width=`${w}px`;picture.style.height=`${h}px`;
    canvas.style.width=`${Math.max(stage.clientWidth,w+32)}px`;canvas.style.height=`${Math.max(stage.clientHeight,h+24)}px`;
    zoomButton.querySelector('span').textContent=`${Math.round(scale*100)}%`;
    zoomButton.title=zoom==='fit'?'缩放至适合窗口':'缩放比例';
    if(center){stage.scrollLeft=(canvas.offsetWidth-stage.clientWidth)/2;stage.scrollTop=(canvas.offsetHeight-stage.clientHeight)/2;}
  }
  function show(image,token) {
    if(!active(token))return;
    image.className='iv-image';image.alt=current.title || '图片预览';
    picture?.remove();picture=image;canvas.append(image);layout(true);
  }
  function cleanup() {
    generation++;stopLoads();canvas.replaceChildren();picture=null;
    document.documentElement.style.overflow=previousOverflow;
    menu.hidden=true;zoomButton.setAttribute('aria-expanded','false');
    trigger?.focus?.();trigger=null;current=null;
  }
  function close() { if(dialog?.open){dialog.close();cleanup();} }
  function ensureDialog() {
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.className='mentoraImageViewer';dialog.setAttribute('aria-label','图片详情');
    dialog.innerHTML=`<div class="iv-toolbar"><div class="iv-kind">${icon('image')}<span>图像</span></div><div class="iv-actions"><button type="button" class="iv-zoom" aria-label="缩放图片" aria-haspopup="menu" aria-expanded="false"><span>100%</span>${icon('chevron')}</button><div class="iv-menu" role="menu" aria-label="缩放比例" hidden>${[25,50,100,150,200,'fit'].map(value=>`<button type="button" role="menuitemradio" aria-checked="false" data-zoom="${value}">${value==='fit'?'缩放至适合窗口':value+'%'}${icon('check')}</button>`).join('')}</div><button type="button" class="iv-icon iv-download" aria-label="下载图片" title="下载图片">${icon('download')}</button><button type="button" class="iv-icon iv-close" aria-label="关闭预览" title="关闭">${icon('close')}</button></div></div><div class="iv-stage" tabindex="0" aria-label="完整图片，可滚动查看"><div class="iv-canvas"></div></div><div class="iv-footer"><a class="iv-source" target="_blank" rel="noopener noreferrer"><span></span>${icon('external')}</a><div class="iv-status" role="status" hidden><span></span><button type="button" class="iv-retry" hidden>重试原图</button><a class="iv-original" target="_blank" rel="noopener noreferrer" hidden>打开原图</a></div></div>`;
    document.body.append(dialog);stage=dialog.querySelector('.iv-stage');canvas=dialog.querySelector('.iv-canvas');statusText=dialog.querySelector('.iv-status span');source=dialog.querySelector('.iv-source');zoomButton=dialog.querySelector('.iv-zoom');menu=dialog.querySelector('.iv-menu');download=dialog.querySelector('.iv-download');original=dialog.querySelector('.iv-original');retry=dialog.querySelector('.iv-retry');
    const closeMenu=()=>{menu.hidden=true;zoomButton.setAttribute('aria-expanded','false')};
    dialog.querySelector('.iv-close').onclick=close;
    zoomButton.onclick=()=>{menu.hidden=!menu.hidden;zoomButton.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('[aria-checked="true"]')?.focus()};
    menu.querySelectorAll('button').forEach(button=>button.onclick=()=>{zoom=button.dataset.zoom==='fit'?'fit':Number(button.dataset.zoom);layout(true);closeMenu();zoomButton.focus()});
    dialog.addEventListener('click',event=>{if(!event.target.closest('.iv-actions'))closeMenu();if(event.target===canvas||event.target===stage)close()});
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(!menu.hidden){closeMenu();zoomButton.focus()}else close()});
    dialog.addEventListener('close',()=>{if(!dialog.open&&current)cleanup()});
    retry.onclick=()=>open(current,trigger);
    download.onclick=async()=>{
      if(!current)return;const token=generation,url=current.original;download.disabled=true;statusText.textContent='正在准备下载';
      const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,12000);cancelLoads.push(cancel);
      try {
        // Browser-only CORS fetch. Never proxy or bypass an origin's access rules.
        const response=await fetch(url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
        if(!response.ok || !response.headers.get('content-type')?.startsWith('image/'))throw Error('download');
        const blob=await response.blob();if(!active(token))return;
        const local=URL.createObjectURL(blob),link=document.createElement('a');link.href=local;
        const extension=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/svg+xml':'svg'})[blob.type] || 'img';
        link.download=(current.title || 'image').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80)+'.'+extension;link.click();setTimeout(()=>URL.revokeObjectURL(local),1000);
        statusText.textContent='已发起下载';
      } catch {if(active(token)){statusText.textContent='来源限制直接下载，请打开原图后保存';original.hidden=false;}}
      finally {clearTimeout(timer);cancelLoads=cancelLoads.filter(item=>item!==cancel);if(active(token))download.disabled=false;}
    };
    menu.addEventListener('keydown',event=>{
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      event.preventDefault();const buttons=Array.from(menu.querySelectorAll('button')),index=buttons.indexOf(document.activeElement);
      buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
    });
    window.addEventListener('resize',()=>layout());
  }
  function open(data,element) {
    const url=publicUrl(data?.original);if(!url)return false;
    ensureDialog();generation++;stopLoads();const token=generation;
    current={original:url,preview:publicUrl(data.preview),source:publicUrl(data.source),title:String(data.title || '').slice(0,500),sourceName:String(data.sourceName || '').slice(0,200)};
    trigger=element || document.activeElement;zoom='fit';picture=null;canvas.replaceChildren();canvas.removeAttribute('style');
    statusText.textContent='正在加载图片';retry.hidden=true;original.hidden=true;original.href=url;download.disabled=false;
    source.hidden=!current.source;source.removeAttribute('href');
    if(current.source){source.href=current.source;source.querySelector('span').textContent=(current.sourceName || new URL(current.source).hostname)+(current.title?' · '+current.title:'');}
    if(!dialog.open){previousOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';dialog.showModal();}
    menu.hidden=true;zoomButton.setAttribute('aria-expanded','false');zoomButton.querySelector('span').textContent='100%';dialog.querySelector('.iv-close').focus();layout();
    let originalReady=false,originalFailure='';
    if(current.preview && current.preview!==url)loadImage(current.preview,6000).then(image=>{if(!originalReady){show(image,token);if(active(token)&&originalFailure)statusText.textContent=originalFailure+'，当前显示预览图';}}).catch(()=>{});
    loadImage(url).then(image=>{if(!active(token))return;originalReady=true;show(image,token);statusText.textContent='';}).catch(error=>{
      if(!active(token))return;originalFailure=error.message==='timeout'?'原图载入超时':'原图暂不可用';
      statusText.textContent=originalFailure+'，'+(picture?'当前显示预览图':current.source?'可重试或查看来源':'可重试或打开原图');retry.hidden=false;original.hidden=false;
    });
    return true;
  }
  function openOnPage(data,element) {
    // Lift out of same-origin report/share-preview wrappers as well as the
    // gallery itself. A dialog inside any iframe cannot cover the app sidebar.
    let root=window,trigger=element;
    try {
      while(root.parent!==root) {
        const frame=root.frameElement;
        if(!frame?.matches('.reportDocumentFrame,.sharePreviewIframe,#sharePreviewIframe,.shareAnswerDocument iframe'))break;
        // srcdoc inherits its parent's security origin, but location.origin
        // itself is "null". DOM access is the reliable same-origin check.
        void root.parent.document.documentElement;
        trigger=frame;root=root.parent;
      }
      if(root!==window && root.MentoraImageViewer)return root.MentoraImageViewer.open(data,trigger);
    } catch { /* Cross-origin external hosts cannot be covered by this app. */ }
    return open(data,element);
  }
  function onMessage(event) {
    if(event.data?.type!=='mentora:image-viewer-open')return;
    if(event.origin!==ownOrigin && event.origin!=='null')return;
    const frame=Array.from(document.querySelectorAll('.reportDocumentFrame,.chatArtifactShell iframe,.shareAnswerDocument iframe')).find(node=>node.contentWindow===event.source);
    if(!frame)return;
    // Only first-party generated artifact frames may request a host overlay.
    try {const url=new URL(frame.src,document.baseURI);if(url.origin!==ownOrigin || !/^\/(?:(?:mentora|veya)\/)?(?:share-artifact|generated)\/[^/]+\.html$/.test(url.pathname))return;}catch{return;}
    if(!openOnPage(event.data.image,frame))return;
    event.source.postMessage({type:'mentora:image-viewer-ack',requestId:event.data.requestId},event.origin==='null'?'*':event.origin);
  }
  window.addEventListener('message',onMessage);
  window.MentoraImageViewer={open:openOnPage,icon};
})();
