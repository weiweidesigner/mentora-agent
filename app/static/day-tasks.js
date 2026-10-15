(() => {
  const root = document.querySelector('#myDay');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const dialog = $('dayDialog'), form = $('dayForm');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stages = {pre:'盘前机会', live:'盘中监控', post:'收盘回顾'};
  const assets = {stocks:'股票', etf:'ETF', index:'指数', sector:'行业板块', watchlist:'自选列表'};
  const icons = {pre:'☀', live:'◉', post:'☾'};
  const marketNames = {CN:'A股', HK:'港股', US:'美股'};
  let market = localStorage.getItem('veya-day-market') || 'CN';
  if (!marketNames[market]) market = 'CN';
  let pinnedStage = false;
  let stage = 'pre', editing = null, tasks = [], markets = [], publicKey = '', busy = false, firstLoad = true;
  let deepLink = new URLSearchParams(location.search).get('dayResult');
  let shareLink = new URLSearchParams(location.search).get('dayShare');
  let serverDelta = 0, lastRefresh = 0;
  const el = name => form.elements.namedItem(name);
  function message(value, inDialog = dialog.open) {
    (inDialog ? $('dayDialogMessage') : $('dayMessage')).textContent = value;
  }
  async function api(path, method = 'GET', data) {
    const response = await fetch('/api/day/' + path, {method, credentials:'same-origin', cache:'no-store', headers: {'Content-Type':'application/json', 'X-Veya-Day':'1'}, ...(data === undefined ? {} : {body:JSON.stringify(data)})});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      let detail = body.detail;
      if (Array.isArray(detail)) detail = detail.map(e => e.msg).join('；');
      throw new Error(typeof detail === 'string' ? detail : '请求失败，请稍后重试');
    }
    return body;
  }
  const dateText = (value, zone) => value ? new Intl.DateTimeFormat('zh-CN', {timeZone:zone || 'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)) : '';
  function taskZone(task) { return task.timezone === 'market' ? markets.find(m => m.market === task.market)?.zone || 'Asia/Shanghai' : task.timezone; }
  function statusText(task) {
    if (task.activeRun) return task.lastRun?.status === 'running' ? '正在分析' : '排队中';
    if (task.lastRun?.status === 'failed') return '执行失败';
    if (!task.enabled) return task.cadence === 'once' && task.lastRun?.status === 'success' ? '已完成' : '已暂停';
    return task.resultVersion ? '已更新' : '等待执行';
  }
  function template(stage, type = 'stocks') {
    const name = marketNames[market], asset = type === 'watchlist' ? '股票' : assets[type];
    const text = {
      pre: `结合最新隔夜市场、公告与今日事件，梳理{{market}}中{{symbols}}的${asset}盘前关注机会。按催化剂、观察指标和风险列出要点，注明数据时间；没有指定标的时分析全市场。`,
      live: `检查{{market}}中{{symbols}}的${asset}盘中表现，汇总价格、成交量与板块异动，分析可能原因与需要继续观察的信号。注明行情时间和延迟，不具备实时数据时明确说明。`,
      post: `复盘{{market}}中{{symbols}}的${asset}今日表现，说明涨跌驱动、市场强弱和重要事件，并列出下一交易日的关注清单。区分已确认事实与推测，注明数据时间。`
    };
    return {title: `${name}${type === 'stocks' ? '' : asset} · ${stages[stage]}`, market, stage, assetType:type, symbols:'', question:text[stage], cadence:'trading', timeMode:stage === 'live' ? 'fixed' : stage === 'post' ? 'close' : 'open', offset:stage === 'post' ? 15 : -30, time:market === 'US' ? '11:00' : '10:30', timezone:'market', date:'', enabled:true, browser:false, feishu:false, wecom:false, serverchan:false};
  }
  function render() {
    $('dayMarkets').innerHTML = markets.map(m => `<button type="button" data-market="${m.market}" aria-pressed="${m.market === market}">${m.flag} ${esc(m.name)}</button>`).join('');
    $('dayStages').innerHTML = Object.entries(stages).map(([key, label]) => `<button id="day-tab-${key}" type="button" role="tab" aria-controls="dayPanel" aria-selected="${key === stage}" tabindex="${key === stage ? 0 : -1}" data-stage="${key}"><span aria-hidden="true">${icons[key]}</span> ${label}<span class="dayCount">${tasks.filter(t => t.market === market && t.stage === key).length || ''}</span></button>`).join('');
    $('dayPanel').setAttribute('aria-labelledby', 'day-tab-' + stage);
    const rows = tasks.filter(t => t.market === market && t.stage === stage);
    $('dayPanel').innerHTML = `<div class="dayGrid">${rows.map(t => `<article class="dayCard ${t.activeRun ? 'is-running' : ''}">
      <div class="dayCardTop"><span>${esc(assets[t.assetType])}</span><span class="dayStatus ${t.lastRun?.status === 'failed' ? 'has-error' : ''}">${esc(statusText(t))}</span></div>
      <h3>${esc(t.title)}</h3><p class="daySummary">${esc(t.summary || t.question)}</p>
      <p class="dayMeta">${t.successAt ? '结果更新于 ' + dateText(t.successAt, taskZone(t)) : '首次成功后展示分析结果'}</p>
      <p class="dayMeta">${t.nextAt ? '下次 ' + dateText(t.nextAt, taskZone(t)) + (t.market === 'US' && t.timezone === 'market' ? ' · 美东时间' : ' · 北京时间') : t.enabled ? '暂无下一次执行，请检查日期' : '定时执行已关闭'}</p>
      ${t.lastRun?.error ? `<p class="dayError">${esc(t.lastRun.error)}</p>` : ''}
      ${t.notifications.some(n => n.status === 'failed') ? '<p class="dayError">分析已完成，但有通知发送失败，请检查设置。</p>' : ''}
      <div class="dayCardActions">${t.resultVersion ? `<button class="dayTextButton" data-view="${t.id}" type="button">查看分析 ↗</button>` : ''}<button class="dayTextButton" data-run="${t.id}" type="button" ${t.activeRun ? 'disabled' : ''}>${t.activeRun ? '执行中…' : '立即运行'}</button><button class="dayTextButton" data-edit="${t.id}" type="button">设置</button></div>
    </article>`).join('')}${rows.length ? '' : ['stocks','etf','watchlist'].map(type => {const t = template(stage, type);return `<article class="dayCard dayRecommendation"><div class="dayCardTop"><span>推荐任务 · ${assets[type]}</span><span aria-hidden="true">${icons[stage]}</span></div><h3>${esc(t.title)}</h3><p class="daySummary">${esc(t.question.replaceAll('{{market}}', marketNames[market]).replaceAll('{{symbols}}', type === 'watchlist' ? '我的自选列表' : '关注标的'))}</p><div class="dayCardActions"><button class="dayTextButton" data-template="${type}" type="button">＋ 设置这个任务</button></div></article>`}).join('')}</div>`;
    renderList();
    renderClock();
  }
  function renderClock() {
    const m = markets.find(m => m.market === market);
    if (!m) return;
    const now = new Date(Date.now() + serverDelta);
    $('dayClock').textContent = new Intl.DateTimeFormat('zh-CN', {timeZone:m.zone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(now) + (market === 'US' ? ' 美东' : ' 北京') + ' · ' + m.status;
  }
  function renderList() {
    $('dayTaskList').innerHTML = tasks.length ? tasks.map(t => `<div class="dayTaskRow"><div><strong>${esc(t.title)}</strong><p>${esc(marketNames[t.market])} · ${esc(stages[t.stage])} · ${esc(statusText(t))}</p></div><div><button class="dayTextButton" data-edit="${t.id}" type="button">编辑</button><button class="dayTextButton" data-toggle="${t.id}" type="button">${t.enabled ? '暂停' : '开启'}</button><button class="dayTextButton dayDelete" data-delete="${t.id}" type="button" ${t.activeRun ? 'disabled' : ''}>删除</button></div></div>`).join('') : '<p class="dayEmpty">还没有定时任务，从推荐开始，或创建自己的问句。</p>';
  }
  function updateFields(event) {
    if (event?.target === el('cadence') && el('cadence').value === 'daily') el('timeMode').value = 'fixed';
    if (event?.target === el('timeMode') && el('timeMode').value !== 'fixed' && el('cadence').value === 'daily') el('cadence').value = 'trading';
    $('dayDateLabel').hidden = el('cadence').value !== 'once';
    el('date').required = el('cadence').value === 'once';
    const relative = el('timeMode').value !== 'fixed';
    $('dayTimeLabel').hidden = relative;
    $('dayOffsetLabel').hidden = !relative;
    $('dayTimezoneLabel').hidden = relative;
    $('dayServerchanFields').hidden = !el('serverchan').checked;
    $('dayFeishuFields').hidden = !el('feishu').checked;
    $('dayWecomFields').hidden = !el('wecom').checked;
    const zone = el('market').value === 'US' && el('timezone').value === 'market' ? '美东时间' : '北京时间';
    $('dayNextPreview').textContent = relative ? '跟随市场实际开收盘时间，包含夏令时与提前收盘。' : `按${zone} ${el('time').value || '所选时间'}执行。交易日规则按所选交易所日历判断。`;
  }
  function edit(task) {
    editing = task.id || null;
    form.reset();
    for (const [name, value] of Object.entries(task)) {
      const field = el(name);
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else field.value = value ?? '';
    }
    for (const name of ['feishuUrl','feishuSecret','wecomUrl','serverchanKey']) {
      el(name).value = '';
      if (task[name + 'Configured']) el(name).placeholder = '已保存（留空沿用，取消渠道后清除）';
      else el(name).placeholder = name === 'feishuSecret' ? '可选的签名密钥' : name === 'serverchanKey' ? 'SCT 开头的 SendKey' : '填写官方机器人 Webhook 地址';
    }
    $('dayFormTitle').textContent = editing ? '编辑任务' : '新建任务';
    form.hidden = false;
    if (!dialog.open) dialog.showModal();
    message('');
    updateFields();
    requestAnimationFrame(() => {el('title').focus(); el('title').scrollIntoView({block:'nearest'});});
  }
  function payload() {
    const data = Object.fromEntries(new FormData(form));
    for (const key of ['enabled','browser','feishu','wecom','serverchan']) data[key] = el(key).checked;
    data.offset = Number(data.offset);
    if (data.timeMode !== 'fixed') data.timezone = 'market';
    return data;
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const data = await api('tasks');
      tasks = data.tasks; markets = data.markets; publicKey = data.pushPublicKey;
      serverDelta = new Date(data.serverTime).getTime() - Date.now(); lastRefresh = Date.now();
      if (firstLoad || !pinnedStage) {stage = markets.find(m => m.market === market)?.stage || 'pre'; firstLoad = false;}
      render();
      if (deepLink) {const id = deepLink; deepLink = null; await view(id);}
      if (shareLink) {const token = shareLink; shareLink = null; await viewShared(token);}
    } catch (error) {message(error.message); if (firstLoad) $('dayPanel').innerHTML = '<p class="dayEmpty">任务暂时无法加载。<button id="dayRetry" class="dayTextButton" type="button">重新加载</button></p>';}
    finally {busy = false;}
  }
  async function view(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) throw new Error('请在创建任务的浏览器查看，或使用机器人消息中的结果链接');
    if (!task.resultVersion) throw new Error('任务还没有成功结果');
    const row = {id:'day-' + task.id, title:task.title, question:task.question, cachedDate:dateText(task.successAt), conversationUrl:'/api/day/tasks/' + task.id + '/result'};
    const url = new URL(location.href); url.searchParams.set('dayResult',id); history.replaceState(null,'',url);
    window.dispatchEvent(new CustomEvent('veya:open-day-result', {detail:row}));
  }
  async function viewShared(token) {
    const data = await api('shared/' + encodeURIComponent(token));
    window.dispatchEvent(new CustomEvent('veya:open-day-result', {detail:{id:'day-shared-' + token, title:data.title, question:data.question, cachedDate:dateText(data.cachedDate), conversationUrl:'/api/day/shared/' + encodeURIComponent(token)}}));
  }
  async function enablePush() {
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('当前浏览器不支持推送，请使用 HTTPS 下的 Chrome');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('尚未允许通知，请在浏览器网站设置中开启');
    const swUrl = new URL('/api/day/service-worker.js', location.origin);
    // nginx prefixes root-relative API strings for the /veya deployment.
    const scope = swUrl.pathname.replace(/api\/day\/service-worker\.js$/, '');
    const registration = await navigator.serviceWorker.register(swUrl.href, {scope});
    await navigator.serviceWorker.ready;
    const padded = publicKey + '='.repeat((4 - publicKey.length % 4) % 4);
    const key = Uint8Array.from(atob(padded.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:key});
    await api('subscriptions', 'POST', subscription.toJSON());
    el('browser').checked = true;
    $('dayPushState').textContent = '当前浏览器已订阅。保存任务后，完成时将尝试推送；电脑关机期间不会弹窗。';
  }
  root.addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.market) {pinnedStage = false; market = b.dataset.market; localStorage.setItem('veya-day-market',market); stage = markets.find(m=>m.market===market)?.stage || 'pre'; render();}
      else if (b.dataset.stage) {pinnedStage = true; stage = b.dataset.stage; render(); $('day-tab-' + stage).focus();}
      else if (b.dataset.template) edit(template(stage, b.dataset.template));
      else if (b.dataset.edit) edit(tasks.find(t=>t.id===b.dataset.edit));
      else if (b.dataset.view) await view(b.dataset.view);
      else if (b.dataset.run) {b.disabled = true; await api('tasks/' + b.dataset.run + '/run','POST'); message('任务已提交到云端，关闭页面后仍会执行。'); await refresh();}
      else if (b.id === 'dayManage') {form.hidden = true; message('',false); dialog.showModal();}
      else if (b.id === 'dayRetry') await refresh();
    } catch (error) {message(error.message); b.disabled = false;}
  });
  $('dayStages').addEventListener('keydown', event => {
    const keys = Object.keys(stages); let index = keys.indexOf(stage);
    if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      pinnedStage = true; stage = keys[index]; render(); $('day-tab-' + stage).focus();
    }
  });
  $('dayClose').onclick = () => dialog.close();
  $('dayNew').onclick = () => edit(template(stage));
  $('dayCancelEdit').onclick = () => {form.hidden = true; message('');};
  dialog.addEventListener('click', event => {if (event.target === dialog) {const r=dialog.getBoundingClientRect(); if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close();}});
  form.addEventListener('change', updateFields);
  $('dayTaskList').addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b) return;
    const id = b.dataset.edit || b.dataset.toggle || b.dataset.delete;
    const task = tasks.find(t => t.id === id); if (!task) return;
    try {
      if (b.dataset.edit) edit(task);
      else if (b.dataset.toggle) {b.disabled = true; await api('tasks/' + id,'PUT',{...task,enabled:!task.enabled}); await refresh(); message(task.enabled ? '已暂停后续执行，已有结果仍保留。' : '已开启定时任务。');}
      else if (b.dataset.delete) {b.disabled=true; await api('tasks/' + id,'DELETE'); if(editing===id) form.hidden=true; await refresh(); message('任务已删除。');}
    } catch (error) {message(error.message); b.disabled=false;}
  });
  $('dayEnablePush').onclick = async () => {const b=$('dayEnablePush'); b.disabled=true; try{await enablePush();}catch(e){$('dayPushState').textContent=e.message;}finally{b.disabled=false;}};
  form.addEventListener('submit', async event => {
    event.preventDefault(); const b=$('daySave'); b.disabled=true;
    try {await api('tasks' + (editing ? '/' + editing : ''), editing ? 'PUT' : 'POST', payload()); form.hidden=true; await refresh(); message(el('enabled').checked ? '任务已保存，云端会按时执行。' : '任务已保存为暂停状态，可随时开启。');}
    catch(error){message(error.message);} finally {b.disabled=false;}
  });
  refresh();
  setInterval(() => {renderClock(); if (!document.hidden && Date.now()-lastRefresh>15000) refresh();}, 5000);
  document.addEventListener('visibilitychange', () => {if(!document.hidden) refresh();});
})();
