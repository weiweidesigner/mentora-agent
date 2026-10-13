import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../app/static/app.js', import.meta.url), 'utf8');
const start = source.indexOf('function shareAnswerMarkup(');
const end = source.indexOf('\nfunction buildShareAnswerDocument', start);
function markup(session) {
  const dom = new JSDOM('', { url: 'http://127.0.0.1:8000/' });
  const context = vm.createContext({ document: dom.window.document, window: dom.window, URL });
  vm.runInContext(source.slice(start, end), context);
  context.session = session;
  return new JSDOM(vm.runInContext('shareAnswerMarkup(session)', context)).window.document;
}

test('preview replaces live widget iframe with saved artifact at its original position', () => {
  const doc = markup({
    themeMode: 'dark',
    answerHtml: '<p>Before</p><div class="streamvizArtifactHost" data-artifact-url="/generated/report.html"><div class="visualize-widget-block"><iframe class="visualize-widget-frame" src="about:blank" style="height:3000px"></iframe></div></div><p>After</p>',
  });
  const frame = doc.querySelector('iframe');
  assert.equal(frame.className, 'reportDocumentFrame');
  assert.equal(frame.getAttribute('src'), '/share-artifact/report.html?theme=dark');
  assert.equal(frame.previousElementSibling.textContent, 'Before');
  assert.equal(frame.nextElementSibling.textContent, 'After');
  assert.equal(doc.querySelectorAll('iframe').length, 1);
  assert.equal(doc.querySelector('.visualize-widget-frame'), null);
  assert.equal(frame.hasAttribute('style'), false);
});

test('old widget markup falls back to session artifact metadata', () => {
  const doc = markup({themeMode:'light', reportArtifacts:[{url:'/generated/legacy.html'}], answerHtml:'<div class="visualize-widget-block"><iframe src="about:blank"></iframe></div>'});
  assert.equal(doc.querySelector('iframe').getAttribute('src'), '/share-artifact/legacy.html?theme=light');
});

test('existing document frame retains content and uses selected theme', () => {
  const doc = markup({themeMode:'light', answerHtml:'<iframe class="reportDocumentFrame" src="/share-artifact/chart.html?theme=dark&amp;v=1" style="height:3000px" data-resize-observed="true"></iframe>'});
  assert.equal(doc.querySelector('iframe').getAttribute('src'), '/share-artifact/chart.html?theme=light&v=1');
  assert.equal(doc.querySelector('iframe').hasAttribute('data-resize-observed'), false);
});

test('missing artifacts do not leave an empty live iframe in the preview', () => {
  const doc = markup({answerHtml:'<p>Text</p><div class="streamvizArtifactHost"><iframe class="visualize-widget-frame"></iframe></div>'});
  assert.equal(doc.querySelector('iframe'), null);
  assert.equal(doc.body.textContent, 'Text');
});
