/* Include endpoint labels inside the line plot, extending its grid and axes. */
(() => {
  const tracked = new WeakSet();
  const repair = () => document.querySelectorAll('svg[viewBox]').forEach(svg => {
    if (tracked.has(svg) || !svg.querySelector('polyline') || !svg.querySelector('text') || typeof svg.getBBox !== 'function') return;
    const original = svg.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number);
    if (original.length !== 4 || !original.every(Number.isFinite) || original[2] <= 0 || original[3] <= 0) return;
    tracked.add(svg);
    // Only extend a shared horizontal plot boundary. Series coordinates and
    // date ticks keep their original positions; the new space is a label lane.
    const polylines = [...svg.querySelectorAll('polyline[points]')];
    const series = polylines.map(line => line.getAttribute('points').trim().split(/[,\s]+/).map(Number));
    const endX = series[0]?.at(-2);
    const sharedEnd = Number.isFinite(endX) && series.every(points =>
      points.length >= 4 && points.every(Number.isFinite) && Math.abs(points.at(-2)-endX)<1 &&
      points.filter((_,i)=>i%2===0).every(x=>x<=endX+1));
    const untransformed = node => !node.closest('[transform]');
    const grid = sharedEnd ? [...svg.querySelectorAll('line')].filter(line =>
      untransformed(line) && Math.abs(Number(line.getAttribute('y1'))-Number(line.getAttribute('y2')))<0.01 &&
      Math.abs(Number(line.getAttribute('x2'))-endX)<1 && Number(line.getAttribute('x1'))<endX) : [];
    const labels = grid.length ? [...svg.querySelectorAll('text')].filter(text =>
      untransformed(text) && typeof text.getBBox === 'function' && text.getBBox().x>=endX-1) : [];
    let scheduled=false;
    const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;layout();});}};
    const layout = () => {
      if (labels.length) {
        const right = Math.max(endX,...labels.map(text => { const b=text.getBBox(); return b.x+b.width+8; }));
        for (const line of grid) line.setAttribute('x2',String(right));
      }
      let bounds;
      try { bounds = svg.getBBox(); } catch { return; }
      if (!bounds.width || !bounds.height) return;
      const [x,y,width,height] = original;
      const component=svg.closest('.card,.panel,.sv-card,[data-sv-card]');
      const open=component?component.dataset.svUnframed==='true':Boolean(svg.closest('[data-aime-streamviz-root],[data-visualize-root]'));
      const matrix=svg.getScreenCTM?.();
      const scale=matrix&&Math.hypot(matrix.a,matrix.b);
      const inset=scale?1/scale:1;
      // A borderless plot starts at its first visible glyph, not the original
      // viewBox's unused gutter. Preserve one pixel for antialiasing/strokes.
      const left=open?bounds.x-inset:Math.min(x,bounds.x-4);
      const top=Math.min(y,bounds.y-4);
      const right=open?bounds.x+bounds.width+inset:Math.max(x+width,bounds.x+bounds.width+4);
      const bottom = Math.max(y+height,bounds.y+bounds.height+4);
      const next=[left,top,right-left,bottom-top];
      const current=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
      if (next.some((value,index)=>Math.abs(value-current[index])>.02)) {
        svg.setAttribute('viewBox',next.join(' '));
        svg.dataset.svLineLabelLayout = 'true';
      }
    };
    layout();
    document.fonts?.ready.then(schedule);
    if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(svg);
    new MutationObserver(schedule).observe(svg,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
  });
  const schedule = () => requestAnimationFrame(repair);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();
})();
