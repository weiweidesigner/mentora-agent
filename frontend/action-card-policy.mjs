// Self-contained because this function is embedded in the sandboxed runtime.
export function styleNavigationCards(root, css) {
  const doc = root.ownerDocument || root;
  const cards = [...root.querySelectorAll('a.entry,button.entry,a[data-action-card="navigation"],button[data-action-card="navigation"]')].filter(card => {
    if (card.localName === 'button') return card.hasAttribute('data-ainvest-feature') || card.dataset.actionCard === 'navigation';
    try {
      const href=card.getAttribute('href');
      if (!href) return false;
      const url = new URL(href, doc.baseURI);
      const explicit = card.dataset.actionCard === 'navigation';
      return (explicit ? ['https:','http:'].includes(url.protocol) : url.protocol === 'https:') && !url.username && !url.password &&
        (explicit || (!url.port && ['ainvest.com','www.ainvest.com','news.ainvest.com','chart.ainvest.com','crypto.ainvest.com','community.ainvest.com','contact.ainvest.com','affiliate.ainvest.com'].includes(url.hostname)));
    } catch {return false;}
  });
  if (!cards.length) return false;
  for (const card of cards) {
    card.classList.add('mentoraNavigationCard');
    card.dataset.actionCard = 'navigation';
    let arrow = card.querySelector('svg.arrow,svg.entry-arrow');
    if (!arrow) {
      arrow = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [key,value] of Object.entries({class:'arrow',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.5','aria-hidden':'true'})) arrow.setAttribute(key,value);
      const path=doc.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d','M5 12h14m-6-6 6 6-6 6');arrow.append(path);card.append(arrow);
    }
    if (arrow && !arrow.parentElement.classList.contains('mentoraActionDirection')) {
      const slot = doc.createElement('span');
      slot.className = 'mentoraActionDirection';
      slot.setAttribute('aria-hidden', 'true');
      arrow.replaceWith(slot);
      slot.append(arrow);
    }
  }
  let style = root.querySelector('[data-mentora-action-cards]');
  if (!style) {
    style = doc.createElement('style');
    style.setAttribute('data-mentora-action-cards', '');
    (root.head || root).append(style);
  }
  if (style.textContent !== css) style.textContent = css;
  return true;
}

export function applyActionCardPolicy(runtime, css) {
  const insertion = 'fragment.innerHTML = nextHtml;';
  if (runtime.split(insertion).length !== 2) throw new Error('StreamViz fragment insertion changed; review action-card integration');
  return runtime.replace(insertion, () => `${insertion}\n(${styleNavigationCards.toString()})(fragment.content, ${JSON.stringify(css)});`);
}
