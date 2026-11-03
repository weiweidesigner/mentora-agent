(() => {
'use strict';
window.MentoraMemorySphere = function(host) {
 const ns='http://www.w3.org/2000/svg';
 const scene=document.createElement('div');scene.className='chMemorySphere chMemoryNebula is-motion-paused';scene.tabIndex=0;scene.setAttribute('role','group');scene.setAttribute('aria-label','记忆星云，可拖动或用方向键旋转');
 const grid=document.createElementNS(ns,'svg');grid.setAttribute('viewBox','-180 -180 360 360');grid.setAttribute('aria-hidden','true');grid.classList.add('chSphereGrid');
 grid.classList.add('chNebulaField');
 const mist=document.createElement('div');mist.className='chNebulaMist';mist.setAttribute('aria-hidden','true');scene.append(mist);
 const dots=Array.from({length:240},(_,i)=>{
  const t=(i+.5)/240,r=Math.sqrt(t),arm=i%3,angle=r*5.8+arm*Math.PI*2/3;
  const scatter=Math.sin(i*127.1)*.12*(.3+r),depth=Math.cos(i*31.7)*.32;
  const el=document.createElementNS(ns,'circle');el.setAttribute('r',i%19===0?'1.6':i%7===0?'1':'.55');el.classList.add('chSphereDot');el.style.setProperty('--star-hue',String(190+i%85));grid.append(el);
  return {el,point:[Math.cos(angle)*r+scatter,Math.sin(angle)*r*.7+Math.cos(i*67.3)*.08,depth],light:.35+(Math.sin(i*43.1)+1)*.3};
 });scene.append(grid);host.replaceChildren(scene);
 let words=[],yaw=.3,pitch=-.2,frame=0,last=0,visible=!window.IntersectionObserver,hover=false,drag=null;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const project=(x,y,z)=>{const a=x*Math.cos(yaw)-y*Math.sin(yaw),b=x*Math.sin(yaw)+y*Math.cos(yaw);return [a,b*Math.cos(pitch)-z*Math.sin(pitch),z*Math.cos(pitch)+b*Math.sin(pitch)];};
 function draw(){
  for(const dot of dots){const [x,y,z]=project(...dot.point);dot.el.setAttribute('cx',String(x*145));dot.el.setAttribute('cy',String(y*145));dot.el.style.opacity=String(dot.light*(.65+(z+1)*.15));}
  for(const w of words){const [x,y,z]=project(...w.point),depth=(z+1)/2;w.el.style.left=(50+x*39)+'%';w.el.style.top=(50+y*39)+'%';w.el.style.transform=`translate(-50%,-50%) scale(${.72+depth*.32})`;w.el.style.opacity=String(.28+depth*.72);w.el.style.zIndex=String(1+Math.round(depth*100));}
 }
 function animate(now){frame=0;if(!visible||document.hidden||reduced?.matches)return;if(!hover&&!drag&&!scene.contains(document.activeElement)){yaw+=Math.min(now-last||16,48)*.000035;draw();}last=now;frame=requestAnimationFrame(animate);}
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
   const a=i*Math.PI*(3-Math.sqrt(5))-.7,r=.38+.4*Math.sqrt((i+.5)/list.length);words.push({el,point:list.length===1?[0,0,.4]:[Math.cos(a)*r,Math.sin(a)*r*.8,Math.cos(a)*.3]});
  });draw();start();
 }};
};
})();
