import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(new URL("../app/static/app.js", import.meta.url), "utf8");
const pageSource = fs.readFileSync(new URL("../app/static/index.html", import.meta.url), "utf8");
const styleSource = fs.readFileSync(new URL("../app/static/styles.css", import.meta.url), "utf8");

test("reasoning effort levels use the requested Chinese display labels", () => {
  const expectedLabels = {
    low: "轻度",
    medium: "中",
    high: "高",
    xhigh: "极高",
    ultra: "Ultra",
  };

  for (const [effort, label] of Object.entries(expectedLabels)) {
    assert.match(appSource, new RegExp(`${effort}: ["']${label}["']`));
  }
});

test("initial reasoning control copy matches the low level Chinese label", () => {
  assert.match(pageSource, /id="reasoningStrengthLabel">轻度<\/span>/);
  assert.match(pageSource, /id="reasoningStrengthPopoverLabel"[^>]*>轻度<\/div>/);
  assert.match(pageSource, /id="reasoningStrengthSlider"[^>]*aria-valuetext="轻度"/);
});

test("reasoning strength stays transparent after generic composer button rules", () => {
  const genericDarkRule = styleSource.lastIndexOf(':root[data-theme="dark"] .composer button {');
  const transparentOverride = styleSource.lastIndexOf(':root[data-theme="dark"] .composer button.reasoningStrengthButton,');
  assert.ok(genericDarkRule >= 0);
  assert.ok(transparentOverride > genericDarkRule);
  assert.match(styleSource.slice(transparentOverride), /background:\s*transparent/);
});
