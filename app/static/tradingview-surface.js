// Keep the provider's own card and intrinsic dimensions, without host chrome.
(() => {
  const naturalWidgets = new Set(['single-ticker','tickers','ticker-tape','symbol-info','ticker-tag','market-summary','world-market-summary','forex-table','broker-rating','broker-reviews','company-profile']);
  window.installTradingViewSurface = (frame, onHeight) => {
    frame.tradingViewSurfaceCleanup?.();
    const doc = frame.contentDocument, win = frame.contentWindow;
    const config = doc?.querySelector('#tv-config');
    if (!config) return false;
    let spec;
    try { spec = JSON.parse(config.textContent); } catch { return false; }
    const main = doc.querySelector('main'), stage = doc.querySelector('.stage'), mount = doc.querySelector('#mount');
    if (!main || !stage || !mount) return false;
    doc.documentElement.dataset.tradingviewSurface = 'true';
    frame.closest('.widgetCard')?.classList.add('is-tradingview');
    // This historical rule overrode the native iframe's explicit pixel height.
    const footerStyle = doc.querySelector('[data-tv-host-footer]');
    if (footerStyle) footerStyle.textContent = 'main>footer,.tradingview-widget-copyright{display:none!important}';
    let style = doc.querySelector('[data-tv-surface]');
    if (!style) { style = doc.createElement('style'); style.dataset.tvSurface = ''; doc.head.append(style); }
    style.textContent = `
html[data-tradingview-surface] main{border:0!important;border-radius:0!important;background:transparent!important;padding:0!important;margin:0!important}
html[data-tradingview-surface] main>header,html[data-tradingview-surface] main>footer{display:none!important}
html[data-tradingview-surface] #mount iframe{display:block;border:0}
html[data-tradingview-surface]:not([data-tv-intrinsic]) .tradingview-widget-container__widget,html[data-tradingview-surface]:not([data-tv-intrinsic]) .tradingview-widget-container>iframe{height:100%!important}
html[data-tv-intrinsic],html[data-tv-intrinsic] body{height:auto!important;min-height:0!important;overflow:hidden}
html[data-tv-intrinsic] main,html[data-tv-intrinsic] .stage,html[data-tv-intrinsic] #mount,html[data-tv-intrinsic] .tradingview-widget-container,html[data-tv-intrinsic] .tradingview-widget-container__widget{height:auto!important;min-height:0!important;flex:none!important}
html[data-tv-intrinsic] .stage{min-height:var(--tv-loading-height,0px)!important}
html[data-tv-intrinsic] #mount ${spec.format === 'web-component' ? spec.tag : '.tradingview-widget-container__widget'}{height:auto!important;min-height:0!important}
`;
    const intrinsic = naturalWidgets.has(spec.widget);
    if (intrinsic) doc.documentElement.dataset.tvIntrinsic = 'true';
    const observed = new WeakSet();
    let scheduled = false, lastHeight = 0;
    const measure = () => {
      scheduled = false;
      if (!frame.isConnected) return;
      const native = spec.format === 'web-component' ? mount.querySelector(spec.tag) : mount.querySelector('iframe');
      if (native && resizeObserver && !observed.has(native)) { observed.add(native); resizeObserver.observe(native); }
      const nativeHeight = native?.getBoundingClientRect().height || 0;
      // Never collapse the loading/error/retry UI while a remote script is pending.
      const pending = !doc.querySelector('#state')?.hidden;
      stage.style.setProperty('--tv-loading-height', intrinsic && (pending || nativeHeight < 1) ? '120px' : '0px');
      const height = Math.ceil(main.getBoundingClientRect().height);
      if (height > 0 && Math.abs(height - lastHeight) > 1) {
        lastHeight = height;
        if (onHeight) onHeight(height, intrinsic);
        else if (Math.abs(frame.getBoundingClientRect().height - height) > 1) frame.style.height = height + 'px';
      }
    };
    const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(measure); } };
    const resizeObserver = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
    resizeObserver?.observe(main);
    const mutations = new win.MutationObserver(schedule);
    mutations.observe(mount, { childList:true, subtree:true, attributes:true, attributeFilter:['style','height','class'] });
    const state = doc.querySelector('#state');
    if (state) mutations.observe(state, { attributes:true, attributeFilter:['hidden'], childList:true });
    frame.tradingViewSurfaceCleanup = () => { resizeObserver?.disconnect(); mutations.disconnect(); };
    measure();
    return true;
  };
})();
