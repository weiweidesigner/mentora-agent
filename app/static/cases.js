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
  const icons = [
    '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
    '<path d="M3 19h18M5 15l5-7 4 4 5-8M5 9l5 4 4-7 5 9"/>',
    '<path d="M6 3v18M10 5h9M10 12h7M10 19h9"/><circle cx="6" cy="5" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="6" cy="19" r="1"/>',
    '<rect x="3" y="9" width="6" height="6" rx="1"/><path d="M9 12h5V5h6M14 12h6M14 12v7h6"/>',
    '<path d="M6 3v18M12 3v18M18 3v18"/><rect x="4" y="6" width="4" height="7" rx="1"/><rect x="10" y="10" width="4" height="6" rx="1"/><rect x="16" y="5" width="4" height="9" rx="1"/>',
  ].map(path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`);

  const cardIcon = (row, index) => {
    if (row.category === "charts" && row.tool === "TradingViewChart") {
      return '<span class="caseCardIcon caseCardBrandIcon caseCardBrandIcon--tradingview" aria-hidden="true"><img class="brandLogoLight" src="/static/assets/brands/tradingview-black.png" alt=""><img class="brandLogoDark" src="/static/assets/brands/tradingview-white.png" alt=""></span>';
    }
    if (row.category === "charts" && row.id.startsWith("business-")) {
      return '<span class="caseCardIcon caseCardBrandIcon" aria-hidden="true"><img src="/static/assets/brands/ainvest.png" alt=""></span>';
    }
    return `<span class="caseCardIcon">${icons[index % icons.length]}</span>`;
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
      updateCaseTitle(true);
      const article = createAssistantMessage(cached.question);
      article.classList.add("cachedCaseAnswer");
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
    const square = document.querySelector("#inspirationSquare");
    if (!square) return;
    const tabs = square.querySelector("#inspirationTabs");
    const panel = square.querySelector("#inspirationPanel");
    try {
      const response = await fetch("/static/cases/inspiration/manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("灵感案例暂时无法加载");
      const catalog = await response.json();
      window.veyaCases = [...window.veyaCases, ...catalog.cases.filter(row => !window.veyaCases.some(existing => existing.id === row.id))];
      const categories = [{ id: "all", title: "全部" }, ...catalog.categories];
      let active = categories[0]?.id;
      let current = active;
      const render = () => {
        tabs.innerHTML = categories.map(category => {
          return `<button type="button" role="tab" id="inspiration-tab-${category.id}" aria-controls="inspirationPanel" aria-selected="${category.id === current}" tabindex="${category.id === current ? 0 : -1}" data-category="${category.id}">${escapeHtml(category.title)}</button>`;
        }).join("");
        panel.setAttribute("aria-labelledby", `inspiration-tab-${active}`);
        panel.innerHTML = catalog.categories.filter(category => active === "all" || category.id === active).map(category => {
          const rows = catalog.cases.filter(row => row.category === category.id);
          const cards = (items, level = 4) => `<div class="inspirationGrid">${items.map((row, index) => cardHtml(row, index).replaceAll("<h2>", `<h${level}>`).replaceAll("</h2>", `</h${level}>`)).join("")}</div>`;
          let content = cards(rows);
          if (category.id === "charts" && catalog.tradingViewGroups?.length) {
            const groups = [...catalog.tradingViewGroups, {id:"native",title:"公司财务与研究",description:"使用原生业务图表查看财报、估值与资金。"}];
            content = groups.map(group => {
              const items = rows.filter(row => group.id === "native" ? row.tool !== "TradingViewChart" : row.tool === "TradingViewChart" && row.widgetGroup === group.id);
              if (!items.length) return "";
              return `<section class="inspirationWidgetGroup" aria-labelledby="widget-group-${group.id}"><header class="inspirationWidgetGroupHeader"><h4 id="widget-group-${group.id}">${escapeHtml(group.id === "native" ? group.title : "TradingView · " + group.title)}</h4><p>${escapeHtml(group.description)}</p></header>${cards(items,5)}</section>`;
            }).join("");
          }
          return `<section class="inspirationCategory" aria-labelledby="inspiration-category-${category.id}"><header class="inspirationCategoryHeader"><h3 id="inspiration-category-${category.id}">${escapeHtml(category.title)}</h3></header><p class="inspirationCategorySubtitle">${escapeHtml(category.subtitle)}</p>${content}</section>`;
        }).join("");
      };
      tabs.addEventListener("click", event => {
        const tab = event.target.closest("[data-category]");
        if (!tab) return;
        active = tab.dataset.category;
        current = active;
        render();
        const selected = tabs.querySelector('[aria-selected="true"]');
        selected.focus({ preventScroll: true });
        tabs.scrollLeft += selected.getBoundingClientRect().left < tabs.getBoundingClientRect().left
          ? selected.getBoundingClientRect().left - tabs.getBoundingClientRect().left - 12
          : Math.max(0, selected.getBoundingClientRect().right - tabs.getBoundingClientRect().right + 12);
      });
      tabs.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = categories.findIndex(category => category.id === current);
        const next = event.key === "Home" ? 0 : event.key === "End" ? categories.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + categories.length) % categories.length;
        active = categories[next].id;
        current = active;
        render();
        const selected = tabs.querySelector('[aria-selected="true"]');
        selected.focus({ preventScroll: true });
        tabs.scrollLeft += selected.getBoundingClientRect().left < tabs.getBoundingClientRect().left
          ? selected.getBoundingClientRect().left - tabs.getBoundingClientRect().left - 12
          : Math.max(0, selected.getBoundingClientRect().right - tabs.getBoundingClientRect().right + 12);
      });
      let scrollPending = false;
      const updateCurrentCategory = () => {
        scrollPending = false;
        if (active !== "all" || selectedCase || !conversation.classList.contains("is-empty")) return;
        const bounds = conversation.getBoundingClientRect();
        const tabBounds = tabs.getBoundingClientRect();
        if (tabBounds.top >= bounds.bottom) return;
        const threshold = Math.max(bounds.top, tabBounds.bottom) + 30;
        let next = "all";
        panel.querySelectorAll('.inspirationCategory').forEach(section => {
          if (section.getBoundingClientRect().top <= threshold) next = section.getAttribute('aria-labelledby').replace('inspiration-category-', '');
        });
        if (conversation.scrollTop + conversation.clientHeight >= conversation.scrollHeight - 2) {
          next = catalog.categories[catalog.categories.length - 1]?.id || next;
        }
        if (next === current) return;
        current = next;
        tabs.querySelectorAll('[role="tab"]').forEach(tab => {
          const selected = tab.dataset.category === current;
          tab.setAttribute('aria-selected', String(selected));
          tab.tabIndex = selected ? 0 : -1;
        });
        panel.setAttribute('aria-labelledby', `inspiration-tab-${current}`);
        const selected = tabs.querySelector('[aria-selected="true"]');
        if (selected) tabs.scrollLeft += selected.getBoundingClientRect().left < tabBounds.left
          ? selected.getBoundingClientRect().left - tabBounds.left - 12
          : Math.max(0, selected.getBoundingClientRect().right - tabBounds.right + 12);
      };
      conversation.addEventListener('scroll', () => {
        if (scrollPending) return;
        scrollPending = true;
        requestAnimationFrame(updateCurrentCategory);
      }, {passive:true});
      panel.addEventListener("click", event => {
        const card = event.target.closest("[data-case]");
        if (card) showCase(card.dataset.case);
      });
      render();
      const id = new URLSearchParams(location.search).get("case");
      if (catalog.cases.some(row => row.id === id)) showCase(id, false);
    } catch {
      panel.innerHTML = '<p role="alert">灵感案例暂时无法加载，请刷新页面重试。</p>';
    }
  }
})();
