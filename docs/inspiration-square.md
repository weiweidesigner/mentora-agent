# 首页灵感广场

模块位于原首页案例泳道下方，沿用 `.caseCard`，采用换行网格。输入框的位置按视口高度定位，默认位于首屏垂直中央，案例数量不会把它向上推。

推荐展示全部分类；各分类 tab 和分类标题标出实际案例数量，避免把精选数量误认为分类总数。目录按已安装组件核对：市场报告 3、金融图表 33、数据分析 17（16 个通用 schema 与通用 K线）、金融视频 3、艺术绘图 3。

缓存位于 `app/static/cases/inspiration/`。每例必须通过实际 Veya `/api/chat/stream` 请求生成，保留完整最终回答、对应的实际产物和原生媒体元数据、公开工具步骤、会话标识和实测时间。不得用说明模板、演示值或拼接历史 HTML 冒充实际生成的对话。

`provenance.generation` 为 `actual-veya-chat-stream`。`activity.stages` 记录各执行阶段的开始、结束和耗时，`activity.elapsedMs` 为实测阶段耗时之和，排除离线等待与发布耗时；回放直接显示该记录，不把前端回放时间当作生成时间。旧缓存缺少记录时显示“原始耗时未记录”，不得补造 1 秒或随意延长。

对需要结构化数据的案例，优先实际取数；实时接口受限时，可把有明确来源和日期的历史原始数据作为本次分析输入，必须重新执行组件和生成分析，并在正文标明数据日期。禁止使用 `--sample` 或原数据分析案例的模拟值作为金融事实。

媒体采用既有原生展示流程：

- 图片保留产物的 `imageUrl`，以 `mediaType: image` 明确类型；直接渲染图片并支持点击放大，不能把相对 PNG 资源丢给 StreamViz。
- 视频保留实际检索结果的 `answer.videos`，包含标题、封面、发布日期、时长、来源与 `videoUrl`；使用 `buildVideoLane` 和 `openVideoPlayer`，不创建替代视频卡片的 HTML 页面。
- 图片和视频回放复用最终回答的媒体展示，避免流式 HTML 回放破坏其资源路径或交互。

JEV 的全目录路由只提交组件目的和关键语义通道，详细 payload、CLI 与模型指令由后续技能读取负责，防止同一大段 schema 在 state 与 criteria 重复提交而超出路由服务限制。数据分析缓存另保存实际 JEV 核验结果与耗时。

验证：`node --test tests/cases.test.mjs tests/case-theme.test.mjs` 与 `python -m pytest tests/test_reasoning_frameworks.py -q`。完整性检查须同时验证数量、实际生成标识、可移植产物、原生媒体字段和真实计时，不能仅以 HTTP 200 或静态文件非空判定成功。浏览器还需验证输入框首屏位置、全部 tab、图片实际解码与放大、视频卡片与播放器、主题和移动端布局。
