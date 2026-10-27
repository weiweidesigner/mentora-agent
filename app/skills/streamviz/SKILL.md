---
name: streamviz
description: 将上游 Skill 已验证的结构化结果渲染为可在 Aime Chart 对话中增量呈现的独立 HTML 看板、关系图或摘要页面。
---

# StreamViz 协作展示 Skill

StreamViz 是**展示 Skill**，不是数据源、搜索器、行情接口或分析器。它和其他 Skill 的协作顺序固定为：

当用户只说“可视化”“做一个整体视图”“生成看板”，或没有明确指定 K 线、柱状图、折线图等具体图表类型时，默认优先选择 StreamViz。只有用户明确指定专用图表，或本 Skill 的内置结构确实无法表达所需视觉语义时，才切换到其他渲染 Skill；不得为了比较候选而继续扫描通用图表、业务图表目录。

1. 先按用户问题选择并执行数据、搜索、计算、分析或图表 Skill。
2. 核对上游产物的来源、时间和口径；将用于展示的事实压缩为一个 JSON 文件。
3. DeepSeek 优先调用本轮工具循环内的 `visualize_show_widget`，优先传 `title` 和包含完整已验证事实与展示要求的 `brief`。HTML 渲染与主 Agent 正文并行生成，宿主先展示真实 HTML 增量，再释放已生成的后续正文；验证成功后自动保存独立 HTML 并附下载。需要精确保留已有 HTML 时使用渲染脚本的 `html` 输入。不要先写 Python/JSON 包装完整 `html` 再渲染，导致模型生成期间没有可视内容。
4. 已有结构化 payload、非原生框架或需要脚本的页面可继续调用 `render_streamviz.py`。渲染器按生成顺序发出真实 HTML 事件并原子保存文件；它不对完整成品做延时回放。

不得跳过前两步直接根据用户问题生成“市场数据”或指标占位符。没有经过验证的数据时，payload 只能表达限制和下一步，不能使用 `—`、示例数值或模拟结论冒充真实结果。

## 选择表达形态

原生工具沿用本 Skill 的布局结构、响应式规则和主题变量；已有 payload 可复用已验证的模板。不再加载
`custom-html-widget` 或另一个看板展示 Skill。依据问题和上游证据选择 `layout`，而不是一律铺满 metrics：

- `dashboard`：需要同时扫读多个关键指标时使用。
- `comparison`：多主体、多个时点或多个方案需要对照时使用。
- `timeline`：事件、公告、交易日进程或行动步骤。
- `flow`：因果、资金/信息流、业务链路或系统关系。
- `brief`：只有少量核心事实，需要结论优先的简洁页面。

可通过 `blocks` 组合 `table`、`rankings`、`timeline`、`narrative` 四种内容区。只传必要区块；不要为了凑布局而生成指标卡，也不要把不同分析视角塞进单一卡片。

只有用户明确要求定制版式，或上述结构确实无法表达所需语义时，才使用 `html` 字段。它接受一段自包含的 HTML/CSS/SVG/Canvas 页面，适合叙事图、地图、复杂关系图、非标准交互或完全定制的版式。该分支不会套卡片、表格或固定高度模板。仍只能把上游已验证的事实写入页面；不能用它绕开取数和证据要求，也不要加载本地文件或外部脚本。

## 输入数据契约

输入是一个 UTF-8 JSON 对象。所有字段均来自已验证的上游结果；未知字段可省略。

```json
{
  "layout": "comparison",
  "financialMarket": "CN",
  "title": "今日 A 股市场表现",
  "eyebrow": "收盘复盘 · 2026-10-08",
  "summary": "核心结论，必须可由上游证据支持。",
  "status": [
    {"label": "上涨家数占优", "tone": "success"},
    {"label": "成交待确认", "tone": "warning"}
  ],
  "metrics": [
    {"label": "上证指数", "value": "+0.18%", "change": 0.18, "detail": "收于 3,830.45 点"}
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
      "financialColumns": ["涨跌幅"],
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

### 批量检查 HTML

需要检查多个视口或明暗主题时，可复用以下工具，一次启动浏览器并批量返回结果，无需反复编写浏览器探测代码、逐张截图后再询问下一步：

```bash
python3 app/skills/streamviz/scripts/inspect_html.py \
  --input outputs/generated/<framework>-streamviz.html \
  --output outputs/<framework>-layout-check.json \
  --screenshots-dir outputs/<framework>-layout-check
```

默认检查 320、390、1000px 的明暗主题；可用 `--widths`、`--themes` 指定任务需要的组合。`--screenshots-dir` 可省略。工具不修改产物；JSON 分开报告整页横向溢出、JavaScript 错误和文字裁切警告，并提供相关元素和截图路径。表格自身横向滚动及显式省略号属于有意的布局，不按整页溢出处理。

检查器对单个视口和整批任务都有硬超时；超时会写入 `inspection-timeout` 并立即返回。不要把超时的检查转入后台后反复调用 `job_output` 等待；保留已生成的 HTML，依据已返回的检查结果继续回答。

这些是运行和布局证据，不验证数据、统计方法、视觉语义或全部交互。默认只运行一次检查；仅当这次检查返回具体缺陷时才读取对应截图、修改并复验。若已满足用户要求，无需为用户未要求的字体、间距或配色偏好反复重绘。

## 表达边界

- 报告的区块用留白分隔，不添加贯穿页面的亮色分割线；指标小卡片默认透明背景、1px 语义边框、8px 圆角、无阴影，桌面按可用宽度并列与换行；移动端以约 196–260px 宽的小卡片横向滑动、靠边吸附，卡间距 10px，不能强制铺深色卡片背景。需要状态底色时使用语义状态变量，不能混用固定颜色。

- 标题→说明、说明→图表、标题→图表的组件间距统一为 8px，清除默认段落上下 margin，不能叠加间距。折线图顶部轴标签所需的 8px 安全空间放在图表内部 padding，不扩大标题下边距。
- 紧凑布局统一使用卡片间距 16px、卡片内边距 12px、组件内间距 8px。HTML 折线圆点采用中心定位 `translate(-50%,-50%)`，与折线使用同一套百分比坐标，禁止用圆点左边缘对齐数据坐标。
- 所有 Grid/Flex 子容器设置 `min-width:0`，防止内部固定宽度图表撑开整页。小指标卡桌面使用 `repeat(auto-fit,minmax(min(100%,150px),1fr))`；移动端指标组使用 `data-sv-layout="metrics"` 或 `.sv-metrics`，展示单行横向滑动的小卡片，不能把每张指标卡撑成整行纵向铺开；大图表可单列。标签换行，宽表格仅在自身容器滚动。必须核对 320px/390px 下页面没有横向溢出，图表数值不裁切。
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

模板在 payload、block 或单项上声明 `financialMarket`，更细范围优先。指标/排行
可传真实数值 `change`（仅用于方向，不改显示值）或 `direction: up|down|flat`。
已声明的金融区域内，带正负号的数值可派生方向；零值保持中性，负号与单位完整保留。
`change`、可解析的带符号值和显式 `direction` 依次提供方向，不能出现负值标红涨的冲突。
表格用 `financialColumns` 指定真正的涨跌/收益变化列，不能把价格、持仓数、置信度、
市场份额、参与率等列都设成金融涨跌。没有方向依据的普通百分比保留文字色。

自定义与原生流式 HTML 在具体数值元素上写 `data-sv-direction="up|down|flat"`；
图形本身的 fill/stroke 也使用同一涨跌变量，不能只给标题或卡片染色。
旧模板只对金融语境中明确带符号的排行/指标百分比做兼容标注，不改数据、顺序或推断交易市场。
缺少市场声明的旧金融值使用应用默认红涨绿跌展示；新产物仍须明确标注市场。

## 当前暗夜主题

共享主题使用中性炭黑，不再使用旧蓝灰/藏蓝卡片：主表面 `#181818`、次级表面
`#202020`、边框 `#343434`、主文字 `#f5f5f5`、说明 `#aaaaaa`、弱文字 `#858585`。
这些值只在 `assets/artifact-theme.css` 维护；生成代码引用语义变量，不复制色值。
根背景透明，卡片 8px 圆角、无阴影，排行数值不换行；深浅色切换只改变调色板，
不能丢失涨跌方向。状态成功/失败和金融上涨/下跌是两套独立语义。

### 正文中的调用时机

在正文需要 HTML 展示的位置先输出必要的解读，再调用原生 `visualize_show_widget`，工具参数生成时就在该位置增量预览，随后继续正文。不要等整段回答结束才调用；不要把 HTML、widget_code 或内部脚本作为正文代码块输出。

### 与正文并行生成

原生工具优先传 `title` 与 `brief`：完整提供已验证事实、单位、来源、限制、布局和结论。HTML 渲染任务独立运行；主 Agent 收到 `status: rendering` 后立即继续自己的正文，不等待、不轮询。宿主缓冲后续真实文字增量，HTML 验证成功后按顺序发送，并附上生成文件。pending 回执不代表文件完成。主 Agent 的原生工具只接收 `title` 与 `brief`，不要生成 `widget_code`；精确保留已有 HTML 时使用渲染脚本的 `html` 输入。渲染器不取数、不增加事实，也不代写答复正文。
