/* Visible framing, rather than a legacy card class, determines safe insets. */
(() => {
  const roots='[data-aime-streamviz-root],[data-visualize-root]';
  const components='.sv-native-canvas,.card,.panel,.sv-card,[data-sv-card],.sv-metric,[data-sv-metric]';
  const transparent=color=>!color||color==='transparent'||/rgba\([^)]*,\s*0(?:\.0+)?\)$|\/\s*0(?:\.0+)?%?\s*\)$/.test(color);
  const repair=()=>document.querySelectorAll(roots).forEach(root=>{
    const nodes=[...(root.matches(components)?[root]:[]),...root.querySelectorAll(components)];
    for(const node of nodes){
      const style=getComputedStyle(node);
      const border=['Top','Right','Bottom','Left'].some(side=>
        parseFloat(style['border'+side+'Width'])>0&&!['none','hidden'].includes(style['border'+side+'Style'])&&!transparent(style['border'+side+'Color']));
      const open=!border&&transparent(style.backgroundColor)&&(!style.backgroundImage||style.backgroundImage==='none')&&(!style.boxShadow||style.boxShadow==='none');
      if(open){if(node.dataset.svUnframed!=='true')node.dataset.svUnframed='true';}
      else if(node.hasAttribute('data-sv-unframed'))node.removeAttribute('data-sv-unframed');
    }
  });
  let scheduled=false;
  const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;repair();});}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  document.fonts?.ready.then(schedule);
  new MutationObserver(records=>{
    if(records.some(record=>record.type==='attributes'?record.target.matches?.(components):
      [...record.addedNodes].some(node=>node.nodeType===1&&(node.matches?.(components+',style,link')||node.querySelector?.(components)))))schedule();
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
})();
