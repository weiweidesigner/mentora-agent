// Live adapter for the native business K-line. No chart styling or fake bars.
(() => {
  const meta = JSON.parse(document.getElementById('ashare-live-config').textContent);
  const root = document.querySelector('.kline-component');
  const status = document.getElementById('ashareLiveStatus');
  const prefix = location.pathname.split(/\/(?:share-artifact|generated|api)\//)[0];
  // Build from the actual mount path; reverse-proxy HTML rewriting must not prefix twice.
  const endpoint = prefix + '/' + 'api/widgets/ashare-minute?symbol=' + encodeURIComponent(meta.symbol) + '&days=1';
  let timer, controller, failures = 0, running = false;
  const clock = value => new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
  function notify(data) {
    requestAnimationFrame(() => parent.postMessage({type:'ashare-live-meta',symbol:meta.symbol,name:data?.name || '',height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin));
  }
  async function refresh() {
    clearTimeout(timer);
    if (document.hidden || running) return;
    running = true; controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),15000);
    let next = 30;
    try {
      const response = await fetch(endpoint,{cache:'no-store',signal:controller.signal});
      const data = await response.json();
      if (!response.ok) throw Error(data.detail || '行情暂不可用');
      if (data.symbol !== meta.symbol || !data.dataByPeriod?.['1m']?.length) throw Error('行情数据不完整');
      root.dispatchEvent(new CustomEvent('kline-data-update',{detail:{dataByPeriod:data.dataByPeriod,name:data.name,source:'eastmoney'}}));
      status.hidden = !['error','delayed'].includes(data.status);
      status.textContent = data.status==='error' ? '同步暂时失败，已保留最近行情。' : data.status==='delayed' ? '行情数据有延迟。' : '';
      status.dataset.state = data.status;
      root.dataset.liveDataTime = data.dataTime;
      root.dataset.liveBarCount = String(data.dataByPeriod['1m'].length);
      next = Math.max(30,Number(data.nextPollSeconds)||30); failures = 0;
      notify(data);
    } catch (error) {
      if (document.hidden) return;
      failures++;
      status.hidden = false;
      status.textContent = root.dataset.liveDataTime ? `同步暂时失败，保留行情 ${clock(root.dataset.liveDataTime)}，稍后重试。` : '分钟行情暂不可用，正在重试。';
      status.dataset.state = 'error'; next = Math.min(120,30*failures); notify();
    } finally {
      clearTimeout(timeout); running = false;
      if (!document.hidden) timer = setTimeout(refresh,next*1000);
    }
  }
  document.addEventListener('visibilitychange',() => {clearTimeout(timer);if(document.hidden)controller?.abort();else refresh();});
  addEventListener('message',event => {
    if(event.source!==parent || event.origin!==location.origin)return;
    const theme=event.data?.theme;if(['light','dark'].includes(theme))document.documentElement.dataset.theme=theme;
  });
  addEventListener('pagehide',() => {clearTimeout(timer);controller?.abort();});
  new ResizeObserver(() => notify()).observe(document.body);
  refresh();
})();
