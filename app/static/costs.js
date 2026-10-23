(() => {
  const $ = id => document.getElementById(id);
  const shell = document.querySelector('.shell');
  const workspace = $('costWorkspace');
  if (!workspace) return;

  let days = 30;
  let loading = false;
  let internal = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  const tokens = value => {
    const total = Number(value || 0);
    if (total >= 1e6) return `${(total / 1e6).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}M`;
    if (total >= 1e3) return `${(total / 1e3).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}K`;
    return number(total);
  };
  const money = value => value == null ? '待定价' : `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  const date = value => new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));

  function platformLinks() {
    return `<section class="costPlatformGrid" aria-label="用量控制台入口">
      <a class="costPlatform" href="https://platform.deepseek.com/usage" target="_blank" rel="noopener noreferrer">
        <span class="costPlatformMark">D</span><span><b>DeepSeek</b><small>用量与账单</small></span><i>↗</i>
      </a>
      <a class="costPlatform" href="https://platform.kimi.com/console/account" target="_blank" rel="noopener noreferrer">
        <span class="costPlatformMark">K</span><span><b>Kimi</b><small>账户与用量</small></span><i>↗</i>
      </a>
    </section>`;
  }

  function render(data) {
    const providers = (data.providers || []).filter(item => ['deepseek', 'kimi'].includes(item.provider));
    const conversations = (data.conversations || []).filter(item => ['deepseek', 'kimi'].includes(item.provider));
    const input = providers.reduce((sum, item) => sum + Number(item.inputTokens || 0), 0);
    const cached = providers.reduce((sum, item) => sum + Number(item.cachedInputTokens || 0), 0);
    const output = providers.reduce((sum, item) => sum + Number(item.outputTokens || 0), 0);
    const reasoning = providers.reduce((sum, item) => sum + Number(item.reasoningTokens || 0), 0);
    const rows = conversations.length ? `<div class="costTableWrap"><table>
      <thead><tr><th>时间</th><th>对话</th><th>模型</th><th>输入</th><th>推理</th><th>输出</th><th>缓存命中</th><th>估算费用</th></tr></thead>
      <tbody>${conversations.map(item => `<tr>
        <td>${date(item.created)}</td>
        <td class="costConversationTitle"><b>${esc(item.title || '未命名对话')}</b><small>${esc(item.conversationId)}</small></td>
        <td><span class="costProviderPill">${item.provider === 'kimi' ? 'Kimi' : 'DeepSeek'}</span><small>${esc(item.model || '—')}</small></td>
        <td>${tokens(item.inputTokens)}</td><td class="costReasoningValue">${tokens(item.reasoningTokens)}</td>
        <td>${tokens(item.outputTokens)}</td><td>${tokens(item.cachedInputTokens)}</td><td>${money(item.costCny)}</td>
      </tr>`).join('')}</tbody></table></div>` : `<div class="costEmpty"><b>还没有可展示的对话用量</b><span>推理 Token 与对话归属从本次更新后开始记录。</span></div>`;

    $('costPanel').innerHTML = `${platformLinks()}
      <section class="costMetrics">
        <article><span>推理 Token</span><strong>${tokens(reasoning)}</strong><small>Reasoning</small></article>
        <article><span>输入 Token</span><strong>${tokens(input)}</strong><small>其中缓存 ${tokens(cached)}</small></article>
        <article><span>输出 Token</span><strong>${tokens(output)}</strong><small>Completion</small></article>
        <article><span>对话记录</span><strong>${number(conversations.length)}</strong><small>近 ${data.periodDays} 天</small></article>
      </section>
      <section class="costConversationCard">
        <header><div><h2>每次对话消耗</h2><p>按时间倒序，展示 DeepSeek / Kimi 每轮对话的 Token 构成</p></div><span>共 ${number(conversations.length)} 条</span></header>
        ${rows}
      </section>
      <p class="costDisclosure">推理 Token 来自模型运行时返回的 usage；费用为本地单价估算，最终账单以上方官方控制台为准。旧对话没有会话归属和推理 Token 字段，不在明细中补造。</p>`;
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch(`/api/costs/summary?days=${days}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || '用量数据加载失败');
      render(data);
    } catch (error) {
      $('costPanel').innerHTML = `${platformLinks()}<div class="costEmpty"><b>用量数据暂不可用</b><span>${esc(error.message)}</span><button data-cost-retry>重试</button></div>`;
    } finally {
      loading = false;
    }
  }

  function enter(push = true) {
    if (!shell) { void load(); return; }
    delete document.documentElement.dataset.entryView;
    internal = true;
    try { window.dispatchEvent(new CustomEvent('veya:chat-navigate')); } finally { internal = false; }
    shell.classList.remove('tasks-view', 'widgets-view', 'portfolio-view');
    shell.classList.add('cost-view');
    for (const id of ['taskWorkspace', 'taskSidebar', 'widgetWorkspace', 'widgetSidebar', 'portfolioWorkspace']) if ($(id)) $(id).hidden = true;
    workspace.hidden = false;
    for (const id of ['navHome', 'navTasks', 'navWidgets', 'navPortfolio', 'railHome', 'railTasks', 'railWidgets', 'railPortfolio']) {
      $(id)?.classList.remove('is-selected', 'is-active'); $(id)?.removeAttribute('aria-current');
    }
    for (const id of ['navCosts', 'railCosts']) {
      $(id)?.classList.add(id === 'railCosts' ? 'is-active' : 'is-selected'); $(id)?.setAttribute('aria-current', 'page');
    }
    if (typeof setSidebarCollapsed === 'function') setSidebarCollapsed(true);
    const url = new URL(location.href); url.search = ''; url.searchParams.set('tab', 'costs');
    if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
    void load();
  }

  function leave() {
    workspace.hidden = true; shell?.classList.remove('cost-view');
    for (const id of ['navCosts', 'railCosts']) { $(id)?.classList.remove('is-active', 'is-selected'); $(id)?.removeAttribute('aria-current'); }
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#navCosts,#railCosts')) enter();
    else if (event.target.closest('#navHome,#railHome,#navTasks,#railTasks,#navWidgets,#railWidgets,#navPortfolio,#railPortfolio,#railNewChat,#newChatButton,#dayCustomizeTasks')) leave();
  });
  window.addEventListener('veya:chat-navigate', () => { if (!internal) leave(); });
  window.addEventListener('popstate', () => new URL(location.href).searchParams.get('tab') === 'costs' ? enter(false) : leave());
  workspace.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.costDays) {
      days = Number(button.dataset.costDays);
      workspace.querySelectorAll('[data-cost-days]').forEach(item => item.classList.toggle('is-active', item === button));
      void load();
    } else if (button.hasAttribute('data-cost-retry')) void load();
  });
  if (!shell || new URL(location.href).searchParams.get('tab') === 'costs') enter(false);
  const timer = window.setInterval(() => { if (!document.hidden && (!shell || !workspace.hidden)) void load(); }, 60_000);
  window.addEventListener('beforeunload', () => window.clearInterval(timer), { once: true });
})();
