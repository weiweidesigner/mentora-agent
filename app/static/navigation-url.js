(() => {
  if (window.MentoraNavigation) return;
  // Each workspace owns its route parameters. Preserve unrelated host options.
  const owned = ['tab', 'board', 'portfolioView', 'task', 'run', 'dayResult', 'dayShare', 'case', 'settings'];
  const fields = {home: [], widgets: ['board'], portfolio: ['portfolioView'], tasks: ['task', 'run', 'dayShare'], costs: [], character: []};
  function url(target, state = {}, base = location.href) {
    if (!Object.hasOwn(fields, target)) throw new Error('Unknown navigation target');
    const result = new URL(base);
    for (const key of owned) result.searchParams.delete(key);
    if (target !== 'home') result.searchParams.set('tab', target);
    for (const key of fields[target]) {
      if (state[key]) result.searchParams.set(key, state[key]);
    }
    return result;
  }
  window.MentoraNavigation = Object.freeze({url});
  // Old incomplete links are recoverable only when they identify one workspace.
  // Mixed leftovers cannot identify a destination; keep the home page instead.
  const initial = new URL(location.href), params = initial.searchParams;
  if (Object.hasOwn(fields, params.get('tab'))) {
    const state = Object.fromEntries(params);
    if (params.get('tab') === 'tasks') state.task ||= state.dayResult;
    const normalized = url(params.get('tab'), state, initial);
    if (normalized.href !== initial.href) history.replaceState(history.state, '', normalized);
  } else if (!params.has('tab') && (params.has('board') || params.has('portfolioView')) &&
      !['task', 'dayResult', 'dayShare', 'case'].some(key => params.has(key))) {
    const target = params.has('board') && params.has('portfolioView') ? 'home' : params.has('board') ? 'widgets' : 'portfolio';
    const normalized = url(target, Object.fromEntries(params), initial);
    history.replaceState(history.state, '', normalized);
  }
})();
