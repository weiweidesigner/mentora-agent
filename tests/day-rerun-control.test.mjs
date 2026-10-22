import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const css=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');

test('failed task rerun control has bounded button and icon dimensions',()=>{
  const button=css.match(/\.dayRerunIcon\s*\{([^}]*)\}/)?.[1]||'';
  const icon=css.match(/\.dayRerunIcon svg\s*\{([^}]*)\}/)?.[1]||'';
  assert.match(button,/width:28px/);
  assert.match(button,/height:28px/);
  assert.match(icon,/width:16px/);
  assert.match(icon,/height:16px/);
});

test('failed task detail stacks activity, error, and rerun action vertically',()=>{
  const result=css.match(/\.taskThread \.message\.assistant\.taskFailedResult\s*\{([^}]*)\}/)?.[1]||'';
  assert.match(result,/flex-direction:column/);
  assert.match(result,/align-items:flex-start/);
});
