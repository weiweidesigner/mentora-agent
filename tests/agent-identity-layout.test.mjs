import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const script = readFileSync(new URL('../app/static/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/static/styles.css', import.meta.url), 'utf8');

test('Mentora Deal identity stays inside the assistant bubble', () => {
  const start = script.indexOf('function showAgentIdentity(');
  const end = script.indexOf('function applyRunTiming(', start);
  const dom = new JSDOM('<img class="brandMark" src="/static/assets/mentora-logo.svg"><article><div class="assistantBubble"></div></article>', {
    url: 'https://example.com/mentora/',
    runScripts: 'outside-only',
  });
  dom.window.eval(`${script.slice(start, end)}; window.showAgentIdentity = showAgentIdentity;`);
  const article = dom.window.document.querySelector('article');
  dom.window.showAgentIdentity(article, 'mentora-deal');
  const identity = article.querySelector('.assistantAgentIdentity');
  assert.equal(identity.parentElement, article.querySelector('.assistantBubble'));
  assert.equal(identity.textContent, 'Mentora Deal');
  assert.match(styles, /\.assistantAgentIdentity\s*\{[^}]*display:\s*flex/s);
  assert.match(styles, /\.assistantAgentIdentity\s*\{[^}]*white-space:\s*nowrap/s);
  dom.window.close();
});
