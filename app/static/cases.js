(() => {
  const gallery = document.querySelector("#caseGrid");
  const header = document.querySelector("#caseDetailHeader");
  const date = document.querySelector("#caseCacheDate");
  const bar = document.querySelector("#caseActionBar");
  const ask = document.querySelector("#caseAskButton");
  let selectedCase = null;
  let openingCase = false;
  let loadVersion = 0;
  let replayController = null;
  let scrollIdleTimer = null;
  let lastScrollTop = 0;
  const responseCache = new Map();
  const icons = [
    '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
    '<path d="M3 19h18M5 15l5-7 4 4 5-8M5 9l5 4 4-7 5 9"/>',
    '<path d="M6 3v18M10 5h9M10 12h7M10 19h9"/><circle cx="6" cy="5" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="6" cy="19" r="1"/>',
    '<rect x="3" y="9" width="6" height="6" rx="1"/><path d="M9 12h5V5h6M14 12h6M14 12v7h6"/>',
    '<path d="M6 3v18M12 3v18M18 3v18"/><rect x="4" y="6" width="4" height="7" rx="1"/><rect x="10" y="10" width="4" height="6" rx="1"/><rect x="16" y="5" width="4" height="9" rx="1"/>',
  ].map(path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`);

  function setScrollHidden(hidden) {
    bar.classList.toggle("is-scroll-hidden", hidden);
    bar.inert = hidden;
  }

  messages.addEventListener("scroll", () => {
    if (!selectedCase) return;
    const next = messages.scrollTop;
    if (next > lastScrollTop + 2) setScrollHidden(true);
    else if (next < lastScrollTop - 2) setScrollHidden(false);
    lastScrollTop = next;
    window.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = window.setTimeout(() => setScrollHidden(false), 240);
  }, { passive: true });

  function clearCaseView() {
    window.clearTimeout(scrollIdleTimer);
    setScrollHidden(false);
    lastScrollTop = 0;
    replayController?.abort();
    replayController = null;
    selectedCase = null;
    loadVersion += 1;
    conversation.classList.remove("is-case");
    header.hidden = true;
    bar.hidden = true;
    const url = new URL(window.location.href);
    if (!openingCase && url.searchParams.has("case")) {
      url.searchParams.delete("case");
      history.replaceState(null, "", url);
    }
  }
  window.addEventListener("veya:chat-navigate", clearCaseView);

  function replayPause(ms, signal) {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve(false);
      const finish = (ready) => {
        window.clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        resolve(ready);
      };
      const cancel = () => finish(false);
      const timer = window.setTimeout(() => finish(true), ms);
      signal.addEventListener("abort", cancel, { once: true });
    });
  }

  async function replayAnswer(article, answer, signal) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const target = article.querySelector(".finalAnswer");
    const flow = document.createElement("div");
    flow.className = "mixedReport cachedReplay";
    flow.setAttribute("aria-busy", "true");
    target.append(flow);
    const artifacts = answer.reportArtifacts || [];
    const shown = new Set();
    const parts = sanitizeUserFacingInsight(answer.interpretation || "").split(/(\[\[AIME_CHART:[^\]]+\]\])/g);
    for (const part of parts) {
      if (signal.aborted) return;
      const marker = part.match(/^\[\[AIME_CHART:(.*?)\]\]$/);
      if (marker) {
        const index = artifacts.findIndex((item) => item.path === marker[1]);
        if (index >= 0 && !shown.has(index)) {
          flow.append(createStreamVisualizationArtifact(artifacts[index], index, { showActions: false, replay: true, signal }));
          shown.add(index);
          if (!await replayPause(280, signal)) return;
        }
        continue;
      }
      for (const paragraph of part.split(/\n\s*\n/).filter((text) => text.trim())) {
        if (signal.aborted) return;
        const block = document.createElement("div");
        block.className = "streamingAnswer reportInterpretation";
        block.innerHTML = formatInsight(paragraph);
        const walker = document.createTreeWalker(block, window.NodeFilter.SHOW_TEXT);
        const texts = [];
        while (walker.nextNode()) {
          texts.push({ node: walker.currentNode, value: walker.currentNode.textContent });
          walker.currentNode.textContent = "";
        }
        flow.append(block);
        // Reveal the rendered text, preserving links, lists and table markup.
        for (const { node, value } of texts) {
          for (let end = 18; end < value.length + 18; end += 18) {
            if (signal.aborted) return;
            node.textContent = value.slice(0, end);
            if (!await replayPause(30, signal)) return;
          }
        }
      }
    }
    flow.setAttribute("aria-busy", "false");
  }

  async function showCase(id, navigate = true) {
    const row = (window.veyaCases || []).find((item) => item.id === id);
    if (!row) return;
    openingCase = true;
    try { startNewChat(false, false); } finally { openingCase = false; }
    input.blur();
    const version = ++loadVersion;
    selectedCase = row;
    conversation.classList.remove("is-empty");
    conversation.classList.add("is-case");
    header.hidden = false;
    bar.hidden = false;
    date.textContent = "案例回放 · " + row.cachedDate;
    ask.disabled = false;
    if (isMobileLayout()) setSidebarCollapsed(true);
    const url = new URL(window.location.href);
    url.searchParams.set("case", id);
    if (navigate) history.pushState({ case: id }, "", url);
    else history.replaceState({ case: id }, "", url);
    messages.innerHTML = '<div class="caseLoading" role="status">正在打开缓存对话…</div>';
    try {
      if (!responseCache.has(id)) {
        const response = await fetch(row.conversationUrl);
        if (!response.ok) throw new Error("案例暂时无法打开");
        responseCache.set(id, await response.json());
      }
      if (version !== loadVersion) return;
      const cached = structuredClone(responseCache.get(id));
      messages.innerHTML = "";
      addUserMessage(cached.question);
      const article = createAssistantMessage(cached.question);
      article.classList.add("cachedCaseAnswer");
      replayController = new window.AbortController();
      const signal = replayController.signal;
      closeActivityDrawer();
      requestAnimationFrame(() => {
        if (version === loadVersion) messages.scrollTop = 0;
      });
      await replayAnswer(article, cached.answer, signal);
      if (signal.aborted || version !== loadVersion) return;
      const scrollTop = messages.scrollTop;
      renderFinalAnswer(article, cached.answer);
      closeActivityDrawer();
      requestAnimationFrame(() => {
        if (version === loadVersion) messages.scrollTop = scrollTop;
      });
    } catch (error) {
      if (version !== loadVersion) return;
      messages.innerHTML = '<div class="caseLoading" role="alert">' + escapeHtml(error.message) + '，你仍可以点击“问一问”重新提问。</div>';
    }
  }

  document.querySelector("#caseBackButton")?.addEventListener("click", () => startNewChat(false, false));
  ask?.addEventListener("click", () => {
    if (!selectedCase) return;
    const question = selectedCase.question;
    ask.disabled = true;
    startNewChat(true, false);
    input.value = question;
    updateComposerState();
    form.requestSubmit();
  });
  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(location.search).get("case");
    if (id) showCase(id, false);
    else if (selectedCase) startNewChat(false, false);
  });

  fetch("/static/cases/manifest.json").then((response) => {
    if (!response.ok) throw new Error("Case catalog unavailable");
    return response.json();
  }).then((rows) => {
    window.veyaCases = rows;
    gallery.innerHTML = rows.map((row, index) => `
      <button class="caseCard" type="button" data-case="${escapeHtml(row.id)}" style="--case-accent:${["#6d5efc", "#2784df", "#c17632", "#358a73", "#9661cb", "#5272b7"][index % 6]}">
        <div class="caseCardTop"><span class="caseCardIcon">${icons[index % icons.length]}</span><span class="caseCardTag">${escapeHtml(row.tag)}</span><span class="caseCardArrow" aria-hidden="true">↗</span></div>
        <h2>${escapeHtml(row.title)}</h2>
        <p>${escapeHtml(row.preview)}</p>
      </button>`).join("");
    gallery.querySelectorAll("[data-case]").forEach((card) => card.addEventListener("click", () => showCase(card.dataset.case)));
    const id = new URLSearchParams(location.search).get("case");
    if (id) showCase(id, false);
  }).catch(() => {
    document.querySelector("#homeCases").hidden = true;
  });
})();
