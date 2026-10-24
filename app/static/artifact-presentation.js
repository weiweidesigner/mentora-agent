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
    if (!doc.querySelector('style[data-artifact-segments]')) {
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
      const label = cn && name && name !== code ? name : us ? code : '';
      if (label) doc.querySelectorAll('.kline-title strong[data-business-title]').forEach(heading => {
        const update = () => {
          if (heading.textContent !== label) heading.textContent = label;
          if (heading.dataset.tileTitle !== label) heading.dataset.tileTitle = label;
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
    const title=document.querySelector('.chart-title,.waterfall-title,.treemap-title,.pie-title,.card-title,#title,h1,h2');
    if(!title?.textContent.trim())return;
    let style=document.querySelector('[data-widget-title-action-style]');
    if(!style){style=document.createElement('style');style.dataset.widgetTitleActionStyle='true';document.head.append(style);}
    style.textContent='[data-widget-title-action]{display:inline-flex!important;vertical-align:middle;align-items:center;justify-content:flex-start!important;box-sizing:border-box;width:28px;height:28px;margin:0 0 0 2px!important;padding:5px 10px 5px 0!important;border:0;border-radius:6px;background:transparent;color:inherit;opacity:.65;cursor:pointer}[data-widget-title-action]:hover,[data-widget-title-action]:focus-visible{opacity:1;background:#8882}[data-widget-title-action] svg{display:block;width:18px;height:18px;fill:currentColor}';
    if(title.querySelector('.artifactAddToWidget,[data-widget-title-action]'))return;
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
    title.style.overflow='visible';title.style.maxHeight='none';title.append(button);
  };
  window.addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='mentora:widget-control'){enabled=true;attach();}});
  attach();
  parent.postMessage({type:'mentora:widget-ready'},'*');
  new MutationObserver(attach).observe(document.documentElement,{childList:true,subtree:true});
})();
