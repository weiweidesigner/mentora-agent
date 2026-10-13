(() => {
  const gallery = document.querySelector("#caseGrid");
  const header = document.querySelector("#caseDetailHeader");
  const date = document.querySelector("#caseCacheDate");
  const bar = document.querySelector("#caseActionBar");
  const ask = document.querySelector("#caseAskButton");
  const back = document.querySelector("#caseBackButton");
  let returnFocus = null;
  let selectedCase = null;
  let openingCase = false;
  let loadVersion = 0;
  let replayController = null;
  let scrollIdleTimer = null;
  let lastScrollTop = 0;
  const responseCache = new Map();
  function syncCaseOverlay() {
    const mobile = !!selectedCase && isMobileLayout();
    conversation.setAttribute("aria-label", mobile ? date.textContent : "图文对话分析");
    if (mobile) {
      conversation.setAttribute("role", "dialog");
      conversation.setAttribute("aria-modal", "true");
      conversation.setAttribute("aria-labelledby", "caseCacheDate");
    } else {
      conversation.removeAttribute("role");
      conversation.removeAttribute("aria-modal");
      conversation.removeAttribute("aria-labelledby");
    }
    const sidebar = document.querySelector("#appSidebar");
    if (sidebar) sidebar.inert = mobile;
    back?.setAttribute("aria-label", mobile ? "关闭案例回放" : "返回首页");
  }
  window.addEventListener("resize", syncCaseOverlay);
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
    syncCaseOverlay();
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
          const host = createStreamVisualizationArtifact(artifacts[index], index, { showActions: false, replay: true, signal, demoLoadingMs: artifacts[index].caseDemoLoadingMs });
          flow.append(host);
          shown.add(index);
          if (!await replayPause(280, signal)) return;
          // Continue the narrative after this chart has finished its own loading/replay.
          for (let attempt = 0; attempt < 120; attempt += 1) {
            if (signal.aborted) return;
            const current = Array.from(flow.querySelectorAll(".streamvizArtifactHost,.reportFrameShell"))
              .find((element) => element.dataset.artifactUrl === host.dataset.artifactUrl);
            if (current?.classList.contains("reportFrameShell") && current.dataset.artifactReady === "true") break;
            if (current?.dataset.artifactCodeReady === "true" && current.dataset.streamvizRendered === "true") break;
            if (!await replayPause(100, signal)) return;
          }
        }
        continue;
      }
      for (const paragraph of part.split(/\n\s*\n/).filter((text) => text.trim())) {
        if (signal.aborted) return;
        const block = document.createElement("div");
        block.className = "streamingAnswer reportInterpretation";
        block.innerHTML = formatInsight(paragraph);
        block.querySelectorAll("li,tr,p,h1,h2,h3,h4").forEach((element) => { element.hidden = true; });
        const walker = document.createTreeWalker(block, window.NodeFilter.SHOW_TEXT);
        const texts = [];
        while (walker.nextNode()) {
          texts.push({ node: walker.currentNode, value: walker.currentNode.textContent });
          walker.currentNode.textContent = "";
        }
        flow.append(block);
        // Reveal the rendered text, preserving links, lists and table markup.
        for (const { node, value } of texts) {
          if (value.trim()) {
            for (let parent = node.parentElement; parent && parent !== block; parent = parent.parentElement) parent.hidden = false;
          }
          for (let end = 12; end < value.length + 12; end += 12) {
            if (signal.aborted) return;
            node.textContent = value.slice(0, end);
            if (!await replayPause(36, signal)) return;
          }
        }
      }
    }
    flow.setAttribute("aria-busy", "false");
  }

  async function showCase(id, navigate = true) {
    const row = (window.veyaCases || []).find((item) => item.id === id);
    if (!row) return;
    returnFocus = gallery.querySelector(`[data-case="${id}"]`);
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
    syncCaseOverlay();
    ask.disabled = false;
    if (isMobileLayout()) setSidebarCollapsed(true);
    if (isMobileLayout()) back?.focus({ preventScroll: true });
    const url = new URL(window.location.href);
    url.searchParams.set("case", id);
    if (navigate) history.pushState({ case: id }, "", url);
    else history.replaceState({ case: id }, "", url);
    messages.innerHTML = '<div class="caseLoading" role="status">正在打开缓存对话…</div>';
    try {
      if (!responseCache.has(id)) {
        const response = await fetch(row.conversationUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("案例暂时无法打开");
        responseCache.set(id, await response.json());
      }
      if (version !== loadVersion) return;
      const cached = structuredClone(responseCache.get(id));
      if (id === "presidents-sp500") {
        cached.answer.reportArtifacts?.forEach((artifact) => {
          if (artifact.path?.endsWith("/deepseek-case-presidents-sp500-dynamic-line.html")) artifact.caseDemoLoadingMs = 800;
        });
      }
      messages.innerHTML = "";
      addUserMessage(cached.question);
      const article = createAssistantMessage(cached.question);
      article.classList.add("cachedCaseAnswer");
      const cachedSteps = cached.activity?.steps || [];
      if (cachedSteps.length && typeof appendStep === "function") {
        cachedSteps.forEach((step, index) => appendStep(article, step.title, "原始案例的缓存执行记录", "done", `case-step-${index}`));
        article.dataset.cachedActivityCount = String(cachedSteps.length);
        if (Number(cached.activity.elapsedMs) > 0) article.dataset.cachedElapsedMs = String(cached.activity.elapsedMs);
        article.dataset.thinkingState = "done";
        article.activityEnded = true;
        if (typeof normalizeLang === "function") article.dataset.lang = normalizeLang(cached.answer.lang || "zh-CN");
        completeThinking(article);
        updateThinkingSummary(article, "已思考");
      }
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

  function closeCase() {
    startNewChat(false, false);
    returnFocus?.focus({ preventScroll: true });
  }
  back?.addEventListener("click", closeCase);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectedCase && isMobileLayout() && !document.querySelector(".activityDrawer.is-open")) closeCase();
  });
  ask?.addEventListener("click", () => {
    if (!selectedCase) return;
    const question = selectedCase.question;
    ask.disabled = true;
    startNewChat(false, false);
    input.value = question;
    updateComposerState();
    input.focus({ preventScroll: true });
  });
  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(location.search).get("case");
    if (id) showCase(id, false);
    else if (selectedCase) startNewChat(false, false);
  });

  fetch("/static/cases/manifest.json", { cache: "no-store" }).then((response) => {
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
