(() => {
  const backdrop = document.querySelector('#homeBackdrop');
  const video = document.querySelector('#homeBackdropVideo');
  if (!backdrop || !video) return;
  const conversation = document.querySelector('section.conversation');
  const desktop = matchMedia('(min-width: 761px)');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let playVersion = 0;
  const shouldPlay = () => !document.hidden && !motion.matches && !navigator.connection?.saveData
    && conversation?.classList.contains('is-empty') && conversation.scrollTop < backdrop.offsetHeight
    && !document.querySelector('.shell')?.classList.contains('tasks-view')
    && !document.querySelector('.shell')?.classList.contains('case-overlay-open');
  function sync() {
    backdrop.style.transform = `translateY(${-Math.max(0, conversation.scrollTop)}px)`;
    const light = document.documentElement.dataset.theme === 'light';
    const source = light ? (video.dataset.lightSrc || video.dataset.src) : video.dataset.src;
    const poster = light ? (video.dataset.lightPoster || video.dataset.darkPoster) : video.dataset.darkPoster;
    if (poster && video.getAttribute('poster') !== poster) video.poster = poster;
    if (video.getAttribute('src') && video.getAttribute('src') !== source) {
      video.pause();video.src = source;video.load();
    }
    const version = ++playVersion;
    if (!shouldPlay()) { video.pause(); return; }
    if (!video.getAttribute('src')) video.src = source;
    video.muted = true;
    if (!video.paused) return;
    video.play().then(() => {
      if (version !== playVersion && !shouldPlay()) video.pause();
    }).catch(() => { /* Keep the poster when autoplay is unavailable. */ });
  }
  const stateObserver = new MutationObserver(sync);
  stateObserver.observe(document.querySelector('.shell'), {attributes:true, attributeFilter:['class']});
  stateObserver.observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  stateObserver.observe(conversation, {attributes:true, attributeFilter:['class']});
  conversation.addEventListener('scroll', sync, {passive:true});
  document.addEventListener('visibilitychange', sync);
  desktop.addEventListener('change', sync);
  motion.addEventListener('change', sync);
  navigator.connection?.addEventListener('change', sync);
  sync();
})();
