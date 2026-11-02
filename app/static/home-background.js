(() => {
  const shell = document.querySelector('.shell');
  const backdrop = document.querySelector('#homeBackdrop');
  const video = document.querySelector('#homeBackdropVideo');
  const conversation = document.querySelector('section.conversation');
  if (!shell || !backdrop || !video || !conversation) return;
  if (backdrop.dataset.motionInitialized === 'true') return;
  backdrop.dataset.motionInitialized = 'true';
  video.muted = true;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const opening = document.querySelector('#mentoraOpening');
  const intro = document.querySelector('#mentoraOpeningVideo');
  const subtitle = opening?.querySelector('.mentoraOpeningTitle p');
  const welcome = subtitle?.textContent || '';
  let audioBlocked = false;
  const excluded = ['tasks-view', 'widgets-view', 'portfolio-view', 'character-view', 'case-overlay-open'];
  const chatVisible = () => !conversation.hidden && !excluded.some(name => shell.classList.contains(name));
  let openingActive = false, deadline = 0, revealTimer = 0, hideTimer = 0;
  let previousInert = false, audioAttempt = 0, returnFocus = null;
  const saveData = () => Boolean(navigator.connection?.saveData);
  // Opt-in, local-only diagnostics. No telemetry or account data is collected.
  const debugEnabled = new URL(location.href).searchParams.get('openingDebug') === '1';
  let debugPanel = null;
  const debugEvents = [];
  function traceOpening(event, error) {
    if (!debugEnabled || !intro) return;
    let policy = null, allowed = null;
    try { policy = navigator.getAutoplayPolicy?.(intro) ?? null; } catch {}
    try { allowed = (document.permissionsPolicy || document.featurePolicy)?.allowsFeature('autoplay') ?? null; } catch {}
    debugEvents.push({event, muted:intro.muted, paused:intro.paused,
      time:Number(intro.currentTime.toFixed(2)), ready:intro.readyState,
      error:error ? {name:error.name, message:error.message, code:error.code} : null});
    if (!debugPanel) {
      debugPanel = document.createElement('pre');debugPanel.id = 'mentoraOpeningDebug';
      debugPanel.setAttribute('aria-label', '开场声音诊断');
      debugPanel.style.cssText = 'position:fixed;z-index:3000;right:12px;bottom:12px;max-width:min(680px,calc(100vw - 24px));max-height:65vh;overflow:auto;margin:0;padding:16px;border:1px solid #52606f;border-radius:8px;background:#101820f5;color:#e3f1ff;font:12px/1.5 monospace;white-space:pre-wrap;overflow-wrap:anywhere';
      document.body.append(debugPanel);
    }
    debugPanel.textContent = JSON.stringify({browser:navigator.userAgent,
      conditions:{visible:document.visibilityState,focused:document.hasFocus(),topFrame:window.top===window,
        autoplayFeatureAllowed:allowed,autoplayPolicy:policy,
        userActive:navigator.userActivation?.isActive ?? null,
        userHasBeenActive:navigator.userActivation?.hasBeenActive ?? null},
      media:{url:intro.currentSrc || intro.dataset.src,volume:intro.volume,duration:Number.isFinite(intro.duration)?intro.duration:null,
        audioDecodedBytes:intro.webkitAudioDecodedByteCount ?? null,error:intro.error ? {code:intro.error.code,message:intro.error.message}:null},
      events:debugEvents.slice(-24)},null,2);
  }
  if (debugEnabled && intro) for (const name of ['loadedmetadata','playing','ended','error']) intro.addEventListener(name, () => traceOpening(name));
  function sync() {
    const visible = chatVisible();
    shell.dataset.mentoraMotion = visible ? 'active' : 'inactive';
    // The background belongs to the viewport throughout home scrolling and chat.
    if (!visible || document.hidden || motion.matches || saveData() || openingActive) {
      video.pause();
      return;
    }
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    video.muted = true;
    if (video.paused) video.play().then(() => {
      if (!chatVisible() || document.hidden || motion.matches || saveData() || openingActive) video.pause();
    }).catch(() => { /* The local poster remains visible if autoplay is unavailable. */ });
  }
  function finishOpening() {
    if (!openingActive) return;
    traceOpening('finish');
    openingActive = false;++audioAttempt;
    clearTimeout(deadline);clearTimeout(revealTimer);
    intro.pause();intro.muted = true;
    document.removeEventListener('click', enableOpeningAudio, true);
    document.removeEventListener('keydown', enableOpeningAudio, true);
    opening.classList.remove('is-playing', 'is-revealed');
    shell.inert = previousInert;
    opening.setAttribute('aria-hidden', 'true');
    opening.removeAttribute('role');opening.removeAttribute('tabindex');
    if (subtitle) subtitle.textContent = welcome;
    if (document.activeElement === opening) returnFocus?.focus?.({preventScroll:true});
    hideTimer = setTimeout(() => { opening.hidden = true; }, 650);
    sync();
  }
  function resetDeadline() {
    clearTimeout(deadline);
    deadline = setTimeout(finishOpening, 8500);
  }
  function enableOpeningAudio(event) {
    if (!openingActive) return;
    if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    if (event?.type === 'keydown') event.preventDefault();
    const attempt = ++audioAttempt;
    if (audioBlocked && event) {
      intro.currentTime = 0;
      resetDeadline();
    }
    intro.muted = false;
    traceOpening(event ? 'gesture-audible' : 'autoplay-audible');
    intro.play().then(() => {
      if (!openingActive || attempt !== audioAttempt) return;
      traceOpening('audible-started');
      audioBlocked = false;opening.dataset.sound = 'playing';
      if (subtitle) subtitle.textContent = welcome;
      opening.setAttribute('aria-hidden', 'true');
      opening.removeAttribute('role');opening.removeAttribute('tabindex');
    }).catch(error => {
      traceOpening('audible-rejected', error);
      if (!openingActive || attempt !== audioAttempt) return;
      if (error?.name !== 'NotAllowedError') { finishOpening(); return; }
      // Browser permissions cannot be overridden. Make the sound action visible
      // on the existing opening, without restoring a toolbar or skip button.
      audioBlocked = true;opening.dataset.sound = 'blocked';
      if (subtitle) subtitle.textContent = welcome;
      opening.removeAttribute('aria-hidden');
      opening.setAttribute('role', 'button');opening.setAttribute('tabindex', '0');
      opening.setAttribute('aria-label', '点击画面，从头有声播放 Mentora 开场');
      opening.focus({preventScroll:true});
      intro.muted = true;
      intro.play().catch(() => {
        if (openingActive && attempt === audioAttempt) finishOpening();
      });
    });
  }
  function startOpening() {
    if (!opening || !intro || document.hidden || motion.matches || saveData()) return;
    returnFocus = document.activeElement;
    openingActive = true;previousInert = shell.inert;shell.inert = true;
    opening.hidden = false;opening.classList.add('is-playing');
    intro.src = intro.dataset.src;intro.muted = false;intro.volume = .8;
    document.addEventListener('click', enableOpeningAudio, true);
    document.addEventListener('keydown', enableOpeningAudio, true);
    resetDeadline();
    intro.addEventListener('playing', () => { if (openingActive) resetDeadline(); }, {once:true});
    revealTimer = setTimeout(() => opening.classList.add('is-revealed'), 1100);
    intro.addEventListener('ended', finishOpening, {once:true});
    intro.addEventListener('error', finishOpening, {once:true});
    enableOpeningAudio();
  }
  new MutationObserver(() => {
    sync();
  }).observe(shell, {attributes:true, attributeFilter:['class']});
  new MutationObserver(sync).observe(conversation, {attributes:true, attributeFilter:['hidden']});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && openingActive) finishOpening();
    sync();
  });
  motion.addEventListener('change', () => {
    if (motion.matches) finishOpening();
    sync();
  });
  navigator.connection?.addEventListener('change', () => {
    if (saveData()) finishOpening();
    sync();
  });
  window.addEventListener('pagehide', () => {
    finishOpening();clearTimeout(hideTimer);video.pause();
  });
  // Every page load starts its opening; route switches do not restart it.
  // No replay/skip controls or sample content are added to the page.
  startOpening();sync();
})();
