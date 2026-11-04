(() => {
'use strict';
window.MentoraMemorySphere = function(host) {
 const ns='http://www.w3.org/2000/svg';
 let expanded=false,activeWord=null;
 const tooltip=document.createElement('div');tooltip.className='chMemoryTooltip';tooltip.hidden=true;tooltip.id='memory-tip-'+Math.random().toString(36).slice(2);tooltip.setAttribute('role','tooltip');
 const scene=document.createElement('div');scene.className='chMemorySphere chMemoryNebula is-motion-paused';scene.tabIndex=0;scene.setAttribute('role','group');scene.setAttribute('aria-label','记忆星云，可拖动或用方向键旋转');
 const grid=document.createElementNS(ns,'svg');grid.setAttribute('viewBox','-180 -180 360 360');grid.setAttribute('aria-hidden','true');grid.classList.add('chSphereGrid');
 grid.classList.add('chNebulaField');
 const mist=document.createElement('div');mist.className='chNebulaMist';mist.setAttribute('aria-hidden','true');scene.append(mist);
 for(let i=0;i<240;i++){
  const t=(i+.5)/240,r=Math.sqrt(t),arm=i%3,angle=r*5.8+arm*Math.PI*2/3;
  const scatter=Math.sin(i*127.1)*.12*(.3+r);
  const el=document.createElementNS(ns,'circle');el.setAttribute('r',i%19===0?'1.6':i%7===0?'1':'.55');el.classList.add('chSphereDot');el.style.setProperty('--star-hue',String(190+i%85));grid.append(el);
  el.setAttribute('cx',String((Math.cos(angle)*r+scatter)*145));el.setAttribute('cy',String((Math.sin(angle)*r*.7+Math.cos(i*67.3)*.08)*145));el.style.opacity=String(.35+(Math.sin(i*43.1)+1)*.3);
 };scene.append(grid);
 const controls=document.createElement('div');controls.className='chNebulaControls';
 const expand=document.createElement('button');expand.type='button';expand.className='chNebulaExpand';expand.setAttribute('aria-label','全屏查看星云');expand.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';controls.append(expand);
 const anchor=document.createComment('nebula');const dialog=document.createElement('dialog');dialog.className='chNebulaDialog';dialog.setAttribute('aria-label','记忆星云全屏查看');
 const bar=document.createElement('header');bar.className='chNebulaDialogBar';const heading=document.createElement('h2');heading.textContent='记忆星云';const close=document.createElement('button');close.type='button';close.textContent='退出全屏';bar.append(heading,close);
 const viewport=document.createElement('div');viewport.className='chNebulaViewport';dialog.append(bar,viewport);
 host.replaceChildren(controls,anchor,scene);document.body.append(dialog);host.style.position='relative';
 function hideTip(){tooltip.hidden=true;activeWord?.el.classList.remove('is-active');activeWord?.el.removeAttribute('aria-describedby');activeWord=null;}
 function placeTip(){if(!activeWord)return;const r=activeWord.el.getBoundingClientRect(),t=tooltip.getBoundingClientRect(),width=window.innerWidth||document.documentElement.clientWidth,height=window.innerHeight||document.documentElement.clientHeight;tooltip.style.left=Math.max(12,Math.min(width-t.width-12,r.left+r.width/2-t.width/2))+'px';tooltip.style.top=Math.max(12,r.bottom+12+t.height<height?r.bottom+12:r.top-t.height-12)+'px';}
 function showTip(word){hideTip();activeWord=word;word.el.classList.add('is-active');word.el.setAttribute('aria-describedby',tooltip.id);const title=document.createElement('strong');title.textContent=word.fact.label||'记忆';const body=document.createElement('p');body.textContent=word.fact.text||'';tooltip.replaceChildren(title,body);if(word.fact.quote){const quote=document.createElement('blockquote');quote.textContent=word.fact.quote;tooltip.append(quote);}(expanded?dialog:document.body).append(tooltip);tooltip.hidden=false;placeTip();}
 function restore(){if(!expanded)return;expanded=false;hideTip();anchor.after(scene);dialog.removeAttribute('open');size=scene.clientWidth||360;draw();start();expand.focus();}
 function leaveFull(){if(dialog.open&&dialog.close)dialog.close();restore();}
 expand.addEventListener('click',()=>{hideTip();expanded=true;viewport.append(scene);if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');size=scene.clientWidth||360;draw();start();close.focus();});
 close.addEventListener('click',leaveFull);dialog.addEventListener('close',restore);dialog.addEventListener('cancel',event=>{event.preventDefault();leaveFull();});
 window.addEventListener('resize',()=>{if(activeWord)placeTip();});window.addEventListener('scroll',hideTip,{passive:true});
 let words=[],yaw=.3,pitch=-.2,frame=0,last=0,visible=!window.IntersectionObserver,hover=false,drag=null,scrolling=false,scrollTimer=0,signature='',size=scene.clientWidth||360;
 const workspace=host.closest('#characterWorkspace');
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 function draw(){
  grid.style.transform=`translate(${Math.sin(yaw)*8}px,${Math.sin(pitch)*5}px) rotate(${yaw*.25}rad) scaleY(${.85+Math.cos(pitch)*.15})`;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),projected=[];
  for(const w of words){const [x,y,z]=w.point,a=x*cy+z*sy,b=z*cy-x*sy,py=y*cp-b*sp,pz=b*cp+y*sp,depth=Math.max(0,Math.min(1,(pz+1)/2)),perspective=2.8/(2.8-pz),scale=.55+depth*.65;
   w.x=a*size*.33*perspective;w.y=py*size*.33*perspective;w.scale=scale;
   w.el.style.transform=`translate(-50%,-50%) translate3d(${w.x}px,${w.y}px,0) scale(${scale})`;
   w.el.style.opacity=String(.25+depth*.75);w.el.style.zIndex=String(Math.round(depth*100));w.el.style.filter=`blur(${((1-depth)*.65).toFixed(2)}px)`;projected.push(w);
  }
  const occupied=[],limit=size/2-8;
  for(const w of projected.sort((a,b)=>b.scale-a.scale)){
   const width=w.width*w.scale,height=20*w.scale;
   const choices=[[12,-20],[12,5],[-w.width-10,-20],[-w.width-10,5],[-w.width/2,-30],[-w.width/2,14]];
   let chosen=null;
   for(let j=0;j<choices.length;j++){const [dx,dy]=choices[(j+w.order%2)%choices.length],box={left:w.x+dx*w.scale,top:w.y+dy*w.scale,width:width+5,height:height+4};
    if(box.left < -limit||box.left+box.width>limit||box.top < -limit||box.top+box.height>limit)continue;
    if(occupied.some(b=>box.left<b.left+b.width&&box.left+box.width>b.left&&box.top<b.top+b.height&&box.top+box.height>b.top))continue;
    chosen={dx,dy,box};break;
   }
   w.label.style.transform=`translate(${chosen?.dx??12}px,${chosen?.dy??-20}px)`;w.el.classList.toggle('is-label-muted',!chosen);if(chosen)occupied.push(chosen.box);
  }
  if(activeWord)placeTip();
 }

 const active=()=>(expanded||visible)&&!document.hidden&&!workspace?.hidden&&!reduced?.matches&&!scrolling&&!hover&&!drag&&!scene.contains(document.activeElement)&&words.length>0;
 function animate(now){frame=0;if(!active())return;if(!last||now-last>=1000/30){const elapsed=last?Math.min(now-last,64):0;yaw+=elapsed*.000035;draw();last=now;}frame=requestAnimationFrame(animate);}
 function start(){const run=active();scene.classList.toggle('is-motion-paused',!run);if(!frame&&run&&window.requestAnimationFrame){last=0;frame=requestAnimationFrame(animate);}}
 function stop(){if(frame)cancelAnimationFrame(frame);frame=0;scene.classList.add('is-motion-paused');}
 if(window.ResizeObserver)new ResizeObserver(entries=>{size=entries[0].contentRect.width||size;draw();}).observe(scene);
 if(window.IntersectionObserver)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){size=scene.clientWidth||size;draw();start();}else stop();}).observe(host);
 if(workspace){new MutationObserver(()=>{if(workspace.hidden){leaveFull();hideTip();stop();}else start();}).observe(workspace,{attributes:true,attributeFilter:['hidden']});workspace.addEventListener('scroll',()=>{scrolling=true;stop();clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{scrolling=false;start();},150);},{passive:true});}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();});reduced?.addEventListener?.('change',()=>{stop();start();});
 scene.addEventListener('pointerenter',()=>{hover=true;stop();});scene.addEventListener('pointerleave',()=>{hover=false;hideTip();start();});
 scene.addEventListener('focusin',stop);scene.addEventListener('focusout',()=>queueMicrotask(start));
 scene.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;stop();drag={id:e.pointerId,x:e.clientX,y:e.clientY};scene.setPointerCapture?.(e.pointerId);scene.classList.add('is-dragging');});
 scene.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw+=(e.clientX-drag.x)*.008;pitch=Math.max(-1.2,Math.min(1.2,pitch-(e.clientY-drag.y)*.008));drag.x=e.clientX;drag.y=e.clientY;if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(!document.hidden&&!workspace?.hidden)draw();});});
 const release=()=>{drag=null;stop();draw();scene.classList.remove('is-dragging');start();};scene.addEventListener('pointerup',release);scene.addEventListener('pointercancel',release);scene.addEventListener('lostpointercapture',release);
 scene.addEventListener('keydown',e=>{if(e.key==='Escape'){hideTip();if(expanded)leaveFull();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch-=.15;if(e.key==='ArrowDown')pitch+=.15;draw();});
 return {setFacts(facts){
  const incoming=JSON.stringify(Array.isArray(facts)?facts:[]);if(incoming===signature)return;signature=incoming;
  hideTip();words.forEach(w=>w.el.remove());words=[];
  const list=Array.isArray(facts)?facts:[];
  list.forEach((f,i)=>{const el=document.createElement('span');el.className='chMemoryWord';el.tabIndex=0;const star=document.createElement('span');star.className='chMemoryStar';star.setAttribute('aria-hidden','true');const label=document.createElement('span');label.className='chMemoryWordText';label.textContent=String(f.label||'');el.append(star,label);el.style.left='50%';el.style.top='50%';
   const seed=[...String(f.id||f.text||f.label||i)].reduce((n,c)=>(Math.imul(n,31)+c.codePointAt(0))>>>0,0);
   el.style.setProperty('--word-hue',String(180+seed%145));el.style.setProperty('--word-duration',(3.6+seed%19/10)+'s');el.style.setProperty('--word-phase',(-seed%47/10)+'s');scene.append(el);
   const z=1-2*(i+.5)/list.length,a=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-z*z),font=12+Math.min(5,Math.max(1,Number(f.weight)||1))*.7;
   label.style.fontSize=font+'px';const width=Math.min(132,Math.max(32,[...String(f.label||'')].reduce((n,c)=>n+(c.charCodeAt(0)>255?font:font*.6),0)));
   label.style.width=width+'px';const word={el,label,fact:f,width,order:i,point:list.length===1?[0,0,.4]:[Math.cos(a)*r*.9,Math.sin(a)*r*.8,z*.95]};words.push(word);
   el.addEventListener('pointerenter',()=>showTip(word));el.addEventListener('pointerleave',()=>{if(document.activeElement!==el)hideTip();});el.addEventListener('focus',()=>showTip(word));el.addEventListener('blur',hideTip);el.addEventListener('click',()=>showTip(word));
  });draw();stop();start();
 }};
};
})();
