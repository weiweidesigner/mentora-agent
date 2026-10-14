// Saved chart documents receive the same palette as their host before rendering.
(() => {
  const requested = new URLSearchParams(location.search).get("theme");
  let theme = requested === "dark" ? "dark" : "light";
  if (!requested) {
    try { theme = parent.document.documentElement.dataset.theme === "dark" ? "dark" : "light"; } catch {}
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  // SVG presentation attributes lose to the saved light-theme class rules.
  // Scope palette overrides to dark mode so the original light styles survive.
  const palette = document.createElement("style");
  palette.dataset.casePalette = "true";
  palette.textContent = `
svg circle:focus,svg [role="button"]:focus{outline:none!important;-webkit-tap-highlight-color:transparent}
.case-single-tab{display:none!important}
.intraday-tabs{display:none}
@media(max-width:720px){
 .component{height:auto!important;min-height:0!important}
 .stage,.trend-stage,.waterfall-stage{height:210px!important;min-height:0!important}
 .chart-panel .chart{height:190px!important;aspect-ratio:auto!important}
 .range-filter{height:48px!important;padding:5px 16px 6px!important;box-sizing:border-box}
 .range-shell,.time-range-shell{padding-inline:16px!important;box-sizing:border-box}
 .ring-stage{height:200px!important} .ring-stage svg{width:190px!important;height:190px!important}
 .intraday-card{min-width:0!important;width:100%;height:400px!important}
 .intraday-row{--columns:1;grid-auto-columns:100%!important;gap:10px}
 .intraday-tabs{display:flex!important;gap:6px;margin:4px 0 8px}
 .intraday-tabs button{border:0;border-radius:7px;padding:7px 10px;background:transparent;color:inherit;font:inherit;font-size:12px}
}


    .kline-title strong[data-business-title],[data-business-title] {font-size:18px!important;font-weight:700!important;line-height:1.4!important;letter-spacing:0!important;margin:0 0 8px!important;white-space:normal!important;overflow-wrap:anywhere;}
    @media(max-width:720px){.kline-title strong[data-business-title],[data-business-title]{font-size:16px!important}}
    .kline-component .kline-title strong[data-business-title]{margin:0!important}
    .kline-component .period-button{display:inline-flex;align-items:center;justify-content:center;line-height:1;margin:0}
    :root { --case-grip:#64748b; --case-handle-bg:#fff; --case-handle-border:#cbd5e1; --case-active-bg:#e4eaff; --case-active-text:#2450a8; --case-active-border:#8fa4df; }
    :root[data-theme="dark"] { --case-grip:#94a3b8; --case-handle-bg:#202b3a; --case-handle-border:#334052; --case-active-bg:#334052; --case-active-text:#f1f5f9; --case-active-border:#7186a1; }
    .range-shell,.time-range-shell,.brush { --handle-size:32px!important; --track-pad:16px!important; --track-height:3px!important; height:32px!important; margin-bottom:12px!important; }
    .range-handle,.time-range-handle,.brush .handle { width:32px!important; height:32px!important; background:var(--case-handle-bg)!important; border:1px solid var(--case-handle-border)!important; }
    .range-filter .range-track { height:32px!important; }
    .range-filter .range-handle,.range-filter .range-track::before,.range-filter .range-track-active { top:16px!important; }
    .range-handle::before,.time-range-handle::before,.brush .handle::before { width:2px!important; height:13px!important; background:var(--case-grip)!important; box-shadow:-5px 0 0 var(--case-grip),5px 0 0 var(--case-grip)!important; opacity:1!important; }
    .segmented button.active,.segment.active,.metric-tab.active,.tab.active,.waterfall-tab.active,.period-button.active,.seg-btn.active,.year-chip.selected,
    button[aria-selected="true"],.toggle.active,.yoy-btn.active { background:var(--case-active-bg)!important; color:var(--case-active-text)!important; box-shadow:inset 0 0 0 1px var(--case-active-border)!important; font-weight:700!important; }
    :root[data-theme="dark"] #title,
    :root[data-theme="dark"] .chart-title { color: #f1f5f9; }
    :root[data-theme="dark"] .axis-label,
    :root[data-theme="dark"] .x-label { fill: #c1cad7; }
    :root[data-theme="dark"] .grid-line { stroke: #2b3544; }
    :root[data-theme="dark"] .axis-line { stroke: #526176; }
    :root[data-theme="dark"] .legendItem,
    :root[data-theme="dark"] .timeLabel,
    :root[data-theme="dark"] #speedBtn,
    :root[data-theme="dark"] #empty { color: #c1cad7; }
    :root[data-theme="dark"] .bar-label { fill: #8294ff; }
    :root[data-theme="dark"] #radar circle[fill="none"] { stroke: #334052; stroke-width: 1; }
    :root[data-theme="dark"] #radar line { stroke: #334052; stroke-width: 1; }
    :root[data-theme="dark"] .segmented button[aria-selected="false"] { color:#a8b3c4; }
    :root[data-theme="dark"] #radar path { fill: rgba(255, 138, 24, .22); stroke-width: 3; }

  `;
  document.documentElement.appendChild(palette);

  const syncBody = () => {
    if (!document.body) return;
    if (document.querySelector('[data-business-theme-runtime],.kline-component,.multi-intraday')) {
      const heading = document.querySelector('h1:not(.company-name),h2:not(.panel-title):not(.section-title):not(.actions-title),.page-title,.component-title,.chart-title,.multi-title,#title,.pie-title,.waterfall-title,.title,.kline-title strong');
      if (heading) heading.dataset.businessTitle = 'true';
    }
    document.body.classList.toggle("theme-dark", theme === "dark");
    document.body.classList.toggle("theme-light", theme === "light");
  };
  const observer = new MutationObserver(() => {
    if (document.body) { syncBody(); observer.disconnect(); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", syncBody, { once: true });
  syncBody();

  const prepareMobileControls = () => {
    document.querySelectorAll('.period-tabs,.segmented,.metric-tabs,.top-tabs,.chart-tabs').forEach(tabs => {
      const buttons = tabs.querySelectorAll('button');
      tabs.classList.toggle('case-single-tab', buttons.length === 1);
    });
    if (!document.querySelector('[data-business-theme-runtime],.kline-component,.multi-intraday')) return;
    document.querySelectorAll('svg').forEach(svg => {
      if (svg.dataset.businessSwipe || svg.onpointermove || !svg.querySelector('.hover-zone,.hit,.hit-area')) return;
      svg.dataset.businessSwipe='true';
      svg.style.touchAction='pan-y';
      let start=null;
      svg.addEventListener('pointerdown', event => {if(event.pointerType==='touch')start={x:event.clientX,y:event.clientY};});
      svg.addEventListener('pointermove', event => {
        if(event.pointerType!=='touch'||!start)return;
        const dx=Math.abs(event.clientX-start.x),dy=Math.abs(event.clientY-start.y);
        if(dy>6 && dy>dx){svg.dispatchEvent(new MouseEvent('mouseleave',{bubbles:false}));return;}
        const zones=[...svg.querySelectorAll('.hover-zone,.hit,.hit-area')].filter(e=>e.getBoundingClientRect().width>0);
        const nearest=zones.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return Math.abs(ar.left+ar.width/2-event.clientX)-Math.abs(br.left+br.width/2-event.clientX);})[0];
        if(nearest){const pos={clientX:event.clientX,clientY:event.clientY,bubbles:false};nearest.dispatchEvent(new MouseEvent('mouseenter',pos));nearest.dispatchEvent(new MouseEvent('mousemove',pos));nearest.dispatchEvent(new PointerEvent('pointerenter', {...pos,pointerType:'mouse'}));}
      });
      const end=()=>{start=null;};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
    });
  };
  const initControls = () => {
    const row=document.querySelector('.intraday-row');
    if(row && !document.querySelector('.intraday-tabs')) {
      const tabs=document.createElement('nav');tabs.className='intraday-tabs';tabs.setAttribute('aria-label','分时股票');
      [...row.children].forEach((card,i)=>{const button=document.createElement('button');button.type='button';button.textContent=card.querySelector('iframe')?.title.split(' ')[0]||String(i+1);button.setAttribute('aria-selected',String(i===0));button.addEventListener('click',()=>{row.scrollTo({left:card.offsetLeft-row.offsetLeft,behavior:'smooth'});[...tabs.children].forEach((b,n)=>b.setAttribute('aria-selected',String(n===i)));});tabs.append(button);});row.before(tabs);
      row.addEventListener('scroll',()=>{const index=Math.round(row.scrollLeft/Math.max(1,row.clientWidth+10));[...tabs.children].forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)));},{passive:true});
    }
    prepareMobileControls();let pending=false;
    new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;prepareMobileControls();});}).observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initControls,{once:true});else initControls();
})();
