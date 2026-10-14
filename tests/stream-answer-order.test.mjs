import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const source = readFileSync(new URL('../app/static/app.js', import.meta.url), 'utf8');
function fixture() {
  const dom = new JSDOM('<article><div class="finalAnswer"></div></article>', { runScripts:'outside-only' });
  const w = dom.window;
  w.canonicalArtifact = value => value;
  w.sanitizeUserFacingInsight = value => value;
  w.formatInsight = value => value;
  w.isNearBottom = () => false;
  w.keepScrollPosition = () => {};
  w.eval(source.slice(source.indexOf('function appendStreamVisualizationModule('), source.indexOf('function upsertStreamVisualization(')));
  return { w, article:w.document.querySelector('article'), close:()=>w.close() };
}
test('completed chart tools register evidence without displaying a chart before prose', () => {
  const f = fixture();
  try {
    f.w.appendStreamVisualizationModule(f.article, {htmlUrl:'/generated/chart.html',label:'图表'});
    f.w.appendStreamVisualizationModule(f.article, {htmlUrl:'/generated/chart.html',label:'图表'});
    assert.equal(f.article.streamVisualizationArtifacts.length, 1);
    assert.equal(f.article.querySelector('.finalAnswer').children.length, 0);
  } finally { f.close(); }
});
test('public text snapshots render once and never expose chart marker coordinates', () => {
  const f=fixture();
  try {
    f.w.renderStreamAnswerText(f.article,{text:'先解释结果。\n[[AIME_CHART:/secret/chart.html]]'});
    assert.equal(f.article.querySelector('.streamAnswerPreview').textContent.trim(),'先解释结果。');
    f.w.renderStreamAnswerText(f.article,{text:'完整解释。'});
    assert.equal(f.article.querySelectorAll('.streamAnswerPreview').length,1);
    assert.equal(f.article.querySelector('.streamAnswerPreview').textContent,'完整解释。');
    f.article.activityEnded=true;
    f.w.renderStreamAnswerText(f.article,{text:'过期事件'});
    assert.equal(f.article.querySelector('.streamAnswerPreview').textContent,'完整解释。');
  } finally { f.close(); }
});
