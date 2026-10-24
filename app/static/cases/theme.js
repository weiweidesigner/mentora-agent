// Saved chart documents receive the same palette as their host before rendering.
(() => {
  document.documentElement.style.webkitTapHighlightColor = "transparent";
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
  palette.textContent += `
:root{--mtr-segment-bg:#f3f3f3;--mtr-segment-border:#e7e7e7;--mtr-segment-text:#777;--mtr-segment-hover:#e9e9e9;--mtr-segment-active:#fff;--mtr-segment-ink:#242424;--mtr-segment-shadow:0 1px 3px #0000000d}
:root[data-theme="dark"]{--mtr-segment-bg:#191919;--mtr-segment-border:#303030;--mtr-segment-text:#a0a0a0;--mtr-segment-hover:#262626;--mtr-segment-active:#343434;--mtr-segment-ink:#f3f3f3;--mtr-segment-shadow:0 1px 3px #00000033}
.segmented{display:inline-flex!important;align-items:center!important;gap:2px!important;padding:2px!important;min-height:32px!important;height:auto!important;border:1px solid var(--mtr-segment-border)!important;border-radius:9px!important;background:var(--mtr-segment-bg)!important;box-shadow:none!important}
.segmented>:is(button,.segment){display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:26px!important;height:auto!important;margin:0!important;padding:4px 13px!important;border:0!important;border-radius:6px!important;background:transparent!important;color:var(--mtr-segment-text)!important;font-size:12px!important;line-height:18px!important;font-weight:500!important;white-space:nowrap!important;box-shadow:none!important;cursor:pointer;transition:background .14s ease,color .14s ease}
.segmented>:is(button,.segment):hover{background:var(--mtr-segment-hover)!important;color:var(--mtr-segment-ink)!important}
.segmented>:is(button,.segment):is(.active,.selected,[aria-selected="true"],[aria-pressed="true"]){background:var(--mtr-segment-active)!important;color:var(--mtr-segment-ink)!important;box-shadow:var(--mtr-segment-shadow)!important;font-weight:600!important}
:root[data-theme="dark"] .segmented button[aria-selected="false"]{color:var(--mtr-segment-text)!important}
.segmented>:is(button,.segment):focus-visible{outline:2px solid var(--mtr-segment-text)!important;outline-offset:2px!important}
@media(prefers-reduced-motion:reduce){.segmented>:is(button,.segment){transition:none!important}}
`;
  // Updated business documents own their native controls and palette.
  if (!document.documentElement.dataset.businessUi) document.documentElement.appendChild(palette);

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
    if(row && !document.querySelector('.multi-intraday[data-mobile-columns]') && !document.querySelector('.intraday-tabs')) {
      const tabs=document.createElement('nav');tabs.className='intraday-tabs';tabs.setAttribute('aria-label','分时股票');
      [...row.children].forEach((card,i)=>{const button=document.createElement('button');button.type='button';button.textContent=card.querySelector('iframe')?.title.split(' ')[0]||String(i+1);button.setAttribute('aria-selected',String(i===0));button.addEventListener('click',()=>{row.scrollTo({left:card.offsetLeft-row.offsetLeft,behavior:'smooth'});[...tabs.children].forEach((b,n)=>b.setAttribute('aria-selected',String(n===i)));});tabs.append(button);});row.before(tabs);
      row.addEventListener('scroll',()=>{const index=Math.round(row.scrollLeft/Math.max(1,row.clientWidth+10));[...tabs.children].forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)));},{passive:true});
    }
    prepareMobileControls();let pending=false;
    new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;prepareMobileControls();});}).observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initControls,{once:true});else initControls();
})();

/* Trade-flow distribution: names stay intact; amounts follow the bar ends. */
(() => {
  const root=document.documentElement;
  if(root.dataset.mentoraFlowLabels)return;
  root.dataset.mentoraFlowLabels='true';
  const style=document.createElement('style');
  style.dataset.flowBarLabels='true';
  style.textContent=`
.flow-summary .bars[data-flow-bar-labels]{
  grid-template-columns:minmax(0,1fr) max-content minmax(0,1fr)!important;
  column-gap:10px!important;padding-inline:64px;box-sizing:border-box;min-width:0
}
.flow-summary .bars[data-flow-bar-labels]>.size-label{white-space:nowrap!important;min-width:3em;line-height:1.4}
.flow-summary .bars[data-flow-bar-labels]>.flowbar{position:relative;min-width:0}
.flow-summary .bars[data-flow-bar-labels]>.flowbar>.bar-value{
  position:absolute!important;top:50%;transform:translateY(-50%);
  display:block;width:max-content!important;height:auto!important;min-width:0;
  margin:0;padding:0;line-height:1.4;white-space:nowrap!important;
  background:transparent!important;pointer-events:none
}
.flow-summary .bars[data-flow-bar-labels]>.in>.in-value{right:calc(var(--flow-bar-size) + 8px);text-align:right}
.flow-summary .bars[data-flow-bar-labels]>.out>.out-value{left:calc(var(--flow-bar-size) + 8px);text-align:left}
@media(max-width:520px){
 .flow-summary .bars[data-flow-bar-labels]{padding-inline:56px;column-gap:8px!important}
}
`;
  document.head.append(style);
  const repair=()=>{
    document.querySelectorAll('.flow-summary .bars').forEach(group=>{
      const values=Array.from(group.querySelectorAll(':scope > .in-value,:scope > .out-value'));
      if(!values.length)return;
      for(const value of values){
        const inward=value.classList.contains('in-value');
        const bar=inward?value.nextElementSibling:value.previousElementSibling;
        if(!bar?.matches(inward?'.flowbar.in':'.flowbar.out'))continue;
        const fill=bar.querySelector(':scope > span:not(.bar-value)');
        const size=Number.parseFloat(fill?.style.width);
        if(!Number.isFinite(size))continue;
        bar.style.setProperty('--flow-bar-size',Math.max(0,Math.min(100,size))+'%');
        bar.append(value);
        group.dataset.flowBarLabels='true';
      }
    });
  };
  const start=()=>{
    repair();
    let pending=false;
    new MutationObserver(()=>{
      if(pending)return;pending=true;
      requestAnimationFrame(()=>{pending=false;repair();});
    }).observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

/* Generic chart typography contract: axis/legend 13, tooltip 14/title 13. */
(() => {
  if(document.querySelector('[data-generic-chart-typography]'))return;
  const style=document.createElement('style');
  style.dataset.genericChartTypography='20261024';
  style.textContent=`
.axis-label,.x-label,.waterfall-component svg text{font-size:13px!important;font-weight:400!important}
:is(.chart-legend,.pie-legend,.ring-legend,.treemap-legend,.waterfall-legend),
#legend .legendItem,.mobileDynamicLegend button{font-size:13px!important;line-height:1.4!important}
:is(.chart-legend,.pie-legend,.ring-legend,.treemap-legend),#legend{background:transparent!important;box-shadow:none!important}
:is(.chart-tooltip,.generic-canvas-tooltip,.pie-tooltip,.ring-tooltip,.treemap-tooltip,.waterfall-tooltip){
 font-size:14px!important;line-height:1.55!important;padding:11px 14px!important;border-radius:6px!important;
 max-width:min(280px,calc(100vw - 24px))!important;box-shadow:none!important;filter:none!important
}
.chart-tooltip .tooltip-title,.chart-tooltip>strong{font-size:13px!important;line-height:1.45!important;font-weight:500!important;margin-bottom:4px!important}
.chart-tooltip .tooltip-body{column-gap:16px!important;row-gap:6px!important}
.chart-tooltip :is(.tooltip-label,.tooltip-value,.tooltip-row b){font-size:14px!important}
.chart-tooltip .tooltip-value{font-weight:650!important;font-variant-numeric:tabular-nums}
.chart-tooltip .tooltip-dot{width:8px!important;height:8px!important;flex-shrink:0}
:root[data-theme="dark"] :is(.chart-tooltip,.generic-canvas-tooltip,.pie-tooltip,.ring-tooltip,.treemap-tooltip,.waterfall-tooltip){
 --chart-tooltip-bg:#3b3b3b!important;--tooltip-bg:#3b3b3b!important;background:#3b3b3b!important;color:#fff!important;border-color:transparent!important
}
:root[data-theme="dark"] :is(.chart-tooltip,.waterfall-tooltip)::after{border-top-color:#3b3b3b!important}
:root[data-theme="dark"] :is(.pie-tooltip,.ring-tooltip)::after{background:#3b3b3b!important}
`;
  (document.head||document.documentElement).append(style);
})();

(()=>{const s=document.createElement('style');s.dataset.genericTooltipPortals='true';s.textContent="\n/* Tooltip portals must use the same contract as their chart document. */\n:is(.group-line-tooltip-portal,.bar-line-tooltip-portal,.bar-chart-tooltip-portal,.grouped-bar-tooltip-portal,.generic-local-tooltip-portal){font-size:14px!important;line-height:1.55!important;padding:11px 14px!important;max-width:min(280px,calc(100vw - 24px))!important;border-radius:6px!important;background:#3b3b3b!important;color:#fff!important;box-shadow:none!important}\n:is(.group-line-tooltip-portal,.bar-line-tooltip-portal,.bar-chart-tooltip-portal,.grouped-bar-tooltip-portal,.generic-local-tooltip-portal) .tooltip-title{font-size:13px!important;line-height:1.45!important;font-weight:500!important;margin-bottom:4px!important}\n:is(.group-line-tooltip-portal,.bar-line-tooltip-portal,.bar-chart-tooltip-portal,.grouped-bar-tooltip-portal,.generic-local-tooltip-portal) .tooltip-body{column-gap:16px!important;row-gap:6px!important}\n:is(.group-line-tooltip-portal,.bar-line-tooltip-portal,.bar-chart-tooltip-portal,.grouped-bar-tooltip-portal,.generic-local-tooltip-portal) :is(.tooltip-label,.tooltip-value,.tooltip-row b){font-size:14px!important;line-height:1.55!important}\n:is(.group-line-tooltip-portal,.bar-line-tooltip-portal,.bar-chart-tooltip-portal,.grouped-bar-tooltip-portal,.generic-local-tooltip-portal) .tooltip-dot{width:8px!important;height:8px!important;flex-shrink:0}\n:is(.group-line-tooltip-portal,.bar-line-tooltip-portal,.bar-chart-tooltip-portal,.grouped-bar-tooltip-portal,.generic-local-tooltip-portal) .tooltip-arrow{border-top-color:#3b3b3b!important}\n";(document.head||document.documentElement).append(s);})();

(function(){if(document.querySelector("style[data-neutral-report-tables]"))return;var s=document.createElement("style");s.dataset.neutralReportTables="true";s.textContent="\n/* Neutral dark report tables, including saved StreamViz artifacts. */\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) :is(.sv-table-wrap,.table-wrap){background:transparent!important;border:1px solid #2c2c2c!important;border-radius:10px!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) table{background:transparent!important;color:#d4d4d4}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) table thead tr th{background:#1c1c1c!important;color:#e4e4e4!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) table :is(thead,tbody) tr :is(th,td){border-color:#2c2c2c!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) :is(tbody,tr,td){background:transparent!important}\n";(document.head||document.documentElement).append(s);})();
