/* One generation owns follow mode. User scroll intent pauses it until an
   explicit return-to-bottom action or the next generation. */
window.createGenerationScrollFollow = messages => {
  let article=null,enabled=true,frame=0,lastTop=messages.scrollTop,expectedTop=null;
  const documents=new WeakSet(),frames=new WeakSet();
  const current=()=>article?.isConnected&&messages.contains(article);
  const pause=()=>{if(current())enabled=false;};
  const editable=target=>target?.closest?.('input,textarea,select,button,a,[contenteditable="true"],[role="slider"]');
  const bindDocument=(doc,insideFrame=false)=>{
    if(!doc||documents.has(doc))return;documents.add(doc);
    const inside=target=>insideFrame||messages.contains(target);
    doc.addEventListener('wheel',event=>{
      if(inside(event.target)&&!event.ctrlKey&&!event.metaKey&&!event.defaultPrevented&&Math.abs(event.deltaY)>0)pause();
    },{passive:true});
    let touchY=null;
    doc.addEventListener('touchstart',event=>{touchY=inside(event.target)?event.touches[0]?.clientY:null;},{passive:true});
    doc.addEventListener('touchmove',event=>{
      if(touchY!==null&&Math.abs((event.touches[0]?.clientY??touchY)-touchY)>3)pause();
    },{passive:true});
    doc.addEventListener('keydown',event=>{
      if(event.ctrlKey||event.metaKey||event.altKey||editable(event.target))return;
      if((inside(event.target)||event.target===doc.body)&&['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))pause();
    });
  };
  bindDocument(messages.ownerDocument);
  messages.addEventListener('pointerdown',event=>{
    const rect=messages.getBoundingClientRect();
    if(event.pointerType!=='touch'&&event.target===messages&&event.clientX>=rect.right-18&&event.clientX<=rect.right)pause();
  },{passive:true});
  messages.addEventListener('scroll',()=>{
    const top=messages.scrollTop,bottom=Math.max(0,messages.scrollHeight-messages.clientHeight);
    // Also catch native upward scrolling chained from a cross-origin frame.
    // Content shrinkage clamped to bottom and our own writes are not intent.
    if(top<lastTop-2&&top<bottom-2&&(expectedTop===null||Math.abs(top-expectedTop)>2))pause();
    lastTop=top;
  },{passive:true});
  const changed=()=>{
    if(frame||!enabled||!current())return;
    frame=requestAnimationFrame(()=>{
      frame=0;if(!enabled||!current())return;
      expectedTop=Math.max(0,messages.scrollHeight-messages.clientHeight);
      messages.scrollTo({top:expectedTop,behavior:'auto'});lastTop=messages.scrollTop;
    });
  };
  return {
    start(next){article=next;enabled=true;expectedTop=null;lastTop=messages.scrollTop;changed();},
    resume(){enabled=true;},
    changed,
    watchFrame(element){
      if(frames.has(element))return;frames.add(element);
      const bind=()=>{try{bindDocument(element.contentDocument,true);}catch{/* Cross-origin frames retain native scroll detection. */}};
      element.addEventListener('load',bind);bind();
    },
  };
};
