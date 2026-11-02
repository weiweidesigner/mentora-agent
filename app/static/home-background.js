(() => {
  const shell = document.querySelector('.shell');
  const backdrop = document.querySelector('#homeBackdrop');
  const video = document.querySelector('#homeBackdropVideo');
  const conversation = document.querySelector('section.conversation');
  if (!shell || !backdrop || !video || !conversation) return;
  video.muted = true;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const opening = document.querySelector('#mentoraOpening');
  const intro = document.querySelector('#mentoraOpeningVideo');
  const openingKey = 'mentora:opening:20261102-audio';
  const excluded = ['tasks-view', 'widgets-view', 'portfolio-view', 'character-view', 'case-overlay-open'];
  const chatVisible = () => !conversation.hidden && !excluded.some(name => shell.classList.contains(name));
  let openingActive = false, deadline = 0, revealTimer = 0, hideTimer = 0;
  let previousInert = false, audioAttempt = 0;
  const saveData = () => Boolean(navigator.connection?.saveData);
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
    openingActive = false;++audioAttempt;
    clearTimeout(deadline);clearTimeout(revealTimer);
    intro.pause();intro.muted = true;
    document.removeEventListener('click', enableOpeningAudio, true);
    document.removeEventListener('keydown', enableOpeningAudio, true);
    opening.classList.remove('is-playing', 'is-revealed');
    shell.inert = previousInert;
    hideTimer = setTimeout(() => { opening.hidden = true; }, 650);
    sync();
  }
  function enableOpeningAudio() {
    if (!openingActive) return;
    const attempt = ++audioAttempt;
    intro.muted = false;
    intro.play().catch(error => {
      if (!openingActive || attempt !== audioAttempt) return;
      if (error?.name !== 'NotAllowedError') { finishOpening(); return; }
      // Keep the picture moving when sound needs a real click/key gesture.
      // A newer gesture must win over a pending autoplay permission result.
      intro.muted = true;
      intro.play().catch(() => {
        if (openingActive && attempt === audioAttempt) finishOpening();
      });
    });
  }
  function startOpening() {
    if (!opening || !intro || !chatVisible() || document.hidden || motion.matches || saveData()) return;
    const route = new URL(location.href).searchParams.get('tab');
    if (route && route !== 'home' && route !== 'chat') return;
    try {
      if (sessionStorage.getItem(openingKey)) return;
      sessionStorage.setItem(openingKey, 'played');
    } catch { /* A blocked store must not prevent opening the application. */ }
    openingActive = true;previousInert = shell.inert;shell.inert = true;
    opening.hidden = false;opening.classList.add('is-playing');
    intro.src = intro.dataset.src;intro.muted = false;intro.volume = .8;
    document.addEventListener('click', enableOpeningAudio, true);
    document.addEventListener('keydown', enableOpeningAudio, true);
    deadline = setTimeout(finishOpening, 8500);
    revealTimer = setTimeout(() => opening.classList.add('is-revealed'), 1100);
    intro.addEventListener('ended', finishOpening, {once:true});
    intro.addEventListener('error', finishOpening, {once:true});
    enableOpeningAudio();
  }
  new MutationObserver(() => {
    if (openingActive && !chatVisible()) finishOpening();
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
  // No replay/skip controls or sample content: these are decorative app layers.
  startOpening();sync();
})();
