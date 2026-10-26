// Keep page scrolling until the user explicitly enters an embedded price chart.
(() => {
  const guards=new Map();let active=null;
  function lock(frame){
    const entry=guards.get(frame);if(!entry)return;
    entry.card.classList.remove('is-chart-active');entry.button.hidden=false;
    if(active===frame)active=null;
  }
  function remove(frame){
    const entry=guards.get(frame);if(!entry)return;
    entry.card.removeEventListener('pointerleave',entry.leave);entry.button.remove();guards.delete(frame);
    if(active===frame)active=null;
  }
  window.installChartActivation=(frame,widget)=>{
    if(widget!=='advanced-chart')return;
    try{frame.contentDocument?.querySelector('[data-tv-scroll-guard]')?.remove();}catch{}
    if(guards.has(frame)){lock(frame);return;}
    const card=frame.closest('.widgetCard, .reportFrameShell');if(!card)return;
    const button=document.createElement('button');button.type='button';button.className='widgetChartActivation';
    button.setAttribute('aria-label','点击激活图表缩放交互');
    button.style.top=(card.classList.contains('widgetCard')?(card.querySelector('.widgetCardHeader')?.getBoundingClientRect().height||40):0)+'px';
    // Keep the transparent scroll gate and accessible label, without a caption.
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      if(active&&active!==frame)lock(active);
      active=frame;button.hidden=true;card.classList.add('is-chart-active');frame.focus({preventScroll:true});
    });
    const leave=()=>lock(frame);card.addEventListener('pointerleave',leave);
    guards.set(frame,{card,button,leave});card.append(button);
  };
  document.addEventListener('pointerdown',event=>{
    if(active&&!guards.get(active)?.card.contains(event.target))lock(active);
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active)lock(active);});
  new MutationObserver(()=>{for(const frame of guards.keys())if(!frame.isConnected)remove(frame);})
    .observe(document.documentElement,{childList:true,subtree:true});
})();
