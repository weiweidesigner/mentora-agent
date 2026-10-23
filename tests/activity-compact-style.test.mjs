import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const css=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');
test('live summaries use body typography and theme color, not muted bold headings',()=>{
  const rule=css.match(/:root\[data-theme\] \.thinkingTrigger\.is-thinking\{([^}]+)\}/)?.[1]||'';
  assert.match(rule,/font-size:var\(--chat-body-font-size\)/);
  assert.match(rule,/font-weight:400/);
  assert.match(rule,/color:var\(--ink\)/);
  assert.match(rule,/margin:0 0 6px/);
});
test('expanded activity has no top divider or extra top padding and uses compact gaps',()=>{
  const flow=css.match(/\.thinkingFlow\{([^}]+)\}/)?.[1]||'';
  assert.match(flow,/padding:0/);assert.match(flow,/border:0/);
  assert.doesNotMatch(flow,/border-top:1px/);
  assert.match(css,/\.activityFlowList,\.activityGroupItems,\.activityCurrentAction\{[^}]+gap:6px/);
  assert.match(css,/@media\(max-width:1023px\)\{[^\n]+\.activityFlowList\{gap:6px\}/);
});
