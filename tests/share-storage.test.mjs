import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../app/static/app.js', import.meta.url), 'utf8');
function implementation(name) {
  const start = source.indexOf(`function ${name}(`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next);
}

test('Share opens when history storage is full, preserves history and retries persistence', () => {
  const previous = [{ id: 'previous', question: 'Previous question', interpretation: 'Previous answer' }];
  let stored = JSON.stringify(previous);
  let quotaFull = true;
  const dialog = { hidden: true };
  const context = vm.createContext({
    volatileSessions: null,
    currentSession: { id: 'current', question: 'Current question', interpretation: 'Current answer' },
    SESSION_STORAGE_KEY: 'sessions',
    localStorage: {
      getItem: () => stored,
      setItem: (_key, value) => {
        if (quotaFull) throw Object.assign(new Error('Storage quota exceeded'), { name: 'QuotaExceededError' });
        stored = value;
      },
    },
    renderHistory: () => {},
    currentThemeMode: () => 'dark',
    document: { documentElement: { clientWidth: 695 }, querySelector: () => ({ textContent: '' }) },
    window: { innerWidth: 695 },
    sharePreviewTitle: {},
    sharePreviewIframe: { removeAttribute: () => {}, srcdoc: '' },
    prepareSharePreviewFrame: () => {},
    buildShareAnswerDocument: session => `<html>${session.answerHtml}</html>`,
    copyShareLinkText: {},
    shareDialog: dialog,
    transientShareSessionForArticle: () => null,
    activeShareSession: null,
    article: { querySelector: () => ({ innerHTML: '<p>Current answer</p>' }) },
  });
  vm.runInContext(['loadSessions', 'storeSessions', 'isRestorableSession', 'saveCurrentSession', 'openShareDialog'].map(implementation).join('\n'), context);
  vm.runInContext('openShareDialog(article)', context);
  assert.equal(dialog.hidden, false);
  assert.equal(context.sharePreviewIframe.srcdoc, '<html><p>Current answer</p></html>');
  assert.equal(stored, JSON.stringify(previous));
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(loadSessions().map(s => s.id))', context)), ['current', 'previous']);
  assert.equal(context.activeShareSession.themeMode, 'dark');
  quotaFull = false;
  vm.runInContext('saveCurrentSession()', context);
  assert.deepEqual(JSON.parse(stored).map(s => s.id), ['current', 'previous']);
  assert.equal(context.volatileSessions, null);
});
