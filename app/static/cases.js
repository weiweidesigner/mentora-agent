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
  let overlay = null;
  let restoreOverlayNodes = null;
  let restoreHomeScroll = false;
  async function fetchCasePayload(url) {
    const retryDelays = [0, 250, 750, 1500];
    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (retryDelays[attempt]) await new Promise(resolve => window.setTimeout(resolve, retryDelays[attempt]));
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) return await response.json();
        if (response.status && response.status < 500) break;
      } catch (error) {
        // A deployment can briefly reset the upstream connection. Retry below.
      }
    }
    throw new Error("案例暂时无法打开");
  }
  function mountCaseOverlay(homeScrollTop) {
    const horizontalPositions = [...conversation.querySelectorAll('.caseLane,#inspirationTabs')]
      .map(node => [node, node.scrollLeft]);
    const origin = document.createComment("case conversation location");
    conversation.before(origin);
    const home = document.createElement("section");
    home.className = "conversation is-empty caseHomeBackground";
    home.inert = true;
    home.setAttribute("aria-hidden", "true");
    origin.before(home);
    const moved = [];
    conversation.querySelectorAll(":scope > #homeBackdrop,:scope > .homeHero,:scope > #chatForm,:scope > #homeCases,:scope > #myDay,:scope > #inspirationSquare").forEach(node => {
      const slot = document.createComment("home component location");
      node.before(slot);
      moved.push([node, slot]);
      home.append(node);
    });
    overlay = document.createElement("div");
    overlay.className = "caseOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "caseCacheDate");
    const panel = document.createElement("div");
    panel.className = "caseOverlayPanel";
    panel.append(conversation);
    const drawer = document.querySelector("#activityDrawer");
    let drawerSlot = null;
    if (drawer) {
      drawerSlot = document.createComment("activity drawer location");
      drawer.before(drawerSlot);
      panel.append(drawer);
    }
    overlay.append(panel);
    document.body.append(overlay);
    home.scrollTop = homeScrollTop;
    document.querySelector(".shell")?.classList.add("case-overlay-open");
    overlay.addEventListener("click", event => { if (event.target === overlay) closeCase(); });
    restoreOverlayNodes = () => {
      moved.forEach(([node, slot]) => slot.replaceWith(node));
      origin.replaceWith(conversation);
      if (drawerSlot) drawerSlot.replaceWith(drawer);
      home.remove();
      overlay.remove();
      overlay = null;
      restoreOverlayNodes = null;
      document.querySelector(".shell")?.classList.remove("case-overlay-open");
      const preserve = restoreHomeScroll;
      requestAnimationFrame(() => {
        if (!preserve || overlay || !conversation.classList.contains("is-empty")) return;
        conversation.scrollTop = homeScrollTop;
        horizontalPositions.forEach(([node, left]) => { node.scrollLeft = left; });
        window.dispatchEvent(new window.Event("veya:home-restored"));
      });
    };
  }
  function updateCaseTitle(measure = false) {
    const bubble = messages.querySelector(".message.user .userBubble");
    const showQuestion = !!selectedCase && !!bubble && messages.scrollTop > 0
      && bubble.getBoundingClientRect().bottom <= messages.getBoundingClientRect().top + 4;
    const title = selectedCase ? (showQuestion ? selectedCase.question : (isMobileLayout() ? "案例回放 · " : "案例回放：") + selectedCase.cachedDate) : "";
    date.classList.toggle("is-question", showQuestion);
    let text = date.querySelector(".caseTitleText");
    if (!text || text.dataset.title !== title) {
      text = document.createElement("span");
      text.className = "caseTitleText";
      text.dataset.title = title;
      text.textContent = title;
      date.replaceChildren(text);
      date.setAttribute("aria-label", title);
      date.title = title;
      measure = true;
    }
    if (measure) {
      date.classList.remove("is-marquee", "is-looping");
      text.querySelector(".caseTitleCopy")?.remove();
      const distance = showQuestion ? Math.max(0, text.scrollWidth - date.clientWidth) : 0;
      date.style.setProperty("--case-title-travel", `${-distance}px`);
      date.style.setProperty("--case-title-duration", `${Math.max(6, distance / 30 + 3)}s`);
      date.classList.toggle("is-marquee", distance > 1);
      if (distance > 1 && isMobileLayout()) {
        const travel = text.scrollWidth + 36;
        const copy = document.createElement("span");
        copy.className = "caseTitleCopy";
        copy.setAttribute("aria-hidden", "true");
        copy.textContent = title;
        text.append(copy);
        date.style.setProperty("--case-title-loop-travel", `${-travel}px`);
        date.style.setProperty("--case-title-duration", `${Math.max(8, travel / 30 + 2)}s`);
        date.classList.add("is-looping");
      }
    }
  }
  function syncCaseOverlay() {
    const mobile = !!selectedCase && isMobileLayout();
    conversation.setAttribute("aria-label", mobile ? date.getAttribute("aria-label") : "图文对话分析");
    conversation.removeAttribute("role");
    conversation.removeAttribute("aria-modal");
    conversation.removeAttribute("aria-labelledby");
    const sidebar = document.querySelector("#appSidebar");
    if (sidebar) sidebar.inert = !!selectedCase;
    back?.setAttribute("aria-label", "关闭案例回放");
    updateCaseTitle(true);
  }
  window.addEventListener("resize", syncCaseOverlay);
  // Lucide icon geometry (ISC), with chart-specific group/ring/waterfall/bubble
  // adaptations and play badges; see assets/brands/lucide-LICENSE.txt.
  // Match stable chart IDs, never their position in the gallery.
  const visualizationIcons = {
    bar_chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    line_chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    group_line: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7"/><path d="m7 8 3-2 4 3 5-5"/>',
    grouped_bar: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 10v7m3-11v11m6-5v5m3-9v9"/>',
    bar_line: '<path d="M12 16v5"/><path d="M16 14.639V21"/><path d="M20 10.656V21"/><path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15"/><path d="M4 18.463V21"/><path d="M8 14.656V21"/>',
    pie: '<path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"/><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>',
    double_ring_pie: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v4m5 5h4"/>',
    treemap: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    waterfall: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M8 8h2m3 4h2" stroke-dasharray="1 2"/><rect x="5" y="4" width="3" height="4" rx=".5"/><rect x="10" y="8" width="3" height="4" rx=".5"/><rect x="15" y="12" width="3" height="5" rx=".5"/>',
    dynamic_line: '<g transform="translate(0 3) scale(.85)"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/></g><path d="m17 2 5 3-5 3Z" fill="currentColor" stroke="none"/>',
    dynamic_bar: '<g transform="translate(0 3) scale(.85)"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 11h8"/><path d="M7 16h12"/><path d="M7 6h3"/></g><path d="m17 2 5 3-5 3Z" fill="currentColor" stroke="none"/>',
    dynamic_bubble: '<g transform="translate(0 3) scale(.85)"><circle cx="8" cy="8" r="2"/><circle cx="17" cy="7" r="1"/><circle cx="15" cy="15" r="3"/><circle cx="7" cy="17" r="1"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/></g><path d="m17 2 5 3-5 3Z" fill="currentColor" stroke="none"/>',
    mind_map: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
    flowchart: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
    journey: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    timeline: '<path d="M10 6h8"/><path d="M12 16h6"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M8 11h7"/>',
    kline: '<path d="M9 5v4"/><rect width="4" height="6" x="7" y="9" rx="1"/><path d="M9 15v2"/><path d="M17 3v2"/><rect width="4" height="8" x="15" y="5" rx="1"/><path d="M17 13v3"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/>',
  };
  const reportIcon = '<svg viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true"><path d="M972.0832 537.6h-255.488c-3.6864 183.808-46.08 342.0672-107.1616 424.9088a461.056 461.056 0 0 0 362.6496-424.9088z m0-51.2a461.056 461.056 0 0 0-362.6496-424.9088c61.1328 82.8416 103.4752 241.152 107.1104 424.9088h255.5392z m-920.1664 0h255.488c3.6864-183.808 46.08-342.0672 107.1616-424.9088A461.056 461.056 0 0 0 51.9168 486.4z m0 51.2a461.056 461.056 0 0 0 362.6496 424.9088c-61.1328-82.8416-103.4752-241.152-107.1104-424.9088H51.9168z m613.376 0H358.7072C363.8272 782.2336 442.4192 972.8 512 972.8c69.632 0 148.1728-190.5664 153.344-435.2z m0-51.2C660.224 241.7664 581.632 51.2 512 51.2 442.368 51.2 363.8272 241.7664 358.656 486.4h306.688zM512 1024C229.2224 1024 0 794.7776 0 512S229.2224 0 512 0s512 229.2224 512 512-229.2224 512-512 512z"/></svg>';
  const contentIcons = {
    video: '<path d="m12.296 3.464 3.02 3.956"/><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m6.18 5.276 3.1 3.899"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    backtest: '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/>',
    ratings: '<path d="M11 13H7"/><path d="M19 9h-4"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/><rect x="15" y="5" width="4" height="12" rx="1"/><rect x="7" y="8" width="4" height="9" rx="1"/>',
    event: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
    document: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  };
  window.MentoraIconLibrary = Object.freeze({...visualizationIcons,...contentIcons});
  const homeCaseIcons = {
    "sse-kdj-backtest": "backtest", "midterm-election-1902-2026": "report",
    "amd-ratings": "ratings", "presidents-sp500": "dynamic_line",
    "ths-dividends": "timeline", "us-catalysts": "mind_map",
    "jpm-technical": "kline", "sse-events": "event",
  };
  const cardIcon = (row, index) => {
    const contentType = row.category === "videos" ? "video" : row.category === "art" ? "image" : homeCaseIcons[row.id];
    if (contentType && contentType !== "report") {
      const path = contentIcons[contentType] || visualizationIcons[contentType];
      return `<span class="caseCardIcon" data-icon="${contentType}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg></span>`;
    }
    if (row.category === "reports" || contentType === "report") {
      return `<span class="caseCardIcon" data-icon="report">${reportIcon}</span>`;
    }
    const chartType = row.category === "analysis" ? row.id.replace(/^analysis-/, "") : "";
    if (visualizationIcons[chartType]) {
      return `<span class="caseCardIcon" data-icon="${chartType}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${visualizationIcons[chartType]}</svg></span>`;
    }
    if (row.category === "charts" && row.tool === "TradingViewChart") {
      return '<span class="caseCardIcon caseCardBrandIcon caseCardBrandIcon--tradingview" aria-hidden="true"><img class="brandLogoLight" src="/static/assets/brands/tradingview-black.png" alt=""><img class="brandLogoDark" src="/static/assets/brands/tradingview-white.png" alt=""></span>';
    }
    if (row.category === "charts" && row.id.startsWith("business-")) {
      return '<span class="caseCardIcon caseCardBrandIcon" aria-hidden="true"><img src="/static/assets/brands/ainvest.png" alt=""></span>';
    }
    return `<span class="caseCardIcon" data-icon="document"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${contentIcons.document}</svg></span>`;
  };

  const cardHtml = (row, index) => `
      <button class="caseCard" type="button" data-case="${escapeHtml(row.id)}" style="--case-accent:${["#6d5efc", "#2784df", "#c17632", "#358a73", "#9661cb", "#5272b7"][index % 6]}">
        <div class="caseCardTop">${cardIcon(row, index)}<span class="caseCardTag">${escapeHtml(row.tag)}</span></div>
        <h2>${row.mobileTitle ? `<span class="caseCardTitleFull">${escapeHtml(row.title)}</span><span class="caseCardTitleMobile">${escapeHtml(row.mobileTitle)}</span>` : escapeHtml(row.title)}</h2>
        <p>${escapeHtml(row.preview)}</p>
      </button>`;

  function setScrollHidden(hidden) {
    bar.classList.toggle("is-scroll-hidden", hidden);
    bar.inert = hidden;
  }

  messages.addEventListener("scroll", () => {
    if (!selectedCase) return;
    const next = messages.scrollTop;
    updateCaseTitle();
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
    restoreOverlayNodes?.();
    header.hidden = true;
    bar.hidden = true;
    const url = new URL(window.location.href);
    if (!openingCase && url.searchParams.has("case")) {
      url.searchParams.delete("case");
      url.searchParams.delete("dayResult");
      url.searchParams.delete("dayShare");
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
    // Native image and video presentation is shared with live answers.
    if (answer.videos?.length || answer.reportArtifacts?.some(item => typeof isGeneratedImageArtifact === "function" && isGeneratedImageArtifact(item))) return;
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
      if (!part.trim()) continue;
      if (signal.aborted) return;
      const block = document.createElement("div");
      block.className = "streamingAnswer reportInterpretation";
      // Format the complete narrative segment so loose Markdown lists remain
      // one list instead of restarting at 1 after every blank line.
      block.innerHTML = formatInsight(part.trim());
      block.querySelectorAll("li,tr,p,h1,h2,h3,h4,h5,h6,.markdownTableWrap").forEach((element) => { element.hidden = true; });
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
    flow.setAttribute("aria-busy", "false");
  }

  async function showCase(id, navigate = true) {
    const row = (window.veyaCases || []).find((item) => item.id === id);
    if (!row) return;
    returnFocus = document.activeElement?.matches(`[data-case="${id}"]`) ? document.activeElement : document.querySelector(`[data-case="${id}"]`);
    // Capture before startNewChat resets the shared conversation scroller.
    const homeScrollTop = overlay
      ? document.querySelector(".caseHomeBackground").scrollTop
      : conversation.scrollTop;
    openingCase = true;
    try { startNewChat(false, false); } finally { openingCase = false; }
    mountCaseOverlay(homeScrollTop);
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
    back?.focus({ preventScroll: true });
    const url = new URL(window.location.href);
    url.searchParams.set("case", id);
    if (navigate) history.pushState({ case: id }, "", url);
    else history.replaceState({ case: id }, "", url);
    messages.innerHTML = '<div class="caseLoading caseAnswerLoading" role="status" aria-label="答案正在加载" aria-busy="true"><span class="caseLoadingDots" aria-hidden="true"><i></i><i></i><i></i></span></div>';
    try {
      if (!responseCache.has(id)) {
        responseCache.set(id, await fetchCasePayload(row.conversationUrl));
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
      updateCaseTitle(true);
      const article = createAssistantMessage(cached.question);
      article.classList.add("cachedCaseAnswer");
      article.dataset.sessionPersistence = 'none';
      const cachedSteps = cached.activity?.steps || [];
      if (typeof restoreSavedActivity === 'function') {
        await restoreSavedActivity(article, cached.activity || {});
        if (version !== loadVersion) return;
        article.dataset.cachedActivityCount = String(cachedSteps.length || article.querySelectorAll('.thinkingSteps li').length);
        article.dataset.thinkingState = 'done';
        updateThinkingSummary(article, '已思考');
      } else if (cachedSteps.length && typeof appendStep === "function") {
        cachedSteps.forEach((step, index) => appendStep(article, step.title, step.detail || "此案例未保存该步骤的执行明细", step.state || "done", `case-step-${index}`));
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

  // Daily results share the same cached-answer viewer, refreshed on each open.
  window.addEventListener("veya:open-day-result", event => {
    const row = event.detail;
    if (!row?.id || !row.id.startsWith("day-")) return;
    window.veyaCases = (window.veyaCases || []).filter(item => item.id !== row.id);
    window.veyaCases.push(row);
    responseCache.delete(row.id);
    showCase(row.id);
  });

  function closeCase() {
    restoreHomeScroll = true;
    try { startNewChat(false, false); } finally { restoreHomeScroll = false; }
    returnFocus?.focus({ preventScroll: true });
  }
  back?.addEventListener("click", closeCase);
  window.addEventListener("keydown", (event) => {
    if (!selectedCase) return;
    // The native image dialog owns its keyboard handling while it is open.
    if (document.querySelector("#generatedImageDialog")?.open) return;
    const videoOverlay = document.querySelector(".aimeVideoOverlay.is-open");
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (videoOverlay) videoOverlay.querySelector(".aimeVideoClose")?.click();
      else if (document.querySelector(".activityDrawer.is-open")) { closeActivityDrawer(); back?.focus({ preventScroll: true }); }
      else closeCase();
    }
    if (event.key === "Tab" && overlay) {
      const controls = Array.from((videoOverlay || overlay).querySelectorAll('button:not(:disabled),a[href],input,textarea,select,[tabindex="0"]'))
        .filter(node => node.getClientRects().length && !node.closest('[inert]') && !node.closest('.activityDrawer:not(.is-open)'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }, true);
  ask?.addEventListener("click", () => {
    if (!selectedCase) return;
    const question = selectedCase.question;
    ask.disabled = true;
    restoreHomeScroll = false;
    try { startNewChat(false, false); } finally { restoreHomeScroll = false; }
    input.value = question;
    updateComposerState();
    input.focus({ preventScroll: true });
  });
  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(location.search).get("case");
    if (id) showCase(id, false);
    else if (selectedCase) closeCase();
  });

  fetch("/static/cases/manifest.json", { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("Case catalog unavailable");
    return response.json();
  }).then((rows) => {
    window.veyaCases = [...rows, ...(window.veyaCases || []).filter(row => row.id.startsWith("day-"))];
    loadInspiration(cardHtml);
    const desktop = window.matchMedia("(min-width:761px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion:reduce)");
    let lanes = [], hovered = false, suppressClickUntil = 0;
    let previousFrame = performance.now();
    const resizeObserver = new ResizeObserver(() => lanes.forEach(sizeLane));
    function sizeLane(state) {
      const { lane, track } = state;
      const original = track.firstElementChild;
      const cycle = original.getBoundingClientRect().width;
      if (!cycle) return;
      const count = Math.ceil(lane.clientWidth / cycle) + 2;
      while (track.children.length < count) {
        const copy = original.cloneNode(true);
        copy.setAttribute("aria-hidden", "true");
        copy.querySelectorAll("button").forEach(button => button.tabIndex = -1);
        track.append(copy);
      }
      while (track.children.length > count) track.lastElementChild.remove();
      state.position = cycle + (state.cycle ? ((state.position % cycle) + cycle) % cycle : (state.direction < 0 ? cycle * .35 : 0));
      state.cycle = cycle;
      lane.scrollLeft = state.position;
    }
    function renderGallery() {
      resizeObserver.disconnect();
      lanes = [];
      hovered = gallery.matches(":hover");
      const split = Math.ceil(rows.length / 2);
      gallery.innerHTML = [rows.slice(0, split), rows.slice(split)].map((items, rowIndex) => `
        <div class="caseLane" aria-label="案例泳道 ${rowIndex + 1}">
          <div class="caseLaneTrack"><div class="caseLaneSet">${items.map((row, index) => cardHtml(row, index + (rowIndex ? split : 0))).join("")}</div></div>
        </div>`).join("");
      gallery.querySelectorAll(".caseLane").forEach((lane, index) => {
        const state = { lane, track: lane.firstElementChild, direction: index ? -1 : 1, position: 0, cycle: 0, dragging: false, manualUntil: 0 };
        lanes.push(state);
        resizeObserver.observe(lane);
        sizeLane(state);
        // Touch uses native scrolling; pause drift through the swipe and inertia.
        lane.addEventListener("pointerdown", event => {
          if (event.pointerType === "mouse") return;
          state.dragging = true;
        });
        const endTouch = event => {
          if (event.pointerType === "mouse") return;
          state.dragging = false;
          state.position = lane.scrollLeft;
          state.manualUntil = performance.now() + 2500;
        };
        lane.addEventListener("pointerup", endTouch);
        lane.addEventListener("pointercancel", endTouch);
        let pointer = null;
        lane.addEventListener("pointerdown", event => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          pointer = { id: event.pointerId, x: event.clientX, position: lane.scrollLeft };
        });
        lane.addEventListener("pointermove", event => {
          if (!pointer || event.pointerId !== pointer.id) return;
          const distance = event.clientX - pointer.x;
          if (!state.dragging && Math.abs(distance) < 5) return;
          state.dragging = true;
          lane.classList.add("is-dragging");
          if (!lane.hasPointerCapture(event.pointerId)) lane.setPointerCapture(event.pointerId);
          event.preventDefault();
          state.position = Math.max(0, Math.min(lane.scrollWidth - lane.clientWidth, pointer.position - distance));
          lane.scrollLeft = state.position;
        });
        const endDrag = event => {
          if (!pointer || event.pointerId !== pointer.id) return;
          if (state.dragging) suppressClickUntil = performance.now() + 250;
          if (lane.hasPointerCapture(event.pointerId)) lane.releasePointerCapture(event.pointerId);
          pointer = null;
          state.dragging = false;
          state.position = lane.scrollLeft;
          lane.classList.remove("is-dragging");
        };
        lane.addEventListener("pointerup", endDrag);
        lane.addEventListener("pointercancel", endDrag);
        lane.addEventListener("lostpointercapture", endDrag);
        lane.addEventListener("wheel", () => { state.manualUntil = performance.now() + 1200; }, { passive: true });
      });
    }
    gallery.addEventListener("mouseenter", () => { hovered = true; });
    gallery.addEventListener("mouseleave", () => { hovered = false; });
    gallery.addEventListener("click", event => {
      if (performance.now() < suppressClickUntil) { event.preventDefault(); return; }
      const card = event.target.closest("[data-case]");
      if (card) showCase(card.dataset.case);
    });
    function moveLanes(now) {
      const elapsed = Math.min(64, now - previousFrame) / 1000;
      previousFrame = now;
      if (!document.hidden && !selectedCase && conversation.classList.contains("is-empty")) {
        const paused = hovered || !!gallery.querySelector(":focus-visible") || reducedMotion.matches;
        lanes.forEach(state => {
          if (!state.cycle || state.dragging) return;
          if (paused || now < state.manualUntil) { state.position = state.lane.scrollLeft; return; }
          state.position += state.direction * 18 * elapsed;
          state.position = state.cycle + ((state.position - state.cycle) % state.cycle + state.cycle) % state.cycle;
          state.lane.scrollLeft = state.position;
        });
      }
      requestAnimationFrame(moveLanes);
    }
    window.addEventListener("veya:home-restored", () => lanes.forEach(state => {
      state.position = state.lane.scrollLeft;
      state.manualUntil = performance.now() + 2500;
    }));
    window.addEventListener('mentora:case-favorite-removed',event=>{
      const ids=new Set(event.detail.ids);
      rows=rows.filter(row=>!ids.has(row.id));
      window.veyaCases=window.veyaCases.filter(row=>!ids.has(row.id));
      ids.forEach(id=>responseCache.delete(id));
      renderGallery();
    });
    desktop.addEventListener("change", renderGallery);
    renderGallery();
    requestAnimationFrame(moveLanes);
    const id = new URLSearchParams(location.search).get("case");
    if (id) showCase(id, false);
  }).catch(() => {
    document.querySelector("#homeCases").hidden = true;
    window.veyaCases = [];
    loadInspiration(cardHtml);
  });

  async function loadInspiration(cardHtml) {
    const square=document.querySelector('#inspirationSquare');if(!square)return;
    const tabs=square.querySelector('#inspirationTabs'),panel=square.querySelector('#inspirationPanel');
    try {
      let catalog,publicError=false;
      try {
        const response=await fetch('/static/cases/inspiration/manifest.json',{cache:'no-store'});
        if(!response.ok)throw new Error('catalog');
        catalog=await response.json();
      }catch{
        publicError=true;catalog={cases:[],categories:[]};
      }
      await window.MentoraCaseFavorites?.ready;
      let personal=[...(window.MentoraCaseFavorites?.rows||[])];
      const categories=[{id:'mine',title:'我的',subtitle:''},...catalog.categories.filter(c=>!['all','mine'].includes(c.id))];
      window.veyaCases=[...(window.veyaCases||[]),...[...personal,...catalog.cases].filter(row=>!(window.veyaCases||[]).some(item=>item.id===row.id))];
      let current='mine',scrollPending=false;
      const revealTab=()=>{
        const selected=tabs.querySelector('[aria-selected="true"]');if(!selected)return;
        const bounds=tabs.getBoundingClientRect(),rect=selected.getBoundingClientRect();
        tabs.scrollLeft+=rect.left<bounds.left?rect.left-bounds.left-12:Math.max(0,rect.right-bounds.right+12);
      };
      const activate=(id,focus=false)=>{
        current=id;
        tabs.querySelectorAll('[role="tab"]').forEach(tab=>{
          const selected=tab.dataset.category===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
          if(selected&&focus)tab.focus({preventScroll:true});
        });
        panel.setAttribute('aria-labelledby','inspiration-tab-'+id);revealTab();
      };
      const mineRows=()=>{
        const seen=new Set();
        return personal.filter(row=>{const key=row.fingerprint||row.id;if(seen.has(key))return false;seen.add(key);return true;}).map(row=>({...row,category:'mine'}));
      };
      const render=()=>{
        tabs.innerHTML=categories.map(category=>'<button type="button" role="tab" id="inspiration-tab-'+category.id+'" aria-controls="inspirationPanel" aria-selected="'+(category.id===current)+'" tabindex="'+(category.id===current?0:-1)+'" data-category="'+category.id+'">'+escapeHtml(category.title)+'</button>').join('');
        panel.innerHTML=categories.map(category=>{
          const rows=category.id==='mine'?mineRows():catalog.cases.filter(row=>row.category===category.id);
          const cards=(items,level=4)=>'<div class="inspirationGrid">'+items.map((row,index)=>cardHtml(row,index).replaceAll('<h2>','<h'+level+'>').replaceAll('</h2>','</h'+level+'>')).join('')+'</div>';
          let content=category.id==='mine'&&!rows.length?'<p class="inspirationEmpty">暂无收藏</p>':cards(rows);
          if(category.id==='charts'&&catalog.tradingViewGroups?.length){
            const groups=[...catalog.tradingViewGroups,{id:'native',title:'公司财务与研究',description:'使用原生业务图表查看财报、估值与资金。'}];
            content=groups.map(group=>{
              const items=rows.filter(row=>group.id==='native'?row.tool!=='TradingViewChart':row.tool==='TradingViewChart'&&row.widgetGroup===group.id);
              if(!items.length)return '';
              return '<section class="inspirationWidgetGroup" aria-labelledby="widget-group-'+group.id+'"><header class="inspirationWidgetGroupHeader"><h4 id="widget-group-'+group.id+'">'+escapeHtml(group.id==='native'?group.title:'TradingView · '+group.title)+'</h4><p>'+escapeHtml(group.description)+'</p></header>'+cards(items,5)+'</section>';
            }).join('');
          }
          return '<section id="inspiration-section-'+category.id+'" class="inspirationCategory" aria-labelledby="inspiration-category-'+category.id+'"><header class="inspirationCategoryHeader"><h3 id="inspiration-category-'+category.id+'">'+escapeHtml(category.title)+'</h3></header>'+(category.subtitle?'<p class="inspirationCategorySubtitle">'+escapeHtml(category.subtitle)+'</p>':'')+content+'</section>';
        }).join('')+(publicError?'<p role="alert">灵感案例暂时无法加载，请刷新页面重试。</p>':'');
        activate(current);
      };
      const jump=id=>{
        const section=panel.querySelector('#inspiration-section-'+id);if(!section)return;
        activate(id,true);
        const top=conversation.scrollTop+section.getBoundingClientRect().top-conversation.getBoundingClientRect().top-(parseFloat(window.getComputedStyle(tabs).top)||0)-tabs.offsetHeight-12;
        conversation.scrollTo?.({top:Math.max(0,top),behavior:'auto'});
      };
      tabs.addEventListener('click',event=>{const tab=event.target.closest('[data-category]');if(tab)jump(tab.dataset.category);});
      tabs.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        const index=categories.findIndex(category=>category.id===current);
        const next=event.key==='Home'?0:event.key==='End'?categories.length-1:(index+(event.key==='ArrowRight'?1:-1)+categories.length)%categories.length;
        jump(categories[next].id);
      });
      const updateCurrentCategory=()=>{
        scrollPending=false;
        if(selectedCase||!conversation.classList.contains('is-empty'))return;
        const bounds=conversation.getBoundingClientRect(),tabBounds=tabs.getBoundingClientRect();
        if(tabBounds.top>=bounds.bottom)return;
        const threshold=Math.max(bounds.top,tabBounds.bottom)+30;
        let next='mine';
        panel.querySelectorAll('.inspirationCategory').forEach(section=>{
          if(section.getBoundingClientRect().top<=threshold)next=section.id.replace('inspiration-section-','');
        });
        if(conversation.scrollTop>0&&conversation.scrollTop+conversation.clientHeight>=conversation.scrollHeight-2)next=categories[categories.length-1].id;
        if(next!==current)activate(next);
      };
      const scheduleSpy=()=>{if(!scrollPending){scrollPending=true;requestAnimationFrame(updateCurrentCategory);}};
      conversation.addEventListener('scroll',scheduleSpy,{passive:true});
      window.addEventListener('veya:home-restored',scheduleSpy);
      window.addEventListener('resize',scheduleSpy);
      panel.addEventListener('click',event=>{const card=event.target.closest('[data-case]');if(card)showCase(card.dataset.case);});
      window.addEventListener('mentora:case-favorite-saved',event=>{
        const row=event.detail;personal=[row,...personal.filter(item=>item.id!==row.id)];
        window.veyaCases=[row,...window.veyaCases.filter(item=>item.id!==row.id)];render();
      });
      window.addEventListener('mentora:case-favorite-removed',event=>{
        const ids=new Set(event.detail.ids);personal=personal.filter(row=>!ids.has(row.id));
        window.veyaCases=window.veyaCases.filter(row=>!ids.has(row.id));ids.forEach(id=>responseCache.delete(id));render();
      });
      render();tabs.setAttribute('aria-busy','false');panel.setAttribute('aria-busy','false');panel.classList.add('homeContentReady');
      const id=new URLSearchParams(location.search).get('case');
      if([...personal,...catalog.cases].some(row=>row.id===id))showCase(id,false);
    }catch{
      tabs.replaceChildren();tabs.setAttribute('aria-busy','false');panel.setAttribute('aria-busy','false');
      panel.innerHTML='<p role="alert">案例暂时无法加载，请刷新页面重试。</p>';
    }
  }
})();
