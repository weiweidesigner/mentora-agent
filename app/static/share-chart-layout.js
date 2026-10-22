/* Share preview and image export retain the conversation's intrinsic chart size. */
(() => {
  function resizeFrame(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      const canvas = doc.querySelector('.report-canvas');
      const intrinsic = doc.querySelector('.multi-kline, .kline-component, [data-timeline-container="true"], #wrap, .component-root, .chart-container, main');
      const canvasRect = canvas?.getBoundingClientRect();
      const intrinsicRect = intrinsic?.getBoundingClientRect();
      const height = canvasRect?.height > 80 ? Math.ceil(canvasRect.bottom)
        : intrinsicRect?.height > 0 ? Math.ceil(intrinsicRect.height)
        : Math.ceil(Math.max(doc.body.scrollHeight, doc.body.offsetHeight, doc.documentElement.scrollHeight, doc.documentElement.offsetHeight));
      frame.style.minHeight = '0';
      if (Math.abs(frame.getBoundingClientRect().height - height) > 2) frame.style.height = `${height}px`;
    } catch { /* Cross-origin embeds retain their configured height. */ }
  }
  window.resizeShareCharts = () => document.querySelectorAll('.reportDocumentFrame').forEach(resizeFrame);
  document.querySelectorAll('.reportDocumentFrame').forEach(frame => {
    const resize = () => resizeFrame(frame);
    frame.addEventListener('load', () => {
      resize();
      if (frame.contentDocument?.body && 'ResizeObserver' in window) {
        new ResizeObserver(resize).observe(frame.contentDocument.body);
      }
    }, {once:true});
  });
  window.addEventListener('load', window.resizeShareCharts);
  [80, 300, 900].forEach(delay => setTimeout(window.resizeShareCharts, delay));
})();
