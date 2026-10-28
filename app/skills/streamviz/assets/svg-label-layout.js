/* Reserve measured SVG bounds for line-chart labels, including saved reports. */
(() => {
  const tracked = new WeakSet();
  const repair = () => document.querySelectorAll('svg[viewBox]').forEach(svg => {
    if (tracked.has(svg) || !svg.querySelector('polyline') || !svg.querySelector('text') || typeof svg.getBBox !== 'function') return;
    const original = svg.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number);
    if (original.length !== 4 || !original.every(Number.isFinite) || original[2] <= 0 || original[3] <= 0) return;
    tracked.add(svg);
    const layout = () => {
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
