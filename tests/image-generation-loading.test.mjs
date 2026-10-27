import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../app/static/app.js',import.meta.url),'utf8');
const runtime=source.slice(source.indexOf('function renderImageGenerationLoading('),source.indexOf('function isGeneratedImageArtifact('));

test('image loading reuses one animated field with a service-driven 10% display floor',()=>{
  const dom=new JSDOM('<article data-lang="zh-Hans"><div class="finalAnswer"></div></article>',{runScripts:'outside-only'});
  const w=dom.window,article=w.document.querySelector('article');w.eval(runtime);
  w.renderImageGenerationLoading(article,{phase:'flux-connect'});
  const field=article.querySelector('.imageGenerationLoading');
  assert.equal(field.querySelector('.imageGenerationLabel'),null);
  assert.equal(field.querySelectorAll('circle').length,621);
  assert.equal(field.querySelector('.imageGenerationProgress').textContent,'准备中');
  w.renderImageGenerationLoading(article,{phase:'flux-wait'});
  assert.equal(article.querySelector('.imageGenerationLoading'),field);
  assert.doesNotMatch(field.textContent,/正在勾勒草图/);
  assert.doesNotMatch(field.textContent,/%/);
  for (const percent of [0,5,10]) {
    w.renderImageGenerationLoading(article,{phase:'flux-denoise',progressPct:percent});
    assert.equal(field.querySelector('.imageGenerationProgress').textContent,'10%');
    assert.equal(field.dataset.progressPct,String(percent));
  }
  w.renderImageGenerationLoading(article,{phase:'flux-generate',progressPct:36});
  assert.equal(field.querySelector('.imageGenerationProgress').textContent,'36%');
  field.insertAdjacentHTML('afterbegin','<div class="imageGenerationLabel">正在勾勒草图</div>');
  w.renderImageGenerationLoading(article,{phase:'flux-denoise',progressPct:50});
  assert.equal(article.querySelector('.imageGenerationLoading'),field);
  assert.equal(field.querySelector('.imageGenerationLabel'),null);
  assert.doesNotMatch(field.textContent,/正在勾勒草图/);
  w.renderImageGenerationLoading(article,{phase:'flux-wait',progressPct:900});
  assert.equal(field.querySelector('.imageGenerationProgress').textContent,'50%');
  w.renderImageGenerationLoading(article,{phase:'flux-decode',progressPct:100});
  assert.equal(field.querySelector('.imageGenerationProgress').textContent,'100%');
  w.clearImageGenerationLoading(article);
  assert.equal(article.querySelector('.imageGenerationLoading'),null);
  article.activityEnded=true;w.renderImageGenerationLoading(article,{phase:'flux-wait'});
  assert.equal(article.querySelector('.imageGenerationLoading'),null);
  dom.window.close();
});

test('terminal paths clear loading and reduced motion disables its animation',()=>{
  for(const name of ['renderFinalAnswer','showError','showStopped']) {
    const body=source.slice(source.indexOf(`function ${name}(`)).split('\nfunction ')[0];
    assert.match(body,/clearImageGenerationLoading\(article\)/);
  }
  const css=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.imageGenerationWave\{animation:none\}\}/);
});
