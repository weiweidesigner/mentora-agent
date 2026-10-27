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


// Repair confidently identified ranked bars, including legacy generated SVGs.
// Keep every supplied mark/value; change only text placement and canvas bounds.
(() => {
  const repair = () => document.querySelectorAll('svg[viewBox]:not([data-sv-bar-layout])').forEach(svg => {
    if (typeof svg.getBBox !== 'function') return;
    const box=svg.viewBox.baseVal;
    if (!box.width || !box.height) return;
    const bars=[...svg.querySelectorAll('rect')].filter(r=>r.width.baseVal.value>0 && r.height.baseVal.value>0);
    if (bars.length<3 || bars.some(r=>r.height.baseVal.value>box.height/5)) return;
    const rows=bars.map(bar=>({bar,x:bar.x.baseVal.value,y:bar.y.baseVal.value,w:bar.width.baseVal.value,h:bar.height.baseVal.value}));
    if (rows.some((r,i)=>rows.some((q,j)=>j!==i && Math.abs(r.y-q.y)<Math.max(r.h,q.h)))) return;
    const zero=[rows[0].x,rows[0].x+rows[0].w].find(x=>rows.every(r=>Math.abs(r.x-x)<1 || Math.abs(r.x+r.w-x)<1));
    if (zero===undefined) return;
    const texts=[...svg.querySelectorAll('text')];
    for (const row of rows) {
      const near=texts.filter(t=>{const y=t.y.baseVal[0]?.value;return y>=row.y && y<=row.y+row.h+2;});
      // A shared category column just before zero plus one value per row.
      row.category=near.find(t=>Math.abs((t.x.baseVal[0]?.value??Infinity)-(zero-10))<8);
      row.value=near.find(t=>t!==row.category);
      if (!row.category || !row.value || near.length!==2) return;
    }
    svg.dataset.svBarLayout='true';
    let left=Math.min(...rows.map(r=>r.x));
    for (const row of rows) {
      const positive=Math.abs(row.x-zero)<1;
      row.value.setAttribute('x',String(positive?row.x+row.w+8:row.x-8));
      row.value.setAttribute('text-anchor',positive?'start':'end');
      const bounds=row.value.getBBox();left=Math.min(left,bounds.x);
    }
    for (const row of rows) row.category.setAttribute('x',String(left-12));
    const bounds=svg.getBBox();
    if (bounds.width>0 && bounds.height>0) {
      const x=Math.min(box.x,bounds.x-8),y=Math.min(box.y,bounds.y-8);
      const right=Math.max(box.x+box.width,bounds.x+bounds.width+8),bottom=Math.max(box.y+box.height,bounds.y+bounds.height+8);
      svg.setAttribute('viewBox',[x,y,right-x,bottom-y].join(' '));
      // On narrow screens scroll the chart locally rather than shrink labels.
      svg.style.minWidth=Math.ceil(right-x)+'px';
      if(svg.parentElement){svg.parentElement.style.minWidth='0';svg.parentElement.style.overflowX='auto';}

    }
  });
  const schedule=()=>requestAnimationFrame(repair);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  document.fonts?.ready.then(schedule);
})();
