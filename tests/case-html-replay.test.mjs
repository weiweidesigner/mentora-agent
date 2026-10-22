import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/static/app.js", import.meta.url), "utf8");
const start = source.indexOf("function streamVisualizationReplayPlan(");
const end = source.indexOf("\nfunction mountStreamVisualization(", start);
const replayPlanSource = source.slice(start, end);

function replayPlan(code) {
  const context = vm.createContext({});
  vm.runInContext(`${replayPlanSource}\nthis.result = streamVisualizationReplayPlan(${JSON.stringify(code)});`, context);
  return context.result;
}

test("cached case replay accepts generic compatible HTML templates", () => {
  const code = `<!doctype html><html><head><style>.card{color:red}</style></head><body><div data-aime-streamviz-root="true"><main class="generic-report">${"内容".repeat(600)}</main></div></body></html>`;
  const plan = replayPlan(code);
  assert.ok(plan);
  assert.equal(plan.start, code.indexOf('<div data-aime-streamviz-root="true">'));
  assert.ok(plan.step >= 180);
  assert.ok(Math.ceil((code.length - plan.start) / plan.step) <= 48);
});

test("cached case replay recognizes existing roots independent of tag and attribute order", () => {
  const code = "<html><body><article class='report' data-aime-streamviz-root='true'><h1>结果</h1></article></body></html>";
  assert.equal(replayPlan(code).start, code.indexOf("<article"));
});

test("documents without a prepared StreamViz root are not replayed", () => {
  assert.equal(replayPlan("<html><body><main>完整文档</main></body></html>"), null);
});
