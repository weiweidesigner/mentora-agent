---
name: streamviz
description: 将上游 Skill 已验证的结构化结果渲染为可在 Aime Chart 对话中增量呈现的独立 HTML 看板、关系图或摘要页面。
---

# StreamViz 协作展示 Skill

StreamViz 是**展示 Skill**，不是数据源、搜索器、行情接口或分析器。它和其他 Skill 的协作顺序固定为：

1. 先按用户问题选择并执行数据、搜索、计算、分析或图表 Skill。
2. 核对上游产物的来源、时间和口径；将用于展示的事实压缩为一个 JSON 文件。
3. 调用本 Skill 的脚本生成独立 HTML。Aime Chart 网关会自动把该 HTML 作为 StreamViz 流式视觉模块嵌入对话。

不得跳过前两步直接根据用户问题生成“市场数据”或指标占位符。没有经过验证的数据时，payload 只能表达限制和下一步，不能使用 `—`、示例数值或模拟结论冒充真实结果。

## 选择表达形态

这不是固定“指标卡”组件。依据问题和上游证据选择 `layout`，而不是一律铺满 metrics：

- `dashboard`：需要同时扫读多个关键指标时使用。
- `comparison`：多主体、多个时点或多个方案需要对照时使用。
- `timeline`：事件、公告、交易日进程或行动步骤。
- `flow`：因果、资金/信息流、业务链路或系统关系。
- `brief`：只有少量核心事实，需要结论优先的简洁页面。

可通过 `blocks` 组合 `table`、`rankings`、`timeline`、`narrative` 四种内容区。只传必要区块；不要为了凑布局而生成指标卡，也不要把不同分析视角塞进单一卡片。

当上述结构不能表达任务时，使用 `html` 字段：它接受一段自包含的 HTML/CSS/SVG/Canvas 页面，适合叙事图、地图、复杂关系图、非标准交互或完全定制的版式。该分支不会套卡片、表格或固定高度模板。仍只能把上游已验证的事实写入页面；不能用它绕开取数和证据要求，也不要加载本地文件或外部脚本。

## 输入数据契约

输入是一个 UTF-8 JSON 对象。所有字段均来自已验证的上游结果；未知字段可省略。

```json
{
  "layout": "comparison",
  "title": "今日 A 股市场表现",
  "eyebrow": "收盘复盘 · 2026-10-08",
  "summary": "核心结论，必须可由上游证据支持。",
  "status": [
    {"label": "上涨家数占优", "tone": "success"},
    {"label": "成交待确认", "tone": "warning"}
  ],
  "metrics": [
    {"label": "上证指数", "value": "+0.18%", "detail": "收于 3,830.45 点"}
  ],
  "flow": {
    "title": "市场传导路径",
    "nodes": [
      {"id": "policy", "label": "宏观与政策", "detail": "流动性与消息面"},
      {"id": "funds", "label": "资金面", "detail": "北向与两融"}
    ],
    "edges": [{"from": "policy", "to": "funds", "label": "影响"}]
  },
  "blocks": [
    {
      "type": "rankings",
      "title": "领涨与领跌",
      "items": [{"label": "电池", "value": "+2.1%", "detail": "上游已验证"}]
    },
    {
      "type": "table",
      "title": "指数对照",
      "columns": ["指数", "涨跌幅"],
      "rows": [{"指数": "上证指数", "涨跌幅": "+0.18%"}]
    }
  ],
  "note": "数据时间、来源范围与限制。"
}
```

自定义页面示例（与 `layout`、`metrics`、`blocks` 二选一）：

```json
{
  "title": "资金传导图",
  "html": "<style>.scene{display:grid;grid-template-columns:1fr auto 1fr;gap:24px}</style><section class='scene'><div>上游事实 A</div><svg viewBox='0 0 80 24'><path d='M0 12H70' stroke='currentColor'/></svg><div>上游事实 B</div></section>"
}
```

- `metrics`、`status`、`flow` 均可省略；脚本会隐藏缺失区块，绝不补造空指标。
- `blocks` 可省略；每个 block 只展示输入中实际存在的行或条目。
- `html` 存在时优先按原样渲染，忽略模板字段；它适合非标准表达。
- `tone` 只允许 `success`、`warning`、`danger`、`neutral`，其他值按 `neutral` 处理。
- `flow.edges` 仅连接 `nodes` 中存在的 `id`；无效连接会被忽略。

## 执行

先将 payload 写到 `outputs/generated/`，再运行：

```bash
python3 app/skills/streamviz/scripts/render_streamviz.py \
  --input outputs/generated/<evidence-payload>.json \
  --output outputs/generated/<framework>-streamviz.html
```

脚本会在标准输出返回 JSON，包含 `output` 绝对路径。确认 HTML 存在且非空后，在最终回答中单独输出：

```text
[[AIME_CHART:/absolute/path/to/<framework>-streamviz.html]]
```

并在 `[[AIME_SKILLS:...]]` 中同时写入 `streamviz` 和真实执行的上游 Skill，例如 `a-share-data,external-search,streamviz`。

## 表达边界

- 标题→说明、说明→图表、标题→图表的组件间距统一为 8px，清除默认段落上下 margin，不能叠加间距。折线图顶部轴标签所需的 8px 安全空间放在图表内部 padding，不扩大标题下边距。
- 紧凑布局统一使用卡片间距 16px、卡片内边距 12px、组件内间距 8px。HTML 折线圆点采用中心定位 `translate(-50%,-50%)`，与折线使用同一套百分比坐标，禁止用圆点左边缘对齐数据坐标。
- 所有 Grid/Flex 子容器设置 `min-width:0`，防止内部固定宽度图表撑开整页。小指标卡使用 `repeat(auto-fit,minmax(min(100%,150px),1fr))` 按实际容器宽度并列、放不下自动换行，不因移动端断点强制单列；大图表可单列。标签换行，宽表格仅在自身容器滚动。必须核对 320px/390px 下页面没有横向溢出，图表数值不裁切。
- 宽屏折线可使用 StreamViz 的 `sv-responsive-line` 组件：`sv-line-body` 内以 `sv-line-y-axis` 和 `sv-line-plot` 分列，SVG 只绘制线和网格，用 `preserveAspectRatio="none"` 填满固定 CSS 高度绘图区；文字在 HTML 的 `sv-line-x-axis`、`sv-line-values` 中保持像素字号。不要在折线末端把长名称和百分比塞出 viewBox；末端数值默认并入下方图例，确保名称、负号和百分号完整。不要给满宽图设置固定像素 max-width 和自动居中留白。
- 主题由 StreamViz 的 `assets/artifact-theme.css` 统一维护，同时提供 light/dark 两套配色。宿主只传递主题模式；不在项目层为看板另写颜色覆盖，不生成两份不同数据的页面。自定义 HTML 的背景、边框、文字、状态和图表系列必须使用 `--sv-surface-primary`、`--sv-surface-secondary`、`--sv-border-subtle`、`--sv-text-primary`、`--sv-text-secondary`、`--sv-status-*`、`--sv-chart-series-*` 等变量。SVG 的 fill/stroke 同样使用变量。脚本自动将两套主题打包到独立 HTML 中，旧产物由 StreamViz 兼容规则映射。
- 窄堆叠区间不能硬塞数字：标签放不下时保留真实比例，将完整家数与占比移到图例或条外，并给区间提供可访问说明；禁止为了容纳文字而扩大区间比例。堆叠分段应禁止 flex shrink，避免标签宽度改变数据比例。
- 普通文字与条外数据标签必须使用主题变量（如 `var(--sv-text-primary)`、`var(--sv-text-secondary)`）；不能写死深色或浅色。仅当文字位于固定颜色的柱内时，才使用与该柱色有足够对比度的固定文字色。响应式横条优先采用“分类 / 条形 / 数值”三列 Grid，为数值保留独立列。
- 可使用任意数量的关系边；边在 HTML 的正常文档流中与节点对齐，不能用脆弱的绝对定位文本箭头。
- 不要把 500–700 单位的固定 `viewBox` SVG 直接拉满宽屏容器；SVG 内文字会随几何图形一起放大，造成坐标轴和数据标签反而大于标题。按最终展示宽度设计 SVG，或对响应式排行图使用 HTML/CSS 条形图。
- 压缩图卡四周留白时，只缩小卡片 `padding` 和 `viewBox` 中未使用的空白，不能顺带缩小绘图区。绘图区通常应占图卡宽度的 75%–90%，并保留足够高度；双栏中的半宽图必须按半栏实际宽度设计 `viewBox`，不能套用整页宽图的坐标系后再等比缩小。
- 分享图片可能使用更宽的视口；半栏 SVG 若会明显宽于设计尺寸，使用容器查询反向补偿 SVG 字号，使最终轴/分类标签保持 11–13px、数据标签保持 12–14px。只补偿文字，不能缩小绘图区、柱子或卡片。
- 最终显示字号应保持清晰层级：区块/图表标题 16–18px，数据标签 12–14px，轴与分类标签 11–13px。轴标签和数据标签不得大于标题，也不得低于 11px。
- SVG 的线宽、圆点、柱宽和圆角也会随 `viewBox` 缩放。折线、路径和网格线使用 `vector-effect="non-scaling-stroke"`；最终网格线约 1px、主折线 1.5–2.5px、数据点半径 3–5px、普通柱厚 20–32px、圆角 2–4px。柱子与零轴/分类轴相接的一端必须保持直角，只给远离轴的外端加圆角；竖柱的正值只圆顶部、负值只圆底部，横柱的正负值使用相反的外端圆角。无法跨宽度维持这些尺寸时改用 HTML/CSS 条形图。
- 不能让宽屏 SVG 的宽高比缩放决定纵向节奏。排行图每行保持 36–44px、行间距 8–12px、图卡内边距 16–24px、区块间距 24–32px；超过 7 个分类的横向排行优先使用 HTML/CSS Grid，只让绘图区横向增长。
- 左右双栏的 CSS Grid 必须设置 `align-items:start`，让较矮的图表卡按自身内容高度收口，不得被同行更高的文本或表格卡拉伸出大片空白。
- 长分类横轴标签最多拆成两行居中的 `tspan`，并预留独立标签带；仍会碰撞时改用横向条形图或紧凑表格，不能重叠、裁切或用密集旋转文字硬塞。
- 图例默认放在绘图区下方、SVG/Canvas 之外，作为一组水平居中，与绘图区保留 8–12px 间距；只有在下方会让图例与图表脱节或与必要注释冲突时，才放到图上方。图例不得覆盖绘图区。
- 图例在 SVG 下方时，`viewBox` 应在横轴标签带之后立即结束，不能先在 SVG 内保留一段空白、再叠加图例外边距；最后一行标签基线到图例的可见距离通常控制在 8–16px。
- 不给页面添加白色画布、外部卡片或人为高度上限；HTML 自适应内容高度，背景透明，以便融入对话。
- 输出仅是上游证据的可视化，不替代正文中的数据时间、口径和不确定性说明。

## 金融涨跌色

金融涨跌使用 `--sv-price-up`、`--sv-price-down`、`--sv-price-flat`，不要使用 success/danger 状态色。每个金融区域声明 `data-financial-market="CN"`、`"HK"` 或 `"US"`；A股、港股红涨绿跌，美股绿涨红跌。混合市场按区域分别声明，深浅色切换不改变市场语义。
