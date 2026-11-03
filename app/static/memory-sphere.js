(() => {
'use strict';
window.MentoraMemorySphere = function(host) {
 const ns='http://www.w3.org/2000/svg';
 const scene=document.createElement('div');scene.className='chMemorySphere is-motion-paused';scene.tabIndex=0;scene.setAttribute('role','group');scene.setAttribute('aria-label','3D 记忆球，可拖动或用方向键旋转');
 const grid=document.createElementNS(ns,'svg');grid.setAttribute('viewBox','-180 -180 360 360');grid.setAttribute('aria-hidden','true');grid.classList.add('chSphereGrid');
 const outline=document.createElementNS(ns,'circle');outline.setAttribute('r','145');grid.append(outline);
 const paths=Array.from({length:13},()=>{const p=document.createElementNS(ns,'path');grid.append(p);return p;});const dots=Array.from({length:96},(_,i)=>{const y=1-2*(i+.5)/96,a=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-y*y),el=document.createElementNS(ns,'circle');el.setAttribute('r',i%7===0?'1.5':'.8');el.classList.add('chSphereDot');grid.append(el);return {el,point:[Math.cos(a)*r,y,Math.sin(a)*r]};});scene.append(grid);host.replaceChildren(scene);
 let words=[],yaw=.3,pitch=-.2,frame=0,last=0,visible=!window.IntersectionObserver,hover=false,drag=null;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const project=(x,y,z)=>{const a=x*Math.cos(yaw)+z*Math.sin(yaw),b=z*Math.cos(yaw)-x*Math.sin(yaw);return [a,y*Math.cos(pitch)-b*Math.sin(pitch),b*Math.cos(pitch)+y*Math.sin(pitch)];};
 function draw(){
  let n=0;
  for(let j=0;j<8;j++){let d='';for(let i=0;i<=64;i++){const t=i/64*Math.PI*2,l=j/8*Math.PI;const [x,y]=project(Math.cos(t)*Math.cos(l),Math.sin(t),Math.cos(t)*Math.sin(l));d+=(i?'L':'M')+(x*145).toFixed(2)+','+(y*145).toFixed(2);}paths[n++].setAttribute('d',d);}
  for(let j=-2;j<=2;j++){const lat=j*Math.PI/6;let d='';for(let i=0;i<=64;i++){const t=i/64*Math.PI*2;const [x,y]=project(Math.cos(lat)*Math.cos(t),Math.sin(lat),Math.cos(lat)*Math.sin(t));d+=(i?'L':'M')+(x*145).toFixed(2)+','+(y*145).toFixed(2);}paths[n++].setAttribute('d',d);}
  for(const dot of dots){const [x,y,z]=project(...dot.point);dot.el.setAttribute('cx',String(x*145));dot.el.setAttribute('cy',String(y*145));dot.el.style.opacity=String(.3+(z+1)*.35);}
  for(const w of words){const [x,y,z]=project(...w.point),depth=(z+1)/2;w.el.style.left=(50+x*39)+'%';w.el.style.top=(50+y*39)+'%';w.el.style.transform=`translate(-50%,-50%) scale(${.72+depth*.32})`;w.el.style.opacity=String(.28+depth*.72);w.el.style.zIndex=String(1+Math.round(depth*100));}
 }
 function animate(now){frame=0;if(!visible||document.hidden||reduced?.matches)return;if(!hover&&!drag&&!scene.contains(document.activeElement)){yaw+=Math.min(now-last||16,48)*.00012;draw();}last=now;frame=requestAnimationFrame(animate);}
 function start(){scene.classList.toggle('is-motion-paused',!visible||document.hidden||!!reduced?.matches);if(!frame&&visible&&!document.hidden&&!reduced?.matches&&window.requestAnimationFrame){last=0;frame=requestAnimationFrame(animate);}}
 function stop(){if(frame)cancelAnimationFrame(frame);frame=0;scene.classList.add('is-motion-paused');}
 if(window.IntersectionObserver)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)start();else stop();}).observe(host);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();});reduced?.addEventListener?.('change',()=>{stop();start();});
 scene.addEventListener('pointerenter',()=>{hover=true;});scene.addEventListener('pointerleave',()=>{hover=false;});
 scene.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};scene.setPointerCapture?.(e.pointerId);scene.classList.add('is-dragging');});
 scene.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw+=(e.clientX-drag.x)*.008;pitch=Math.max(-1.2,Math.min(1.2,pitch-(e.clientY-drag.y)*.008));drag.x=e.clientX;drag.y=e.clientY;draw();});
 const release=()=>{drag=null;scene.classList.remove('is-dragging');};scene.addEventListener('pointerup',release);scene.addEventListener('pointercancel',release);scene.addEventListener('lostpointercapture',release);
 scene.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch-=.15;if(e.key==='ArrowDown')pitch+=.15;draw();});
 return {setFacts(facts){
  words.forEach(w=>w.el.remove());words=[];
  const list=Array.isArray(facts)?facts:[];
  list.forEach((f,i)=>{const el=document.createElement('span');el.className='chMemoryWord';el.tabIndex=0;const label=document.createElement('span');label.className='chMemoryWordText';label.textContent=String(f.label||'');el.append(label);el.title=[f.text,f.quote].filter(Boolean).join(' · ');el.style.fontSize=(14+Math.min(10,Math.max(1,Number(f.weight)||1))*1.2)+'px';
   const seed=[...String(f.id||f.text||f.label||i)].reduce((n,c)=>(Math.imul(n,31)+c.codePointAt(0))>>>0,0);
   el.style.setProperty('--word-hue',String(seed%360));el.style.setProperty('--word-duration',(3.6+seed%19/10)+'s');el.style.setProperty('--word-phase',(-seed%47/10)+'s');scene.append(el);
   const y=list.length===1?0:1-2*(i+.5)/list.length,r=Math.sqrt(1-y*y),a=i*Math.PI*(3-Math.sqrt(5));words.push({el,point:list.length===1?[0,0,1]:[Math.cos(a)*r,y,Math.sin(a)*r]});
  });draw();start();
 }};
};
})();
