/* Three-field navigation cards. No bridge, pairing, remote device or iframe. */
(() => {
  if (window.AInvestNavigationCards) return;
  const icons = new Set(['chart','settings','watchlist','search','market','subscription','option','news','trade','screener','globe','account','calendar','assistant','page']);
  const hosts = new Set(['www.ainvest.com','news.ainvest.com','chart.ainvest.com','crypto.ainvest.com','community.ainvest.com','contact.ainvest.com','affiliate.ainvest.com']);
  const script = document.currentScript || [...document.scripts].find(item => /\/ainvest-navigation-cards\.js(?:[?#]|$)/.test(item.src));
  const base = script ? new URL(script.src, location.href).pathname.split(['','static',''].join('/'))[0] : '';

  const devicePending = new WeakSet();
  document.addEventListener('click', async event => {
    const link = event.target.closest?.('a.ainvestNavigationCard');
    if (!link || event.button !== 0) return;
    const url = link.getAttribute('href'), platform = kind(url);
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if (mobile || !['android','ios'].includes(platform)) return;
    event.preventDefault();
    if (devicePending.has(link)) return;
    let notice = link.nextElementSibling;
    if (!notice?.classList.contains('ainvestNavigationFeedback')) {
      notice = document.createElement('span'); notice.className = 'ainvestNavigationFeedback'; notice.setAttribute('role','status');
      notice.style.cssText = 'display:block;font-size:12px;color:var(--muted,#888);margin:4px 0 10px';link.after(notice);
    }
    let token = '';
    try {
      const saved = JSON.parse(localStorage.getItem('mentora-android-pair-v1-remembered') || 'null');
      token = saved?.expiresAt > Date.now() ? saved.token : sessionStorage.getItem('mentora-android-pair-v1') || '';
    } catch { /* Tell the user when this browser has no pairing. */ }
    if (!token) { notice.textContent = '此浏览器尚未连接这台 Mac 的真机，请使用已配对的 Mentora 浏览器。'; return; }
    devicePending.add(link);link.setAttribute('aria-busy','true');notice.textContent = '正在打开'+(platform==='android'?' Android':' iPhone')+' 真机…';
    try {
      const response = await fetch('/api/device-navigation/open', {method:'POST',headers:{'Content-Type':'application/json','X-Mentora-Device-Token':token},body:JSON.stringify({platform,url})});
      if (response.headers?.get('Content-Type')?.includes('text/html')) throw Error('服务正在更新，请稍后重新点击。');
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.error || '真机跳转失败');
      notice.remove();
    } catch (error) { notice.textContent = error.message || '真机转发连接失败，请检查 Mac 和 USB 连接。'; }
    finally { devicePending.delete(link);link.removeAttribute('aria-busy'); }
  });

  function internalURI(value) {
    try {
      const uri = new URL(value);
      return uri.protocol === 'lh:' && Boolean(uri.hostname) && !uri.username && !uri.password && !uri.port && !uri.hash && !/[\x00-\x20]|%0[ad]/i.test(value);
    } catch { return false; }
  }

  function kind(url) {
    if (typeof url !== 'string' || !url || url.length > 16384 || /[\x00-\x20]|%0[ad]/i.test(url)) return null;
    try {
      if (url.startsWith('intent://')) {
        const match = url.match(/^intent:\/\/open#Intent;scheme=ainvest;package=com\.ainvest\.android;action=android\.intent\.action\.VIEW;S\.shortcuts_url=([^;]+);end$/);
        return match && internalURI(decodeURIComponent(match[1])) ? 'android' : null;
      }
      const parsed = new URL(url);
      if (parsed.username || parsed.password || parsed.port) return null;
      if (parsed.protocol === 'ainvest:') {
        const entries = [...parsed.searchParams];
        return !parsed.host && !parsed.pathname && !parsed.hash && entries.length === 1 && entries[0][0] === 'deep_link_value' && internalURI(entries[0][1]) ? 'ios' : null;
      }
      if (parsed.protocol === 'https:' && hosts.has(parsed.hostname) && !/^https:\/\/[^/]*:/.test(url)) return 'web';
    } catch { /* Not an executable card URL. */ }
    return null;
  }

  function parse(value) {
    try {
      let card = value;
      if (typeof card === 'string') {
        let text = card.trim();
        const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
        if (fence) text = fence[1];
        card = JSON.parse(text);
      }
      if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
      if (Object.keys(card).sort().join(',') !== 'icon,title,url') return null;
      if (typeof card.title !== 'string' || !card.title.trim() || card.title.length > 160 || /[\x00-\x1f]/.test(card.title)) return null;
      if (typeof card.icon !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(card.icon) || !kind(card.url)) return null;
      return {title: card.title, icon: icons.has(card.icon) ? card.icon : 'page', url: card.url};
    } catch { return null; }
  }

  function pending(value) {
    if (typeof value !== 'string') return false;
    const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/`{1,3}$/, '').trim();
    if (!text.startsWith('{')) return false;
    try { return Boolean(parse(JSON.parse(text))) && !parse(value); } catch { /* Wait for the complete card, never show its partial JSON. */ }
    const rest = text.slice(1).trimStart();
    if (!rest || rest === '"') return true;
    const first = rest.match(/^"([^"\n]*)("?)/);
    if (!first) return false;
    return ['title','icon','url'].some(key => first[2] ? key === first[1] : key.startsWith(first[1]));
  }

  function render(value) {
    const card = parse(value);
    if (!card) return pending(value) ? '<span class="ainvestNavigationPending" role="status">正在生成页面入口…</span>' : null;
    const link = document.createElement('a');
    link.className = 'ainvestNavigationCard';
    link.setAttribute('href', card.url);
    link.dataset.navigationPlatform = kind(card.url);
    if (kind(card.url) === 'web') {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    const icon = document.createElement('span');
    icon.className = 'ainvestNavigationIcon';
    icon.dataset.icon = card.icon;
    icon.setAttribute('aria-hidden', 'true');
    icon.style.setProperty('--ainvest-navigation-icon', `url("${base}/static/assets/ainvest-navigation/icons/${card.icon}.svg")`);
    const title = document.createElement('span');
    title.className = 'ainvestNavigationTitle';
    title.textContent = card.title;
    const arrow = document.createElement('span');
    arrow.className = 'ainvestNavigationArrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    link.append(icon, title, arrow);
    return link.outerHTML;
  }

  window.AInvestNavigationCards = Object.freeze({parse, render, kind, pending});
})();
