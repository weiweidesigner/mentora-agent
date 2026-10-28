/* SVG viewBox scales shapes; chart text retains its authored CSS-pixel size. */
(() => {
  const tracked=new WeakSet();
  const repair=()=>document.querySelectorAll('svg[viewBox]').forEach(svg=>{
    if(tracked.has(svg)||!svg.querySelector('polyline[points],rect')||typeof svg.getScreenCTM!=='function')return;
    const texts=[...svg.querySelectorAll('text')];
    if(!texts.length)return;
    tracked.add(svg);
    const labels=[...svg.querySelectorAll('text,tspan[font-size],tspan[style*="font-size"]')].map(node=>({node,size:Math.max(11,parseFloat(getComputedStyle(node).fontSize)||11)}));
    const originalMin=parseFloat(svg.style.minWidth)||0;
    const rows=new Map();
    const box=svg.viewBox.baseVal;
    for(const text of texts){
      const x=Number(text.getAttribute('x')),y=Number(text.getAttribute('y'));
      if(!text.hasAttribute('x')||!text.hasAttribute('y')||text.closest('[transform]')||!Number.isFinite(x+y)||y<box.y+box.height*.75)continue;
      const key=Math.round(y);if(!rows.has(key))rows.set(key,[]);rows.get(key).push({text,x});
    }
    let scheduled=false;
    const layout=()=>{
      scheduled=false;
      for(const {node,size} of labels){
        const matrix=node.getScreenCTM?.();
        const scale=matrix&&Math.hypot(matrix.c,matrix.d);
        if(!scale||!Number.isFinite(scale))continue;
        const value=size/scale;
        if(Math.abs(parseFloat(node.style.fontSize)-value)>.01||!node.style.fontSize)node.style.setProperty('font-size',value.toFixed(4)+'px','important');
      }
      // Keep every date tick. Dense axes scroll locally instead of overlapping
      // labels or making the page wider on mobile.
      let minimum=originalMin;
      for(const row of rows.values()){
        if(row.length<3)continue;
        row.sort((a,b)=>a.x-b.x);
        for(let i=1;i<row.length;i++){
          const a=row[i-1],b=row[i],gap=b.x-a.x;if(gap<=0)continue;
          const anchor=t=>getComputedStyle(t).textAnchor;
          const aw=a.text.getBoundingClientRect().width,bw=b.text.getBoundingClientRect().width;
          const right=anchor(a.text)==='end'?0:anchor(a.text)==='middle'?aw/2:aw;
          const left=anchor(b.text)==='start'?0:anchor(b.text)==='middle'?bw/2:bw;
          minimum=Math.max(minimum,(right+left+8)/gap*svg.viewBox.baseVal.width);
        }
      }
      if(minimum>originalMin){
        const value=Math.ceil(minimum)+'px';if(svg.style.minWidth!==value)svg.style.minWidth=value;
        if(svg.parentElement){svg.parentElement.style.minWidth='0';svg.parentElement.style.overflowX='auto';}
      }
    };
    const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(layout);}};
    layout();document.fonts?.ready.then(schedule);
    if(typeof ResizeObserver==='function')new ResizeObserver(schedule).observe(svg);
  });
  const schedule=()=>requestAnimationFrame(repair);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
