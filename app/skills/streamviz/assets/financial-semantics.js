/* Direction metadata is authoritative. Legacy repair is confined to financial
   template values, never arbitrary percentages, prose, rankings or status text. */
(() => {
  if(window.__svFinancialSemantics)return;window.__svFinancialSemantics=true;
  const repair=()=>{
    document.querySelectorAll('.sv-rank>strong,.sv-metric>strong').forEach(node=>{
      if(node.querySelector('[data-sv-direction]') || (node.hasAttribute('data-sv-direction')&&node.dataset.svDirectionOrigin!=='compat'))return;
      const region=node.closest('[data-financial-market]');
      const heading=node.closest('.sv-section')?.querySelector(':scope>h2')?.textContent||'';
      const label=node.closest('.sv-metric')?.querySelector(':scope>p')?.textContent||'';
      if(!region&&!/涨跌|涨幅|跌幅|领涨|领跌|强势行业|弱势行业|收益率|return|price change/i.test(heading+' '+label))return;
      const raw=node.textContent.trim().replace(/−/g,'-').replace(/％/g,'%');
      if(!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%$/.test(raw))return;
      const value=Number(raw.slice(0,-1).replace(/,/g,''));
      if(!Number.isFinite(value))return;
      if(value!==0&&!/^[+-]/.test(raw))return;
      node.dataset.svDirection=value>0?'up':value<0?'down':'flat';node.dataset.svDirectionOrigin='compat';
    });
  };
  let pending=false;
  const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;repair()})};
  const start=()=>{repair();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
