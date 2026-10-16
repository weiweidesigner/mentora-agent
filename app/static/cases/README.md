# 首页缓存案例

`manifest.json` 定义首页卡片的标题、分类、摘要、发送问句与缓存日期。
每个案例目录包含 `conversation.json` 和它引用的独立 HTML 图表。

打开卡片只读取静态缓存；底部“问一问”通过已有聊天接口发送 manifest 中的问句。
缓存内容是特定日期的回放，不会随市场数据自动更新。更新案例时应同时更新
完整答案、图表、来源、摘要和缓存日期，核对数据口径后再发布。

只保存用户可见问句与最终答案，不保存工具执行日志、凭据或运行目录。

独立图表页面在 `<head>` 最前加载 `theme.js`，在原有样式后加载 `theme.css`。
宿主通过 `?theme=light|dark` 传递主题；图表配置中的 `themeMode`/`theme`
应读取 `document.documentElement.dataset.theme`，以同步 Canvas 和 SVG 配色。
已有 StreamViz 双主题组件继续由 StreamViz 宿主同步主题。


## TradingView 官方案例

`inspiration/manifest.json` 的 `tradingViewGroups` 与 `app/static/tradingview-directory.json` 保存官网分类、组件说明和具体案例配置。运行 `.venv/bin/python scripts/update_tradingview_cases.py` 会逐个执行官方 `trading_view_chart.py`，重新生成 30 个案例、配置 JSON 和校验哈希，并同步 Widget 图表库的分类与说明。

这些案例的来源为 `executed-official-widget-cli`，记录实际 CLI 耗时和返回码，不模拟模型对话或投资结论。HTML 使用官方脚本与真实标的 / 市场配置；数值由 TradingView 在浏览器中加载，不把旧截图数值写进 HTML。配置缓存日期与行情日期不同，打开后仍可能显示更新或延迟的数据。保留官方组件署名。
