import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../app/static/styles.css',import.meta.url),'utf8');

test('user actions do not reserve vertical space before assistant progress',()=>{
  assert.match(css,/\.message\.user \+ \.message\.assistant\s*\{\s*margin-top:\s*12px;/);
  assert.match(css,/\.userMessageWrap\s*\{[^}]*position:\s*relative;/s);
  assert.match(css,/\.userActions\s*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(100% \+ 4px\);[^}]*right:\s*0;/s);
});
