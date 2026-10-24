(() => {
  if(window.parent===window)return;
  let enabled=Boolean(window.frameElement?.classList.contains("reportDocumentFrame"));
  const attach=()=>{
    if(!enabled||!document?.documentElement)return;
    const title=document.querySelector('.chart-title,.waterfall-title,.treemap-title,.pie-title,.card-title,#title,h1,h2');
    if(!title?.textContent.trim())return;
    let style=document.querySelector('[data-widget-title-action-style]');
    if(!style){style=document.createElement('style');style.dataset.widgetTitleActionStyle='true';document.head.append(style);}
    const actionStyle='[data-widget-title-action]{display:inline-flex!important;position:static!important;vertical-align:middle;align-items:center;justify-content:flex-start!important;box-sizing:border-box;width:28px;height:28px;margin:0 0 0 6px!important;padding:5px 10px 5px 0!important;border:0;border-radius:6px;background:transparent;color:inherit;opacity:.65;cursor:pointer;flex-shrink:0}[data-widget-title-action]:hover,[data-widget-title-action]:focus-visible{opacity:1;background:#8882}[data-widget-title-action] svg{display:block;width:18px;height:18px;fill:currentColor}';
    if(style.textContent!==actionStyle)style.textContent=actionStyle;
    const actionHost=title.closest('header')?.querySelector('[data-widget-title-action-anchor]')||title;
    const existing=actionHost.querySelector('.artifactAddToWidget,[data-widget-title-action]')||title.querySelector('.artifactAddToWidget,[data-widget-title-action]');
    if(existing){if(existing.parentElement!==actionHost)actionHost.append(existing);return;}
    const button=document.createElement('button');button.type='button';button.dataset.widgetTitleAction='true';button.title='添加到 Widget';button.setAttribute('aria-label','添加到 Widget');
    button.innerHTML="<svg viewBox=\"0 0 1024 1024\" aria-hidden=\"true\"><path d=\"M960 224a32 32 0 0 0-32-32h-832a32 32 0 0 0-31.488 26.24L64 224v704a32 32 0 0 0 26.24 31.488L96 960H512a32 32 0 1 1 0 64H96a96 96 0 0 1-95.552-86.784L0 928v-704a96 96 0 0 1 86.784-95.552L96 128h832a96 96 0 0 1 95.552 86.784L1024 224V512a32 32 0 1 1-64 0V224zM801.92 576c16.64 0 30.08 13.44 30.08 30.08V768l161.92 0.064c16.64 0 30.08 13.44 30.08 30.08v3.84c0 16.64-13.44 30.08-30.08 30.08L832 831.936v161.92c0 16.64-13.44 30.144-30.08 30.144h-3.84A30.08 30.08 0 0 1 768 993.92V831.936L606.08 832A30.08 30.08 0 0 1 576 801.92v-3.84c0-16.64 13.44-30.08 30.08-30.08l161.92-.064V606.08c0-16.64 13.44-30.08 30.08-30.08h3.84zM736 0a32 32 0 1 1 0 64h-448a32 32 0 0 1 0-64h448z\"/></svg>";
    button.addEventListener('click',event=>{
      event.stopPropagation();
      const detail={title:title.textContent.trim()};
      try{
        const shell=window.frameElement?.closest('.chatArtifactShell');
        if(shell){parent.dispatchEvent(new parent.CustomEvent('mentora:add-artifact-to-widget',{detail:{...detail,url:shell.dataset.artifactUrl,trigger:button}}));return;}
      }catch{}
      parent.postMessage({type:'mentora:add-widget',...detail},'*');
    });
    title.style.overflow='visible';title.style.maxHeight='none';actionHost.append(button);
  };
  window.addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='mentora:widget-control'){enabled=true;attach();}});
  attach();
  parent.postMessage({type:'mentora:widget-ready'},'*');
  new MutationObserver(attach).observe(document.documentElement,{childList:true,subtree:true});
})();
