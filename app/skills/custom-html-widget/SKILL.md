---
name: custom-html-widget
description: 根据已经验证的证据制作完整独立 HTML 报告、自定义网页或交互组件；用户要求 HTML 报告时使用，不要求必须交互。
---

# Custom HTML reports and widgets

用户明确要求 HTML 报告、HTML 页面或 HTML 组件时，交付可打开的独立 `.html` 文件，不能只返回 Markdown 正文或几张独立图表。按问题设计结构，不固定报告章节、图表数或卡片样式。

这是报告组装和展示技能，不负责搜索、行情取数或计算。涉及事实时先选择匹配的上游技能验证来源、口径和计算。缺失数据在报告中明确披露，不能填入模拟结论。

复用项目已有 StreamViz 的自定义 HTML 渲染分支：完整读取 `../streamviz/SKILL.md`，遵守其主题、响应式和证据契约。不要用固定 dashboard 模板代替长篇研究报告，也不要重新实现已存在的金融图表组件。图表应位于相应解读旁边。

将自包含的 HTML/CSS 和必要的交互 JavaScript 放进 UTF-8 JSON 的 `html` 字段，另提供 `title`，保存到 `outputs/generated/<report>-payload.json`。然后执行已有 CLI：

```bash
python3 app/skills/streamviz/scripts/render_streamviz.py --input outputs/generated/<report>-payload.json --output outputs/generated/<report>.html
```

不要猜测本技能下存在额外生成脚本。默认无外部网络依赖，不加入追踪脚本。报告需有清晰标题，宽表格在自身容器滚动；使用 StreamViz 的明暗主题变量。静态核对产物存在且非空；复杂页面检查桌面及窄屏效果。不能把仅写好的 payload 当成已交付 HTML。

多视口、明暗主题的检查可使用 StreamViz 的 `scripts/inspect_html.py`，一次返回布局问题及截图路径；完整命令见 `../streamviz/SKILL.md`。先汇总实际缺陷再决定修改，避免把同一组检查拆成多轮编写截图脚本、读图和零碎调样式。检查结果不替代数据和视觉语义判断，修复与复验仍由 Agent 根据用户要求决定。

最终用独立一行 `[[AIME_CHART:/absolute/path/to/report.html]]` 交付已验证的报告，简短说明结论和限制。在 `AIME_SKILLS` 中列出 `custom-html-widget,streamviz` 及实际使用的上游技能。若生成失败，明确说明 HTML 尚未完成，不声称报告已交付。
