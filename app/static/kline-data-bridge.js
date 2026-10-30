  // Runs in the native chart closure: reuse its bars, viewport and indicator math.
  const historyBridgeVersion = 2;
  const historyRequests = new Map();
  const historyStatus = new Map();
  const historyEnds = new Set();
  const historyVisited = new Set([activePeriod]);
  const historyViews = new Map();
  const historyRangeApplied = new Set();
  const historyRange = config.timeRange || {};
  const historyDate = value => {
    if (value == null || value === '') return NaN;
    return normTime(value);
  };
  const historyStart = historyDate(config.fromDate || historyRange.start || historyRange.from || historyRange.startDate);
  const historyEndRaw = config.toDate || historyRange.end || historyRange.to || historyRange.endDate;
  const historyEnd = historyDate(historyEndRaw) + (/^\d{4}-\d{2}-\d{2}$/.test(String(historyEndRaw)) ? 86399999 : 0);
  const historyHasRange = Number.isFinite(historyStart) || Number.isFinite(historyEnd);
  const historyNote = document.createElement('div');
  historyNote.className = 'kline-data-state';
  historyNote.setAttribute('role', 'status');
  historyNote.style.cssText = 'display:none;position:absolute;inset:0;z-index:20;align-items:center;justify-content:center;gap:10px;font:12px/1.5 system-ui;color:var(--kl-muted,inherit)';
  const historyHost = root.querySelector('.chart-host') || canvas.parentElement || root;
  historyHost.style.position = 'relative';
  historyHost.append(historyNote);
  const historyStyle = document.createElement('style');
  historyStyle.textContent = '@keyframes kline-history-spin{to{transform:rotate(360deg)}}.kline-history-spinner{width:20px;height:20px;border:2px solid #8883;border-top-color:currentColor;border-radius:50%;animation:kline-history-spin .8s linear infinite}@media(prefers-reduced-motion:reduce){.kline-history-spinner{animation:none}}';
  historyHost.append(historyStyle);
  const historyEnglish = String(config.language).startsWith('en');
  const historyApiPrefix = [location.pathname, document.referrer].some(value => /\/mentora\//.test(value)) ? '/mentora' : '';

  function showHistoryStatus() {
    const state = historyStatus.get(activePeriod);
    historyNote.replaceChildren();
    historyNote.style.display = state ? 'flex' : 'none';
    root.dataset.klinePeriod = activePeriod;
    root.dataset.klineBars = String((dataByPeriod[activePeriod] || []).length);
    root.dataset.klineStatus = state?.kind || 'ready';
    root.setAttribute('aria-busy',String(state?.kind === 'loading'));
    const empty = !(dataByPeriod[activePeriod] || []).length;
    // Keep the canvas dimensions, but never paint "No data" during a request.
    canvas.style.visibility = state && empty ? 'hidden' : '';
    historyNote.style.pointerEvents = empty ? 'auto' : 'none';
    if (!state) return;
    historyNote.setAttribute('aria-label',state.message);
    if (state.kind === 'loading') {
      const spinner = document.createElement('span');
      spinner.className = 'kline-history-spinner';
      spinner.setAttribute('aria-hidden','true');
      historyNote.append(spinner);
    } else {
      const text = document.createElement('span');
      text.textContent = state.message;
      historyNote.append(text);
    }
    if (state.retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = historyEnglish ? 'Retry' : '重试';
      button.style.cssText = 'font:inherit;color:inherit;background:transparent;border:1px solid #8886;border-radius:4px;padding:2px 8px;cursor:pointer';
      button.style.pointerEvents = 'auto';
      button.addEventListener('click', state.retry);
      historyNote.append(button);
    }
  }

  function historyRows(period) {
    return dataByPeriod[period] || [];
  }

  function visibleSlice(list, layout) {
    if (historyHasRange && !historyRangeApplied.has(activePeriod) && list.length) {
      const indexes = list.map((row, index) => ({index,time:normTime(row.time ?? row.timestamp)}))
        .filter(row => (!Number.isFinite(historyStart) || row.time >= historyStart) && (!Number.isFinite(historyEnd) || row.time <= historyEnd));
      if (indexes.length) {
        viewEnd = indexes[indexes.length-1].index;
        visibleCount = indexes.length;
        config.zoomMinBars = Math.max(1,Math.min(Number(config.zoomMinBars || 20),indexes.length));
        historyRangeApplied.add(activePeriod);
      }
    }
    return embeddedVisibleSlice(list, layout);
  }

  function mergeHistory(period, incoming) {
    const previous = historyRows(period);
    const state = period === activePeriod ? {end:viewEnd,count:visibleCount,index:activeIndex} : historyViews.get(period);
    const right = state && Number.isFinite(state.end) ? normTime(previous[state.end]?.time ?? previous[state.end]?.timestamp) : NaN;
    const pointed = state && Number.isFinite(state.index) ? normTime(previous[state.index]?.time ?? previous[state.index]?.timestamp) : NaN;
    const merged = new Map(previous.map(row => [normTime(row.time ?? row.timestamp),row]));
    for (const row of incoming) {
      const key = normTime(row.time ?? row.timestamp);
      const o = Number(row.open), h = Number(row.high), l = Number(row.low), c = Number(row.close), v = Number(row.volume || 0);
      if (!Number.isFinite(key) || ![o,h,l,c,v].every(Number.isFinite) || Math.min(o,h,l,c)<=0 || v<0 || h<Math.max(o,l,c) || l>Math.min(o,h,c)) continue;
      merged.set(key,row);
    }
    const rows = [...merged.entries()].sort((a,b) => a[0]-b[0]).map(entry => entry[1]);
    dataByPeriod[period] = rows;
    if (state) {
      if (Number.isFinite(right)) state.end = rows.findIndex(row => normTime(row.time ?? row.timestamp) === right);
      if (Number.isFinite(pointed)) state.index = rows.findIndex(row => normTime(row.time ?? row.timestamp) === pointed);
      historyViews.set(period,state);
      if (period === activePeriod) {viewEnd=state.end;visibleCount=state.count;activeIndex=state.index;}
    }
    return rows.length - previous.length;
  }

  async function requestHistory(period, cursor=null, direction='before', initial=false) {
    initial = initial || !historyRows(period).length;
    const key = `${period}:${direction}:${cursor}`;
    if (historyRequests.has(key)) return historyRequests.get(key);
    const pending = (async () => {
      historyStatus.set(period,{kind:'loading',message:historyEnglish?'Loading market data…':'正在加载行情…'});
      showHistoryStatus();
      try {
        const params = new URLSearchParams({symbol:config.code,period,direction});
        if (config.market) params.set('market',config.market);
        if (config.exchange) params.set('exchange',config.exchange);
        if (Number.isFinite(cursor)) params.set('cursor',String(cursor));
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(),90000);
        let response;
        try {response=await fetch(`${historyApiPrefix}/api/kline/history?${params}`,{signal:controller.signal,credentials:'same-origin',cache:'no-store'});}
        finally {clearTimeout(timeout);}
        if (!response.ok) throw new Error('market-data-unavailable');
        const result = await response.json();
        if (result.period !== period || !Array.isArray(result.rows)) throw new Error('invalid-market-data');
        const added = mergeHistory(period,result.rows);
        config.sources = config.sources || {};
        config.sources[period] = result.source;
        if (!result.hasMore || (cursor !== null && !added)) historyEnds.add(`${period}:${direction}`);
        if (initial) {
          historyRangeApplied.delete(period);
          historyViews.delete(period);
          if (period===activePeriod) {visibleCount=null;viewEnd=null;activeIndex=-1;}
        }
        if (!historyRows(period).length) {
          historyStatus.set(period,{kind:'empty',message:historyEnglish?'No data for this period.':'该周期暂无行情数据',retry:()=>requestHistory(period,cursor,direction,initial)});
        } else if (result.coverageWarning) {
          historyStatus.set(period,{kind:'limited',message:result.coverageWarning});
        } else historyStatus.delete(period);
        if (period===activePeriod) draw();
        showHistoryStatus();
        // A date window can span several pages; each page remains available to pan/zoom.
        const first = normTime(historyRows(period)[0]?.time ?? historyRows(period)[0]?.timestamp);
        if (initial && added && Number.isFinite(historyStart) && first>historyStart && !historyEnds.has(`${period}:before`)) {
          queueMicrotask(() => requestHistory(period,first,'before',true));
        }
      } catch {
        historyStatus.set(period,{kind:'error',message:historyEnglish?'Could not load market data.':'行情加载失败，已有数据仍可查看',retry:()=>requestHistory(period,cursor,direction,initial)});
        showHistoryStatus();
      }
    })();
    historyRequests.set(key,pending);
    try {await pending;} finally {historyRequests.delete(key);}
  }

  function ensureHistory(period, initial=false) {
    const rows = historyRows(period);
    if (!rows.length) return requestHistory(period,historyHasRange && Number.isFinite(historyEnd)?historyEnd+1:null,'before',historyHasRange);
    if (initial && historyHasRange) {
      const first=normTime(rows[0].time ?? rows[0].timestamp), last=normTime(rows[rows.length-1].time ?? rows[rows.length-1].timestamp);
      if ((Number.isFinite(historyStart) && first>historyStart) || (Number.isFinite(historyEnd) && last<historyEnd)) {
        return requestHistory(period,Number.isFinite(historyEnd)?historyEnd+1:null,'before',true);
      }
    }
  }

  function switchPeriod(period) {
    historyViews.set(activePeriod,{end:viewEnd,count:visibleCount,index:activeIndex});
    embeddedSwitchPeriod(period);
    const state=historyViews.get(period);
    if (state) {viewEnd=state.end;visibleCount=state.count;activeIndex=state.index;draw();}
    showHistoryStatus();
    if (!historyVisited.has(period)) {
      historyVisited.add(period);
      requestHistory(period,historyHasRange && Number.isFinite(historyEnd)?historyEnd+1:null,'before',historyHasRange);
    } else ensureHistory(period);
  }

  function maybeLoadPreviousPage() {
    if (embeddedMaybeLoadPreviousPage()) return true;
    const all=bars();
    if (!all.length) return false;
    const slice=visibleSlice(all,getLayout(canvas.clientWidth || 360));
    if (slice.start<=3 && !historyEnds.has(`${activePeriod}:before`) && historyStatus.get(activePeriod)?.kind!=='error') {
      requestHistory(activePeriod,normTime(all[0].time ?? all[0].timestamp),'before');
    }
    return false;
  }

  let historyPanTimer;
  function checkHistoryEdges(event) {
    if (event?.type === 'mousemove' && !isDragging) return;
    if (event?.type === 'wheel' && !event.ctrlKey) return;
    clearTimeout(historyPanTimer);
    historyPanTimer=setTimeout(() => {
      maybeLoadPreviousPage();
      const rows=bars();
      if (rows.length && viewEnd>=rows.length-3 && !historyEnds.has(`${activePeriod}:after`) && historyStatus.get(activePeriod)?.kind!=='error') {
        requestHistory(activePeriod,normTime(rows[rows.length-1].time ?? rows[rows.length-1].timestamp),'after');
      }
    },120);
  }
  for (const event of ['wheel','mousemove','touchmove','mouseup','touchend']) canvas.addEventListener(event,checkHistoryEdges,{passive:true});
  queueMicrotask(() => {ensureHistory(activePeriod,true);showHistoryStatus();});
