/* Embedded reports inherit the host palette; they do not own a second switch. */
(() => {
  const theme=document.currentScript?.dataset.artifactHostTheme;
  const root=document.documentElement;
  const embedded=window.frameElement?.classList?.contains('reportDocumentFrame');
  if(embedded){
    root.dataset.mentoraEmbed='chat';
    const style=document.createElement('style');
    style.dataset.artifactChatLayout='true';
    style.textContent=`
html[data-mentora-embed="chat"],
html[data-mentora-embed="chat"] body {
  width:100%!important;
  max-width:none!important;
  margin:0!important;
  padding:0!important;
}
html[data-mentora-embed="chat"] :is([data-aime-streamviz-root],[data-visualize-root]) {
  width:100%!important;
  max-width:none!important;
  margin-inline:0!important;
  padding-inline:0!important;
  padding-left:0!important;
  padding-right:0!important;
}
html[data-mentora-embed="chat"] :is([data-aime-streamviz-root],[data-visualize-root]).report > .read,
html[data-mentora-embed="chat"] :is([data-aime-streamviz-root],[data-visualize-root]) > .read,
html[data-mentora-embed="chat"] :is([data-aime-streamviz-root],[data-visualize-root]) .report > .read {
  width:100%!important;
  max-width:none!important;
  margin-inline:0!important;
  padding-inline:0!important;
  padding-left:0!important;
  padding-right:0!important;
}`;
    document.head.append(style);
  }
  if(!['light','dark'].includes(theme))return;
  const lockTheme=()=>{
    if(root.dataset.theme!==theme)root.dataset.theme=theme;
    if(root.style.colorScheme!==theme)root.style.colorScheme=theme;
  };
  const removeSwitches=()=>{
    document.querySelectorAll('button,[role="button"],select,input[type="checkbox"]').forEach(el=>{
      const id=el.id+' '+el.className;
      const label=(el.getAttribute('aria-label')||'').trim();
      const text=(el.textContent||'').trim();
      if(/theme[-_ ]?(toggle|switch)|(?:toggle|switch)[-_ ]?theme/i.test(id)
        ||/切换.*(?:主题|明暗)|switch.*theme|toggle.*theme/i.test(label)
        ||/^(?:浅色|深色|暗色|切换主题|切换明暗|light|dark|toggle theme)$/i.test(text))el.remove();
    });
    lockTheme();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',removeSwitches,{once:true});
  else removeSwitches();
  new MutationObserver(lockTheme).observe(root,{attributes:true,attributeFilter:['data-theme','style']});
})();

/* Use market-facing labels in native charts, including previously saved srcdoc tiles. */
(() => {
  const documents = new WeakSet();
  const frames = new WeakSet();
  const headings = new WeakSet();
  const repair = doc => {
    if (!doc?.documentElement) return;
    // Apply the same compact plot height to saved event charts, including old mobile CSS.
    if (doc.defaultView?.frameElement?.classList.contains('native-price-chart') && !doc.querySelector('style[data-politician-plot-height]')) {
      const compact=doc.createElement('style');compact.dataset.politicianPlotHeight='true';
      compact.textContent='.group-line-component .chart-stage{height:200px!important;min-height:200px!important}';
      (doc.head||doc.documentElement).append(compact);
      const resize=()=>doc.defaultView?.dispatchEvent(new doc.defaultView.Event('resize'));
      if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',resize,{once:true});
      else doc.defaultView.requestAnimationFrame(resize);
    }
    // Saved politician reports use the same full-height flow as new components.
    if (doc.querySelector('.suspicious-trades .signal-list,.multi-politician-events .signal-list') && !doc.querySelector('style[data-politician-event-flow]')) {
      const flow=doc.createElement('style');flow.dataset.politicianEventFlow='true';
      flow.textContent=':is(.suspicious-trades,.multi-politician-events) .signal-list{height:auto!important;max-height:none!important;overflow:visible!important;overscroll-behavior:auto!important}';
      (doc.head||doc.documentElement).append(flow);
    }
    if (!doc.documentElement.dataset.businessUi && !doc.querySelector('style[data-artifact-segments]')) {
      const style=doc.createElement('style');
      style.dataset.artifactSegments='true';
      style.textContent=`
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
      (doc.head || doc.documentElement).append(style);
    }
    doc.querySelectorAll('.kline-card .card-source').forEach(footer => footer.remove());
    if (doc.querySelector('.kline-component')) {
      let config;
      for (const script of doc.querySelectorAll('script')) {
        const match = script.textContent.match(/\bconst\s+config\s*=\s*(\{[^\n]*\});/);
        if (!match) continue;
        try { config = JSON.parse(match[1]); break; } catch { /* Not native JSON configuration. */ }
      }
      const code = String(config?.code || '').trim();
      const name = String(config?.name || '').trim();
      const cn = /^\d{6}\.(?:SH|SZ|BJ|SS)$/i.test(code)
        || (/^\d{6}$/.test(code) && /^(?:CN|CHINA)$/i.test(String(config?.market || '')));
      const us = !cn && (/^(?:US|USA|NASDAQ|NYSE|AMEX)$/i.test(String(config?.market || ''))
        || /^[A-Z][A-Z0-9.-]{0,14}$/.test(code));
      const marketLabel = cn && name && name !== code ? name : us ? code : '';
      const defaults=new Set(['K线组件','K线','K-line',code+' K线',code+' K線',code+' K-line',name+' K线',name+' '+code+' K线']);
      const documentTitle=String(doc.title || '').trim();
      const title=String(config?.displayTitle || (!defaults.has(documentTitle)?documentTitle:'')).trim();
      const label = title || marketLabel;
      if (label) doc.querySelectorAll('.kline-title strong[data-business-title]').forEach(heading => {
        const update = () => {
          const current=Array.from(heading.childNodes).filter(node=>node.nodeType===3).map(node=>node.textContent).join('').trim() || heading.textContent.trim();
          const identityOnly=[code,name,code+' · '+name,name+' · '+code,code+' '+name,name+' '+code].includes(current);
          const display=title || (!identityOnly && current?current:marketLabel);
          if (!display)return;
          if (current !== display) {
            const actions=Array.from(heading.querySelectorAll('button'));
            heading.replaceChildren(doc.createTextNode(display),...actions);
          }
          if (heading.dataset.tileTitle !== display) heading.dataset.tileTitle = display;
        };
        update();
        if (!headings.has(heading)) {
          headings.add(heading);
          new MutationObserver(update).observe(heading, {childList:true,subtree:true,characterData:true});
        }
      });
    }
    doc.querySelectorAll('iframe').forEach(frame => {
      const visit = () => { try { repair(frame.contentDocument); } catch { /* External frames keep their own labels. */ } };
      if (!frames.has(frame)) { frames.add(frame); frame.addEventListener('load', visit); }
      visit();
    });
    if (!documents.has(doc)) {
      documents.add(doc);
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => repair(doc), {once:true});
    }
  };
  repair(document);
})();

/* Add the Widget action beside the artifact’s own title. */
(() => {
  if(window.parent===window)return;
  let enabled=Boolean(window.frameElement?.classList.contains("reportDocumentFrame"));
  const attach=()=>{
    if(!enabled||!document?.documentElement)return;
    const title=document.querySelector('.kline-title strong[data-business-title],.chart-title,.waterfall-title,.treemap-title,.pie-title,.card-title,#title,h1,h2');
    if(!title?.textContent.trim())return;
    let style=document.querySelector('[data-widget-title-action-style]');
    if(!style){style=document.createElement('style');style.dataset.widgetTitleActionStyle='true';document.head.append(style);}
    const actionStyle='[data-widget-title-action]{display:inline-flex!important;vertical-align:middle;align-items:center;justify-content:flex-start!important;box-sizing:border-box;width:28px;height:28px;margin:0 0 0 6px!important;padding:5px 10px 5px 0!important;border:0;border-radius:6px;background:transparent;color:inherit;opacity:0;pointer-events:none;transition:opacity .15s ease;cursor:pointer}html:hover [data-widget-title-action]{opacity:.65;pointer-events:auto}[data-widget-title-action]:hover,[data-widget-title-action]:focus-visible{opacity:1;pointer-events:auto;background:#8882}[data-widget-title-action] svg{display:block;width:18px;height:18px;fill:currentColor}';
    if(style.textContent!==actionStyle)style.textContent=actionStyle;
    const actionHost=title.closest('header')?.querySelector('[data-widget-title-action-anchor]')||title;
    const existing=actionHost.querySelector('.artifactAddToWidget,[data-widget-title-action]')||title.querySelector('.artifactAddToWidget,[data-widget-title-action]');
    if(existing){if(existing.parentElement!==actionHost)actionHost.append(existing);return;}
    const button=document.createElement('button');button.type='button';button.dataset.widgetTitleAction='true';button.title='添加到 Widget';button.setAttribute('aria-label','添加到 Widget');
    button.innerHTML="<svg viewBox=\"0 0 1024 1024\" aria-hidden=\"true\"><path d=\"M960 224a32 32 0 0 0-32-32h-832a32 32 0 0 0-31.488 26.24L64 224v704a32 32 0 0 0 26.24 31.488L96 960H512a32 32 0 1 1 0 64H96a96 96 0 0 1-95.552-86.784L0 928v-704a96 96 0 0 1 86.784-95.552L96 128h832a96 96 0 0 1 95.552 86.784L1024 224V512a32 32 0 1 1-64 0V224zM801.92 576c16.64 0 30.08 13.44 30.08 30.08V768l161.92 0.064c16.64 0 30.08 13.44 30.08 30.08v3.84c0 16.64-13.44 30.08-30.08 30.08L832 831.936v161.92c0 16.64-13.44 30.144-30.08 30.144h-3.84A30.08 30.08 0 0 1 768 993.92V831.936L606.08 832A30.08 30.08 0 0 1 576 801.92v-3.84c0-16.64 13.44-30.08 30.08-30.08l161.92-.064V606.08c0-16.64 13.44-30.08 30.08-30.08h3.84zM736 0a32 32 0 1 1 0 64h-448a32 32 0 0 1 0-64h448z\"/></svg>";
    button.addEventListener('click',event=>{
      event.stopPropagation();
      const detail={title:title.textContent.trim()};
      try{
        const shell=window.frameElement?.closest('.chatArtifactShell');
        if(shell){parent.dispatchEvent(new parent.CustomEvent('mentora:add-artifact-to-widget',{detail:{...detail,url:shell.dataset.artifactUrl,trigger:button}}));return;}
      }catch{}
      parent.postMessage({type:'mentora:add-widget',...detail},'*');
    });
    title.style.overflow='visible';title.style.maxHeight='none';actionHost.append(button);
  };
  window.addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='mentora:widget-control'){enabled=true;attach();}});
  attach();
  parent.postMessage({type:'mentora:widget-ready'},'*');
  new MutationObserver(attach).observe(document.documentElement,{childList:true,subtree:true});
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

/* Keep numeric values/units intact while long field labels wrap independently. */
(() => {
  if(document.querySelector('[data-tooltip-value-layout]'))return;
  const style=document.createElement('style');
  style.dataset.tooltipValueLayout='1';
  const scope=':is(.tooltip,.chart-tooltip,.generic-canvas-tooltip,.pie-tooltip,.ring-tooltip,.treemap-tooltip,.waterfall-tooltip,.group-line-tooltip-portal,.bar-line-tooltip-portal,.bar-chart-tooltip-portal,.grouped-bar-tooltip-portal,.generic-local-tooltip-portal)';
  style.textContent=`
${scope} :is(.tip-row,.tooltip-row,.tooltip-body){align-items:start!important}
${scope} :is(.tip-label,.tooltip-label){min-width:0!important;white-space:normal!important;align-items:start!important}
${scope} :is(.tip-value,.tooltip-value,.tooltip-row>b){white-space:nowrap!important;flex-shrink:0!important;min-width:max-content!important;align-self:start!important}
${scope} :is(.tip-dot,.tooltip-dot){flex-shrink:0!important;align-self:start!important;margin-top:.5em!important}
`;
  (document.head||document.documentElement).append(style);
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
