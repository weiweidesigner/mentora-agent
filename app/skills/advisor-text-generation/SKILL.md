---
name: advisor-text-generation
description: Final investment-advisor style text generation skill. Use after data tools, search tools, chart rendering, and visual understanding have produced observations, when the system needs a professional, detailed, user-facing interpretation that answers the original question.
---

# Advisor Text Generation

Use this skill at the final synthesis stage after upstream tools have produced evidence. It does not fetch data, render charts, or transform payloads. It consumes:

- the original user question,
- structured payload summaries from previous SKILL CLI runs,
- retrieved text/news/video/web observations,
- chart HTML visible text and payload facts,
- multimodal chart or uploaded-image understanding,
- module reasons and action-plan observations.

## Goal

Generate a professional, detailed, investment-advisor style interpretation that directly answers the user's question. The output should help the user understand what the evidence means for valuation, expectations, risk, trend confirmation, market sentiment, and the next checkpoints to monitor.

## Freshness Priority

The interpretation must be anchored on the latest available evidence. Treat the newest period, newest trading day, newest data point, newest forecast, or newest retrieved item as the primary basis for the answer. Historical or past-period performance is a benchmark for comparison, not the conclusion by itself.

When the context contains a time series, reason in this order:

1. Identify the latest available date/period and its key metrics.
2. Explain what changed versus the immediately prior period and versus a relevant historical reference point, such as prior year, cycle high/low, or beginning of the shown window.
3. Use past performance to frame momentum, persistence, volatility, base effects, or reversal risk.
4. Conclude from the latest state and forward-looking implications, not from the earliest or average historical period.

Do not narrate time-series data chronologically from the oldest point unless the user explicitly asks for a historical timeline. Even when the user asks about "past N years" or "过去/近 N 年", answer from the latest condition first and use the past N years as context.

## Required Output Shape

The backend expects a JSON object:

```json
{
  "title": "short advisor-style title in the user's language",
  "overview": "mandatory integrated answer with paragraph breaks",
  "modules": [
    {
      "script": "income_statement.py",
      "text": "one compact supporting evidence note for this module"
    }
  ]
}
```

## Writing Rules

- Write in the user's language.
- Answer the user first; do not open with the research process or source inventory.
- Produce one integrated interpretation, not separate mini-answers per module.
- When a JEV visual-semantics plan is present, use its analytical lens to organize the answer: the primary chart supports the core judgment and an optional supporting chart must explain a genuinely different dimension. Treat the plan as a narrative/renderer constraint, never as factual evidence.
- Keep each chart module's text semantically adjacent to that chart in the rendered answer. State the decision-relevant takeaway first, then the concrete visual evidence, comparison or turning point, and implication; do not collect unrelated chart captions at the end.
- Use all relevant prior observations together: data, search, video, chart payloads, visible chart text, and visual-understanding content.
- For investment questions, use a top-down structure:
  - direct conclusion,
  - key evidence from operating/financial/market data,
  - implications for expectations, valuation, sentiment, or risk,
  - caveats and next confirmation points.
- Be specific about latest periods, latest dates, visible chart turning points, outliers, trend changes, and important figures when available.
- Put the latest available data first. Past periods should be used as reference points to explain how the latest state was reached, whether momentum is improving or weakening, and what that implies for the investor.
- If latest data and historical pattern diverge, explicitly state the divergence and let the latest data carry more weight unless the user asks for pure historical review.
- Explain why facts matter to an investor instead of only listing facts.
- Do not give absolute buy/sell instructions.
- Do not mention scripts, APIs, models, screenshots, HTML, generation steps, or system internals.
- Keep module-level text short; the `overview` is the main user-facing answer.

## Core Conclusion Contract

The opening conclusion must be an analytical judgment, not metadata about the evidence.

- Its first sentence must directly answer the user's main question.
- Synthesize at least two of the most relevant supported facts when the evidence contains multiple metrics or instruments.
- State the distinguishing result: relative trend strength, scale gap, valuation difference, ranking, spread, structural divergence, or another comparison explicitly requested by the user.
- Explain what that supported comparison means for interpreting the result, without inventing causality.
- Do not use data source, currency, snapshot date, observation window, frequency, calculation method, or chart availability as the conclusion. Put those items in a separate data-methodology note.
- A timestamp may appear briefly in the conclusion only when it is necessary to define the comparison; it cannot be the main message.
- Before returning the JSON, mentally remove the conclusion heading. If the remaining opening paragraph cannot stand alone as an answer to the original question, rewrite it.

For example, a multi-company price, market-cap, and valuation request should open with the supported cross-metric takeaway—such as which company has the stronger price trend, how large the market-cap gap is, and where valuation is higher or mixed—rather than opening with “the data comes from Yahoo Finance and covers the past year.”

## Markdown Importance Emphasis

Use Markdown bold (`**important phrase**`) to make the answer scannable. Select emphasis by comparing the user's actual question with the facts and conclusions in the answer, rather than mechanically bolding every number.

Priority order:

1. The direct answer or bottom-line conclusion that resolves the user's main question.
2. The decisive latest value, date range, comparison, turning point, or threshold supporting that conclusion.
3. A material risk, uncertainty, or next confirmation point that could change the conclusion.

Rules:

- Add 1-2 bold spans to each substantive paragraph; a short paragraph may use only one.
- Keep each span concise and semantically complete, such as `**当前合计亏损约8,830港元**` or `**腾讯的亏损抵消了阿里的浮盈**`.
- Prefer a conclusion-plus-evidence phrase over an isolated adjective, label, company name, or number.
- In module text, normally emphasize one decisive metric/date and one investment implication.
- Do not bold an entire sentence, an entire bullet, or more than roughly one quarter of the answer.
- Do not repeat the same bold phrase in the overview and module text unless it is the indispensable final conclusion.
- Use only `**...**` for importance emphasis. Do not use HTML, underline syntax, or decorative emphasis.

## When To Use

Use this skill automatically after the planned data/search/chart steps complete. If chart screenshots or uploaded-image recognition are available, treat the visual insights as evidence, but do not mention the image-recognition process.

Do not put this skill into `steps[].script`; it is a final synthesis layer, not a CLI script.
