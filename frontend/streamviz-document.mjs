// Partial HTML must reach StreamViz unchanged. Appending a script to a prefix
// ending in `<p`, an attribute, or raw text can turn that script into body text.
export function prepareStreamDocument(props, scripts, completeHtml) {
  const decorate = source => {
    if (!String(source || '').trim()) return source;
    let html = completeHtml(source);
    for (const [marker, script] of scripts) {
      if (marker === 'data-sv-line-label-layout-v2') {
        html = html.replace(/<script\b(?=[^>]*\bdata-sv-line-label-layout-v2(?:\s|=|>))[^>]*>[\s\S]*?<\/script\s*>/gi, '');
      }
      if (!html.includes(marker)) html += `<script ${marker}>${script}</script>`;
    }
    return html;
  };
  return {
    ...props,
    // Render received deltas immediately. In particular, never animate a slice
    // of the internal scripts appended when the real generation is complete.
    smoothStreaming: false,
    loadingMessage: '正在处理',
    loadingMessages: ['正在处理'],
    code: props.final ? decorate(props.code) : props.code,
    exportCode: props.final ? decorate(props.exportCode) : props.exportCode,
  };
}
