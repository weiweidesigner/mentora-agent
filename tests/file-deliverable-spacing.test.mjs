import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../app/static/app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../app/static/styles.css', import.meta.url), 'utf8');

test('generated report files use compact spacing without changing ordinary reports', () => {
  assert.match(app, /answer\.classList\.add\('has-generated-files'\)/);
  assert.match(app, /frame\.closest\('\.finalAnswer\.has-generated-files'\)/);
  assert.match(app, /terminalRect\.bottom \+ 8/);
  assert.match(styles, /\.finalAnswer\.has-generated-files>\.mixedReport>\.reportFrameShell:last-child\{margin-bottom:4px\}/);
  assert.match(styles, /\.finalAnswer\.has-generated-files>\.generatedFileList\{margin-top:4px\}/);
});
