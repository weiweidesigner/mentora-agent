// Self-contained: this function also runs inside StreamViz's sandboxed iframe.
export function hasAuthoredReportTitle(fragment, title) {
  if (fragment.querySelector('.mentoraNavigationCard')) return true;
  const normalize = value => String(value || '').normalize('NFKC').replace(/[\s\u200b]+/g, '').toLocaleLowerCase();
  const expected = normalize(title);
  for (const heading of fragment.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')) {
    if (heading.closest('template,svg,pre,code,[data-visualize-title],[hidden],[aria-hidden="true"],.sr-only,.visually-hidden')) continue;
    let hidden = false;
    for (let node = heading; node && node.nodeType === 1; node = node.parentElement) {
      if (node.style.display === 'none' || ['hidden', 'collapse'].includes(node.style.visibility)) {
        hidden = true;
        break;
      }
    }
    const text = normalize(heading.textContent);
    if (hidden || !text) continue;
    // A document-level title owns the report heading. Section headings only
    // replace the automatic heading when they repeat the supplied title.
    if (heading.localName === 'h1' || heading.getAttribute('aria-level') === '1' || (expected && text === expected)) return true;
  }
  return false;
}

export function applyStreamTitlePolicy(runtime) {
  const insertion = 'if (reportTitle) {';
  if (runtime.split(insertion).length !== 2) throw new Error('StreamViz title insertion changed; review the pinned runtime integration');
  return runtime.replace(insertion, () => `if (reportTitle && !(${hasAuthoredReportTitle.toString()})(fragment.content, reportTitle)) {`);
}
