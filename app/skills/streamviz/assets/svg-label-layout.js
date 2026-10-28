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
    const layout = () => {
      if (labels.length) {
        const right = Math.max(endX,...labels.map(text => { const b=text.getBBox(); return b.x+b.width+8; }));
        for (const line of grid) line.setAttribute('x2',String(right));
      }
      let bounds;
      try { bounds = svg.getBBox(); } catch { return; }
      if (!bounds.width || !bounds.height) return;
      const [x,y,width,height] = original;
      const left = Math.min(x,bounds.x-4), top = Math.min(y,bounds.y-4);
      const right = Math.max(x+width,bounds.x+bounds.width+4);
      const bottom = Math.max(y+height,bounds.y+bounds.height+4);
      if (left < x || top < y || right > x+width || bottom > y+height) {
        svg.setAttribute('viewBox',[left,top,right-left,bottom-top].join(' '));
        svg.dataset.svLineLabelLayout = 'true';
      }
    };
    layout();
    document.fonts?.ready.then(layout);
    if (typeof ResizeObserver === 'function') new ResizeObserver(layout).observe(svg);
  });
  const schedule = () => requestAnimationFrame(repair);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();
})();
