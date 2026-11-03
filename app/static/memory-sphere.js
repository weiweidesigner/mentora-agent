(() => {
'use strict';
window.MentoraMemorySphere = function(host) {
 const ns='http://www.w3.org/2000/svg';
 const scene=document.createElement('div');scene.className='chMemorySphere chMemoryNebula is-motion-paused';scene.tabIndex=0;scene.setAttribute('role','group');scene.setAttribute('aria-label','记忆星云，可拖动或用方向键旋转');
 const grid=document.createElementNS(ns,'svg');grid.setAttribute('viewBox','-180 -180 360 360');grid.setAttribute('aria-hidden','true');grid.classList.add('chSphereGrid');
 grid.classList.add('chNebulaField');
 const mist=document.createElement('div');mist.className='chNebulaMist';mist.setAttribute('aria-hidden','true');scene.append(mist);
 for(let i=0;i<240;i++){
  const t=(i+.5)/240,r=Math.sqrt(t),arm=i%3,angle=r*5.8+arm*Math.PI*2/3;
  const scatter=Math.sin(i*127.1)*.12*(.3+r);
  const el=document.createElementNS(ns,'circle');el.setAttribute('r',i%19===0?'1.6':i%7===0?'1':'.55');el.classList.add('chSphereDot');el.style.setProperty('--star-hue',String(190+i%85));grid.append(el);
  el.setAttribute('cx',String((Math.cos(angle)*r+scatter)*145));el.setAttribute('cy',String((Math.sin(angle)*r*.7+Math.cos(i*67.3)*.08)*145));el.style.opacity=String(.35+(Math.sin(i*43.1)+1)*.3);
 };scene.append(grid);host.replaceChildren(scene);
 let words=[],yaw=.3,pitch=-.2,frame=0,last=0,visible=!window.IntersectionObserver,hover=false,drag=null,scrolling=false,scrollTimer=0,signature='',size=scene.clientWidth||360;
 const workspace=host.closest('#characterWorkspace');
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 function draw(){
  // Stars are painted once; rotate the cached SVG layer rather than 240 nodes.
  grid.style.transform=`rotate(${yaw}rad) scaleY(${Math.cos(pitch)})`;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  for(const w of words){const [x,y,z]=w.point,a=x*cy-y*sy,b=x*sy+y*cy,py=b*cp-z*sp,pz=z*cp+b*sp,depth=(pz+1)/2;
   w.el.style.transform=`translate(-50%,-50%) translate3d(${a*size*.39}px,${py*size*.39}px,0) scale(${.72+depth*.32})`;
   w.el.style.opacity=String(.28+depth*.72);
  }
 }
 const active=()=>visible&&!document.hidden&&!workspace?.hidden&&!reduced?.matches&&!scrolling&&!hover&&!drag&&!scene.contains(document.activeElement)&&words.length>0;
 function animate(now){frame=0;if(!active())return;if(!last||now-last>=1000/30){const elapsed=last?Math.min(now-last,64):0;yaw+=elapsed*.000035;draw();last=now;}frame=requestAnimationFrame(animate);}
 function start(){const run=active();scene.classList.toggle('is-motion-paused',!run);if(!frame&&run&&window.requestAnimationFrame){last=0;frame=requestAnimationFrame(animate);}}
 function stop(){if(frame)cancelAnimationFrame(frame);frame=0;scene.classList.add('is-motion-paused');}
 if(window.ResizeObserver)new ResizeObserver(entries=>{size=entries[0].contentRect.width||size;draw();}).observe(scene);
 if(window.IntersectionObserver)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){size=scene.clientWidth||size;draw();start();}else stop();}).observe(host);
 if(workspace){new MutationObserver(()=>{if(workspace.hidden)stop();else start();}).observe(workspace,{attributes:true,attributeFilter:['hidden']});workspace.addEventListener('scroll',()=>{scrolling=true;stop();clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{scrolling=false;start();},150);},{passive:true});}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();});reduced?.addEventListener?.('change',()=>{stop();start();});
 scene.addEventListener('pointerenter',()=>{hover=true;stop();});scene.addEventListener('pointerleave',()=>{hover=false;start();});
 scene.addEventListener('focusin',stop);scene.addEventListener('focusout',()=>queueMicrotask(start));
 scene.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;stop();drag={id:e.pointerId,x:e.clientX,y:e.clientY};scene.setPointerCapture?.(e.pointerId);scene.classList.add('is-dragging');});
 scene.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw+=(e.clientX-drag.x)*.008;pitch=Math.max(-1.2,Math.min(1.2,pitch-(e.clientY-drag.y)*.008));drag.x=e.clientX;drag.y=e.clientY;if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(!document.hidden&&!workspace?.hidden)draw();});});
 const release=()=>{drag=null;stop();draw();scene.classList.remove('is-dragging');start();};scene.addEventListener('pointerup',release);scene.addEventListener('pointercancel',release);scene.addEventListener('lostpointercapture',release);
 scene.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch-=.15;if(e.key==='ArrowDown')pitch+=.15;draw();});
 return {setFacts(facts){
  const incoming=JSON.stringify(Array.isArray(facts)?facts:[]);if(incoming===signature)return;signature=incoming;
  words.forEach(w=>w.el.remove());words=[];
  const list=Array.isArray(facts)?facts:[];
  list.forEach((f,i)=>{const el=document.createElement('span');el.className='chMemoryWord';el.tabIndex=0;const label=document.createElement('span');label.className='chMemoryWordText';label.textContent=String(f.label||'');el.append(label);el.title=[f.text,f.quote].filter(Boolean).join(' · ');el.style.left='50%';el.style.top='50%';el.style.fontSize=(14+Math.min(10,Math.max(1,Number(f.weight)||1))*1.2)+'px';
   const seed=[...String(f.id||f.text||f.label||i)].reduce((n,c)=>(Math.imul(n,31)+c.codePointAt(0))>>>0,0);
   el.style.setProperty('--word-hue',String(seed%360));el.style.setProperty('--word-duration',(3.6+seed%19/10)+'s');el.style.setProperty('--word-phase',(-seed%47/10)+'s');scene.append(el);
   const a=i*Math.PI*(3-Math.sqrt(5))-.7,r=.38+.4*Math.sqrt((i+.5)/list.length);words.push({el,point:list.length===1?[0,0,.4]:[Math.cos(a)*r,Math.sin(a)*r*.8,Math.cos(a)*.3]});
  });draw();stop();start();
 }};
};
})();
