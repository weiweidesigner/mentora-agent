# Verified data to deterministic charts

The agent chooses chart types and presentation based on the question. Standard quantitative charts use the existing generic renderers, even when the user did not name a chart type. Native business components retain their explicit display contracts. StreamViz handles composition and conceptual/custom visuals; it can embed verified charts without generating their numeric geometry.

The host adds `dataSource` support to `skill_runner.py execute` for line, grouped line, bar, grouped bar, bar-line and pie scripts. This is a host input extension; independent component CLI usage still accepts ordinary data payloads. A mapping spec can be small even when its source is large:

```json
{
  "type": "line",
  "title": "Observed rate",
  "xField": "date",
  "yField": "rate",
  "xScale": "time",
  "series": [{"field": "rate", "label": "Rate", "axis": "right"}],
  "visualStyle": {"line": {"curve": "step-after"}},
  "dataSource": {
    "path": "outputs/data/observations.json",
    "recordsPath": ["series"],
    "fields": {"date": "macro_observation_period", "rate": "v"},
    "dateFormats": {"date": "%Y%m%d"},
    "sortBy": "date"
  }
}
```

`recordsPath` is an array of JSON keys (empty for a root array). Fields map output names to source record keys. Missing fields fail; explicit null observations remain null. No unit scaling, aggregation, deduplication, imputation, or source refetching takes place. Optional date formats parse the source representation; date-only inputs remain dates. Sorting is explicit. Other analytical transformations belong in the existing deterministic calculation skill. Pie mapping uses `label`/`value`, with nonnegative values and a positive total; missing observations require explicit upstream handling.

The host verifies the renderer's embedded config against mapped records before reporting success. Checks cover row count, values, missingness, order for lines, time ordering, axis coverage and first/last observations. Line `xScale=time` uses actual time spacing; step-after holds a value until the next observation, without adding observation points. Missing-value policy `gap` prevents automatic forward filling. Layout and hover behavior remain owned by the concrete renderer.

The adjacent `.chart.json` is internal provenance, not a user-facing deliverable: it stores data/source hashes, source metadata, counts, min/max, endpoints and the HTML hash. `chartValidation` remains inline through tool-result compaction. A mismatch fails the tool; the agent can fix the mapping or visualization according to the error instead of delivering an unchecked chart. These checks verify data integrity and mathematical axis coverage, not the economic interpretation or every possible custom CSS rule.

For an assembled page, pass verified HTML paths as `visualize_show_widget.chart_artifacts`. The rendering brief names exact empty slots `<div data-chart-id="chart-1"></div>` etc. The host checks manifests and file hashes, embeds original interactive HTML, and switches the completed streamed layout to the composed saved artifact. Missing, duplicated, stale or unverified chart slots fail rather than being redrawn or silently omitted. Template pages use `{ "type":"chart", "artifact":"outputs/generated/chart.html" }` blocks. Custom HTML may use `chart_artifacts` with the same slots. Source data never needs to be copied into a visualization brief.

Regression coverage includes lost/reordered/changed values, null filling, clipped axes, stale manifests, composition slots, first/last observations, irregular time spacing, step-before/step-after paths, mobile/desktop chart bounds, and persistence of hover tooltips. No domain keywords or fixed business chart layouts select an execution plan.
