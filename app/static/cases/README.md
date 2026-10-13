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
