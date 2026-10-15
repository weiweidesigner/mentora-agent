/* Keep SVG geometry responsive while labels and endpoint markers retain pixel dimensions. */
(() => {
  const repair = () => document.querySelectorAll('.chartbox svg[viewBox][preserveAspectRatio="none"]:not([data-sv-geometry])').forEach(svg => {
    if (!svg.matches('.line,.hist,.xlab')) return;
    const original=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
    if(original.length!==4||!original.every(Number.isFinite))return;
    svg.dataset.svGeometry='true';
    if(svg.matches('.hist'))svg.style.height='clamp(260px,26vw,360px)';
    if(svg.matches('.line'))svg.style.height='clamp(260px,28vw,380px)';
    const wrap=document.createElement('div');wrap.className='sv-geometry';
    Object.assign(wrap.style,{position:'relative',width:'100%',minWidth:svg.closest('.chartbox').querySelector('.hist')?'624px':'0'});
    svg.before(wrap);wrap.append(svg);
    svg.closest('.chartbox').style.overflowX='auto';
    const labels=[...svg.querySelectorAll(':scope > text')].map(text=>{
      const label=document.createElement('span');label.textContent=text.textContent;
      const anchor=text.getAttribute('text-anchor')||'start';
      Object.assign(label.style,{position:'absolute',fontSize:parseFloat(text.getAttribute('font-size')||'12')+'px',lineHeight:'1',whiteSpace:'nowrap',pointerEvents:'none',color:text.getAttribute('fill')||'var(--sv-text-secondary)',transform:`translate(${anchor==='middle'?'-50%':anchor==='end'?'-100%':'0'},-80%)`});
      wrap.append(label);text.remove();return {label,x:Number(text.getAttribute('x')),y:Number(text.getAttribute('y'))};
    });
    const dots=[...svg.querySelectorAll(':scope > circle')].map(circle=>{
      const dot=document.createElement('span');Object.assign(dot.style,{position:'absolute',width:'7px',height:'7px',borderRadius:'50%',background:circle.getAttribute('fill'),transform:'translate(-50%,-50%)',pointerEvents:'none'});
      wrap.append(dot);circle.remove();return {label:dot,x:Number(circle.getAttribute('cx')),y:Number(circle.getAttribute('cy'))};
    });
    let minY=original[1];
    for(const line of svg.querySelectorAll('polyline[points]'))for(const point of line.getAttribute('points').trim().split(/\s+/)){const y=Number(point.split(',')[1]);if(Number.isFinite(y))minY=Math.min(minY,y);}
    // The saved report's x labels are siblings rather than children of .xl.
    const external=svg.matches('.line')?svg.closest('.chartbox').nextElementSibling:null;
    const xlabels=external?.matches('.xl')?[...external.querySelectorAll('span')].map(label=>({label,x:parseFloat(label.style.left)/100*original[2]})):[];
    const layout=()=>{
      const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;
      const dx=5*original[2]/rect.width,dy=svg.matches('.xlab')?0:8*original[3]/rect.height;
      const box=[original[0]-dx,minY-dy,original[2]+2*dx,original[1]+original[3]-minY+2*dy];
      svg.setAttribute('viewBox',box.join(' '));
      for(const {label,x,y} of [...labels,...dots]){label.style.left=(x-box[0])/box[2]*100+'%';label.style.top=(y-box[1])/box[3]*100+'%';}
      for(const {label,x} of xlabels)label.style.left=(x-box[0])/box[2]*100+'%';
    };
    layout();if(typeof ResizeObserver==='function')new ResizeObserver(layout).observe(wrap);
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',repair,{once:true});else repair();
})();
