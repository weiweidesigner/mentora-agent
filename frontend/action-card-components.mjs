// Two action types share app/static/action-cards.css; content is always escaped.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const globe = '<svg class="generatedFileIcon icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>';
const arrow = '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';

function safeDestination(href, base, download=false) {
  if (typeof href!=='string'||!href.trim()) throw new TypeError('Action-card destination is required');
  const url=new URL(href,base);
  if (!['https:','http:',...(download?['blob:']:[])].includes(url.protocol)||url.username||url.password) throw new TypeError('Unsupported action-card destination');
  return href;
}

export function FilePreviewCard({name,type,download}, base=globalThis.location?.href || 'https://localhost/') {
  safeDestination(download,base,true);
  return `<div class="generatedFileCard" data-action-card="file">${globe}<button class="generatedFileOpen" type="button" aria-haspopup="dialog" aria-label="预览 ${escape(name)}"><span class="generatedFileName" title="${escape(name)}">${escape(name)}</span><span class="generatedFileType">${escape(type)}</span></button><a class="generatedFileDownload" href="${escape(download)}" download="${escape(name)}" aria-label="下载文件 ${escape(name)}" title="下载文件"><svg class="fileControlIcon fileControlIcon--download" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true"><path d="M828.1 896.7H199.9c-73.2 0-132.8-59.6-132.8-132.8V514.5c0-17.7 14.3-32 32-32s32 14.3 32 32v249.4c0 37.9 30.9 68.8 68.8 68.8h628.2c37.9 0 68.8-30.9 68.8-68.8V514.5c0-17.7 14.3-32 32-32s32 14.3 32 32v249.4c0 73.2-59.6 132.8-132.8 132.8z M512.4 740.7c-17.7 0-32-14.3-32-32V151.8c0-17.7 14.3-32 32-32s32 14.3 32 32v556.9c0 17.7-14.3 32-32 32z M518.5 737.4c-8.2 0-16.4-3.1-22.6-9.4-12.5-12.5-12.5-32.8 0-45.3l156.9-156.9c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L541.1 728c-6.2 6.3-14.4 9.4-22.6 9.4z M506.2 737.2c-8.2 0-16.4-3.1-22.6-9.4L326.7 570.9c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l156.9 156.9c12.5 12.5 12.5 32.8 0 45.3-6.3 6.3-14.5 9.4-22.7 9.4z"/></svg></a></div>`;
}

export function NavigationCard({label,href,onNavigate,feature,target='_blank'}, doc=globalThis.document) {
  if (!doc) throw new TypeError('NavigationCard needs a document');
  const card=doc.createElement(href?'a':'button');
  card.className='mentoraNavigationCard entry';card.dataset.actionCard='navigation';
  if (href) {
    safeDestination(href,doc.baseURI);card.href=href;card.target=target;
    if (target==='_blank') card.rel='noopener noreferrer';
  } else {
    if (typeof onNavigate!=='function'&&!feature) throw new TypeError('NavigationCard needs a destination');
    card.type='button';
  }
  if (feature) card.dataset.ainvestFeature=feature;
  card.innerHTML=globe+'<span class="name entry-name"></span><span class="mentoraActionDirection" aria-hidden="true">'+arrow+'</span>';
  card.querySelector('.entry-name').textContent=label;
  if (onNavigate) card.addEventListener('click',onNavigate);
  return card;
}
