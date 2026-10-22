/* Embedded reports inherit the host palette; they do not own a second switch. */
(() => {
  const theme=document.currentScript?.dataset.artifactHostTheme;
  const root=document.documentElement;
  const embedded=window.frameElement?.classList?.contains('reportDocumentFrame');
  if(embedded){
    root.dataset.mentoraEmbed='chat';
    const style=document.createElement('style');
    style.dataset.artifactChatLayout='true';
    style.textContent=`
html[data-mentora-embed="chat"] :is([data-aime-streamviz-root],[data-visualize-root]) > .report > .read {
  width:100%!important;
  max-width:none!important;
  margin-inline:0!important;
  padding-inline:0!important;
}`;
    document.head.append(style);
  }
  if(!['light','dark'].includes(theme))return;
  const lockTheme=()=>{
    if(root.dataset.theme!==theme)root.dataset.theme=theme;
    if(root.style.colorScheme!==theme)root.style.colorScheme=theme;
  };
  const removeSwitches=()=>{
    document.querySelectorAll('button,[role="button"],select,input[type="checkbox"]').forEach(el=>{
      const id=el.id+' '+el.className;
      const label=(el.getAttribute('aria-label')||'').trim();
      const text=(el.textContent||'').trim();
      if(/theme[-_ ]?(toggle|switch)|(?:toggle|switch)[-_ ]?theme/i.test(id)
        ||/切换.*(?:主题|明暗)|switch.*theme|toggle.*theme/i.test(label)
        ||/^(?:浅色|深色|暗色|切换主题|切换明暗|light|dark|toggle theme)$/i.test(text))el.remove();
    });
    lockTheme();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',removeSwitches,{once:true});
  else removeSwitches();
  new MutationObserver(lockTheme).observe(root,{attributes:true,attributeFilter:['data-theme','style']});
})();
