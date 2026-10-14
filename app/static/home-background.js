(() => {
  const backdrop = document.querySelector('#homeBackdrop');
  const video = document.querySelector('#homeBackdropVideo');
  if (!backdrop || !video) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let playVersion = 0;
  const shouldPlay = () => backdrop.parentElement.scrollTop < backdrop.offsetHeight && !document.hidden && !motion.matches
    && !navigator.connection?.saveData
    && backdrop.parentElement?.classList.contains('is-empty')
    && !document.querySelector('.shell')?.classList.contains('case-overlay-open');
  function sync() {
    const version = ++playVersion;
    if (!shouldPlay()) { video.pause(); return; }
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    video.muted = true;
    video.play().then(() => {
      if (version !== playVersion && !shouldPlay()) video.pause();
    }).catch(() => { /* Keep the poster when autoplay is unavailable. */ });
  }
  const stateObserver = new MutationObserver(sync);
  stateObserver.observe(document.querySelector('.shell'), {attributes:true, attributeFilter:['class']});
  stateObserver.observe(backdrop.parentElement, {attributes:true, attributeFilter:['class']});
  backdrop.parentElement.addEventListener('scroll', sync, {passive:true});
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  navigator.connection?.addEventListener('change', sync);
  sync();
})();
