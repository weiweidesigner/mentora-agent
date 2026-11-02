---
name: generic-chart
description: Render Aime-style charts from structured JSON, CSV-like data, or upstream payloads using deterministic coordinates and schema-first field mappings. Prefer these concrete renderers for standard numeric charts, including when no chart type is named. Prefer data_table.py for structured records, rankings, screening results and detail lists requested as a table; pass source JSON files directly. Explicit Markdown requests and small prose comparisons may use Markdown. Tables support bounded scrolling and fullscreen; prose must not duplicate rendered rows. Host payload.dataSource passes source files without copying rows; verified chart artifacts can be composed in StreamViz.
---

# Veya skill bridge

Before acting, read `../../../app/skills/generic-chart/SKILL.md` completely and follow it as the canonical instruction file. Resolve scripts, schemas, and resources relative to `app/skills/generic-chart/`.
