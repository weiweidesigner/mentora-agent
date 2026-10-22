# Mentora Agent

**See Beyond the Data**

Mentora 是基于 DeepSeek Harness 的研究与可视化智能体，包含推理执行、工具活动展示、SSE 事件适配、报告展示、会话与分享、前端交互和样式。保留 Codex、本地 Ollama 与 AutoGen Studio 适配。组件、取数和视觉能力通过独立仓库的锁文件引用，不在宿主复制实现。

旧启动命令 `uvicorn app.main:app` 也会接入同一个 Harness 展示网关；推荐入口仍为 `app.presentation:app`，不会因使用旧命令而转到 AutoGen Studio。

## 从仓库安装

建议 Python 3.11+，并准备 Node.js/npm。部分业务、行情和搜索依赖为私有仓库，安装完整能力需要相应 GitHub 读取权限；主仓库为公开仓库。模型、行情、搜索等凭据只放在本地 `.env`，公开仓库仅提交空配置示例。

```bash
git clone https://github.com/weiweidesigner/veya-agent.git
cd veya-agent
python3 -m venv .venv
source .venv/bin/activate
python scripts/setup_dependencies.py
python -m pip install -r requirements.txt
python -m playwright install chromium
npm ci
npm run build:streamviz
cp .env.example .env
chmod 600 .env
# 按实际服务填写本地 .env 后启动
python -m uvicorn app.presentation:app --host 127.0.0.1 --port 8000
```

`python scripts/setup_dependencies.py --check` 离线验证固定提交及接入链接。组件更新后修改对应锁文件，再运行 `--update`。展示逻辑由此主仓库统一维护，可视化组件选择仍引用 `jev_vis_router`。工具事件直接使用 Agent 提供的公开进度，不再为进度分类或翻译额外调用模型。

Harness 默认会从工具子进程环境中移除凭据变量。`AICHART_TOOL_ENV_KEYS` 显式列出本项目 CLI 工具可以使用的变量名；真实值仍只保存在本地 `.env`。宿主通过公共 ShellSpec 环境接口传递这些值，不把凭据写进命令、提示词或事件日志。若项目已安装 `.venv`，CLI 同时使用该环境的 Python 和依赖。SDK 和 headless 模式的所有推理档位均加载此环境适配。

通用只读行情入口位于 `app/skills/market-data/scripts/read_market_data.py`，复用已安装的市场适配器，支持任意美股/ETF/指数及沪深北股票的报价批次和支持范围内的完整日线。默认 4 路并发，保留原始数据时间、来源及单项失败；`--refresh` 可显式重取。Harness 工具环境适配器按用户轮次注入独立缓存目录，报价默认复用 60 秒、历史数据 1800 秒，错误不缓存；脱离 Harness 使用时需显式指定 `--cache-dir` 才跨进程复用。完整契约见 `app/skills/market-data/SKILL.md`。此入口不初始化账户、不执行交易；原有交易取数与风控不变。

保持现有 `AICHART_*` 环境变量与会话存储键兼容，界面品牌、页面标题与分享文案使用 Veya。FLUX 运行器及模型权重另外部署，在本地 `.env` 设置路径。

通用联网搜索默认使用 Tavily，失败时自动切换 Serper；Kimi 保留为显式可选来源。结果保留真实 provider 与 `fallback_attempts`。AInvest 站内搜索、结构化行情与指定 URL 读取保持为独立能力。

## StreamViz dependency

StreamViz 使用 `weiweidesigner/streamviz` GitHub 布局改造分支
`fix/stable-component-streaming` 提交 `04365a23cfb7562489e63ff74fb401571a7db67a`，由 `package.json` 和
`package-lock.json` 固定版本，不依赖开发者本地仓库或符号链接。
执行 `npm ci` 后运行 `npm run build:streamviz`。构建直接使用安装包内的
源码，并将仓库的公共主题 CSS 同步到静态资源和 Skill 资源目录。
HTML 修复和流式参数归一化由仓库导出的 `normalizeStreamVisualizationPayload` 处理；
应用仅保留 DOM 挂载与应用事件接入，不维护本地组件包装或依赖源码补丁。
网页使用本地构建产物，运行时不访问 GitHub。更新上游版本时需更新依赖
提交、重新安装和构建，不会自动跟随主分支变化。

## Business chart dependency

业务图表使用私有仓库 `weiweidesigner/us-trading-charts`，通过 `business-charts.lock.json` 固定提交 `5c94dffd22385211604993c56490ce973bf19b01`。项目不再维护业务图表实现副本。

```bash
# 首次安装需要拥有该私有仓库读取权限的 GitHub 凭据
python3 scripts/sync_business_charts.py
python3 scripts/sync_data_vis_charts.py
python3 scripts/sync_data_code_interpreter.py
python3 scripts/sync_jev_vis_router.py
python3 scripts/sync_chart_markup.py
python3 scripts/sync_vision_chart_analyst.py
python3 scripts/sync_flux_image.py
python3 scripts/sync_cn_trading_data.py
python3 scripts/sync_kimi_search.py
python3 scripts/sync_us_market_news.py
python3 scripts/sync_url_content_reader.py
python3 scripts/sync_us_market_vedio.py
python3 -m pip install -r requirements.txt
# 本地离线校验提交和接入链接
python3 scripts/sync_business_charts.py --check
```

仓库检出位于被 Git 忽略的 `.dependencies/us-trading-charts`，`app/skills/business-chart-recall` 为指向该检出的相对链接。A 股入口由私有 `cn-trading-data` 仓库管理；Yahoo 通用取数已移除。业务组件自身的取数逻辑仍保留在各组件脚本里。组件 Schema、样式资产和元数据全部从仓库读取；宿主模块目录只保留引用。运行图表时无需连接 GitHub，也不依赖桌面上另一个开发仓库。

不要直接修改依赖缓存或通过链接修改组件。业务图表更新应在私有仓库提交，更新锁文件后执行 `python3 scripts/sync_business_charts.py --update`，再重启服务使用；不会自动跟随 `main` 分支。部署机器也需要私有仓库的读取权限，凭据不写进 URL、配置文件或锁文件。

## Generic chart dependency

通用图表使用公开仓库 `weiweidesigner/data-vis-charts`，由 `data-vis-charts.lock.json` 固定提交 `3e82ad8c93c814a1b81847a523f4a121be1ee9b1`。`app/skills/generic-chart` 整个目录通过相对链接引用 `.dependencies/data-vis-charts/app/skills/generic-chart`，宿主不再保留通用组件源码、Schema 或 Skill 规范副本。

```bash
python3 scripts/sync_data_vis_charts.py
python3 scripts/sync_data_code_interpreter.py
python3 scripts/sync_jev_vis_router.py
python3 scripts/sync_chart_markup.py
python3 scripts/sync_vision_chart_analyst.py
python3 scripts/sync_flux_image.py
python3 scripts/sync_data_vis_charts.py --check
```

动态折线运行资源随仓库提供，运行图表无需连接 GitHub。组件更新应提交到上游仓库，更新锁文件后运行 `python3 scripts/sync_data_vis_charts.py --update` 并重启服务；不要直接编辑依赖缓存或通过链接修改组件。饼图、瀑布图和双环图的通用入口也由此仓库提供，业务组件库仍使用自身内置的渲染依赖。

## Data skill dependencies

数据计算使用 `weiweidesigner/data-code-interpreter`，由 `data-code-interpreter.lock.json` 固定版本。Yahoo 取数工具、技能入口和自动安装锁文件已移除；不要恢复 Yahoo 数据源或组件回退。

```bash
python3 scripts/sync_data_code_interpreter.py
python3 scripts/sync_jev_vis_router.py
python3 scripts/sync_chart_markup.py
python3 scripts/sync_vision_chart_analyst.py
python3 scripts/sync_flux_image.py
python3 scripts/sync_data_code_interpreter.py --check
```

更新应先提交上游，修改锁文件后运行对应安装脚本的 `--update`。数据计算保留普通计算与下游图表 payload 两种模式。图表 Schema 仍由通用或业务图表仓库提供，数据计算通过宿主逻辑路径或工作目录读取，也支持 `CODE_INTERPRETER_SCHEMA_DIRS` / `AICHART_SKILLS_DIR` 显式配置。模型凭据留在宿主环境中。

## Local Laya visualization router dependency

可视化路由使用公开仓库 `weiweidesigner/jev_vis_router`，由 `jev_vis_router.lock.json` 固定提交。`app/jev_visualization_router.py` 只保留指向依赖检出的相对链接，原有 Python 导入路径保持一致。主图、辅助图、置信度、语义、证据与标记策略的实现均从上游读取。未接入应用的模型路由模块已删除；工具活动路由仍由宿主维护。

```bash
python3 scripts/sync_jev_vis_router.py
python3 scripts/sync_chart_markup.py
python3 scripts/sync_vision_chart_analyst.py
python3 scripts/sync_flux_image.py
python3 scripts/sync_jev_vis_router.py --check
```

更新应提交上游，修改锁文件后运行 `python3 scripts/sync_jev_vis_router.py --update`。TypeSafe 凭据留在宿主环境中。

## Visual skill dependencies

图表标记、图表视觉分析和本地图片生成分别由公开仓库 `weiweidesigner/chart-markup`、`weiweidesigner/vision-chart-analyst` 和 `weiweidesigner/flux-image` 管理。对应锁文件固定提交，`app/skills/chart-markup`、`app/skills/vision-chart-analyst` 和 `app/skills/flux-image` 只保留相对依赖链接。

```bash
python3 scripts/sync_chart_markup.py --check
python3 scripts/sync_vision_chart_analyst.py --check
python3 scripts/sync_flux_image.py --check
```

组件修改应提交上游，更新锁文件后运行对应脚本的 `--update`。视觉模型专用 `VISION_API_KEY` 仅放在宿主本地、被 Git 忽略的 `.env` 中，通过进程环境传给组件；独立 CLI 也支持 `VISION_CONFIG_FILE` 指定本地配置文件。公开仓库仅包含空 `.env.example`，不包含真实密钥。

FLUX 本机运行器路径由本地 `.env` 中的 `AICHART_FLUX_RUNNER`、`AICHART_FLUX2_RUNNER` 提供，宿主根目录由 `AICHART_PROJECT_ROOT` 提供。运行器、模型权重与生成媒体保留在本地，不上传组件仓库。

## Structure

```text
app/
├── presentation.py          # 纯展示网关（运行入口）
├── studio_agent_client.py   # Studio 传输与前端响应适配
├── reasoning_frameworks.py  # DeepSeek Harness / Codex 适配
└── static/                  # 原 Veya 前端

.agents/skills/              # Codex 项目级 Skill 发现桥接层
app/skills/                  # 项目 Skill 与私有仓库组件接入链接
```

`presentation.py` 不包含路由提示词、技能选择、参数规划或本地工具执行逻辑。Studio 返回的公开 Agent/Tool 事件被适配为原前端 SSE 事件，生成的 HTML 被复制到 `outputs/generated/` 后继续使用原 iframe 展示。

项目级 `flux-image` Skill 默认使用本机 Apple Silicon 上部署的 FLUX.2 [klein] 4B（2026 年版）生成创意图片，也支持根据一张上传图片编辑。Codex 推理框架会从 `.agents/skills/flux-image` 发现它；脚本写出 PNG 和配套 HTML，复用现有 iframe 展示。模型权重已缓存在本机，推理时无需登录 Hugging Face。若模型部署位置变化，设置 `AICHART_FLUX_RUNNER` 指向其 `run.sh`；原 FLUX.1-schnell 运行器仍可通过此变量选用。示例：在 Codex 对话中输入“画一张雪地里的红狐狸插画”。

Codex 会按官方项目 Skill 机制自动扫描 `.agents/skills`。每个桥接 Skill 只负责召回，并要求 Codex 完整读取对应的 `app/skills/<name>/SKILL.md`；脚本与 schema 不复制，因此不会形成两套会漂移的实现。最终响应中的 `selectedSkill` 会记录本轮实际读取/使用的 Veya Skill。

## Run

```bash
python3 scripts/sync_business_charts.py
python3 scripts/sync_data_vis_charts.py
python3 scripts/sync_data_code_interpreter.py
python3 scripts/sync_jev_vis_router.py
python3 scripts/sync_chart_markup.py
python3 scripts/sync_vision_chart_analyst.py
python3 scripts/sync_flux_image.py
python3 scripts/sync_cn_trading_data.py
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
.venv/bin/python -m uvicorn app.presentation:app --reload --port 8000
```

Codex 复用本机已登录的 `codex` CLI。DeepSeek Harness 使用官方 Python SDK 的 `session.event` 通知流展示工具调用和任务轨迹，并默认与本机 Web UI 共用 `~/.dsh/sessions`。若 SDK 尚未安装，会自动回退到功能受限的 `dsh --profile headless`；该回退模式只返回最终文本，不提供实时轨迹。

可选环境变量：

```bash
AUTOGEN_STUDIO_URL=http://127.0.0.1:8080
AUTOGEN_STUDIO_TEAM_ID=1
AUTOGEN_STUDIO_USER_ID=guestuser@gmail.com
AUTOGEN_STUDIO_SESSION_NAME="Veya · AgentChat"
AICHART_CODEX_BIN=codex
AICHART_CODEX_MODEL=
AICHART_CODEX_NETWORK_ACCESS=true
AICHART_CODEX_RUN_TIMEOUT_SECONDS=1200
AICHART_CODEX_OLLAMA_MODEL=aimechart/glm-4.6v-flash-9b-codex:latest
AICHART_CODEX_GLM_ADAPTER_URL=http://127.0.0.1:8010/local-glm/v1
AICHART_CODEX_OLLAMA_CONTEXT_WINDOW=16384
AICHART_CODEX_OLLAMA_COMPACT_TOKEN_LIMIT=12288
AICHART_DSH_HOME=~/.dsh
DSH_BIN=
AICHART_DEEPSEEK_SDK_PATH=
AICHART_DEEPSEEK_PROVIDER=deepseek-official
AICHART_DEEPSEEK_MODEL=deepseek-flash
AICHART_DEEPSEEK_REASONING_EFFORT=low
AICHART_DEEPSEEK_MAX_TOKENS=32768
AICHART_DEEPSEEK_TIMEOUT_SECONDS=1200
AICHART_DEEPSEEK_RUN_TIMEOUT_SECONDS=1200
AICHART_OLLAMA_URL=http://127.0.0.1:11434
AICHART_OLLAMA_MODEL=haervwe/GLM-4.6V-Flash-9B:latest
AICHART_OLLAMA_API_KEY=ollama
AICHART_OLLAMA_TIMEOUT_SECONDS=600
LAYA_DECISION_URL=http://127.0.0.1:8791/predict
LAYA_VISUAL_MODEL=convaiinnovations/laya-multilingual
LAYA_VISUAL_TIMEOUT_SECONDS=90
TYPESAFE_API_KEY=
TYPESAFE_MODEL=jev-latest
TYPESAFE_TIMEOUT_SECONDS=20
TYPESAFE_ACTIVITY_ROUTING_ENABLED=true
TYPESAFE_ACTIVITY_TIMEOUT_SECONDS=3
LAYA_VISUAL_PRIMARY_MIN_CONFIDENCE=0.35
LAYA_VISUAL_SUPPORTING_MIN_CONFIDENCE=0.55
```

首次配置 Codex 本地 GLM 路径时，创建共享同一组模型权重、但将上下文限制为 16K 的隐藏 Ollama 派生配置：

```bash
ollama create aimechart/glm-4.6v-flash-9b-codex:latest -f ollama/Modelfile.glm-codex
```

`/api/chat` 和 `/api/chat/stream` 维持同一响应/SSE 契约，再根据请求中的 `reasoningFramework` 路由到对应适配器；`inferenceModel` 独立保存并传递完整模型 ID。网页固定传递 `deepseek-flash`；只有直接通过 API 指定本地模型 ID 为 `haervwe/GLM-4.6V-Flash-9B:latest` 时，DeepSeek Harness 或 Codex 才切换到本机 Ollama。Codex 路径在后台使用 `aimechart/glm-4.6v-flash-9b-codex:latest` 这一隐藏的 16K 上下文派生配置，并设置 Codex 的上下文与压缩阈值。由于本地 Ollama 模板有时将工具调用放进普通文本，Codex 的 GLM 路径经由本机 `/local-glm/v1` Responses 适配器；它仅将完整、已声明且参数符合 schema 的调用提升为真正的 `function_call`，不会推断业务路由、补造工具结果或执行不完整调用。该适配器由 Veya 8010 服务承载，因此使用 Codex + GLM 前须先启动网页服务；若端口不同，同步修改 `AICHART_CODEX_GLM_ADAPTER_URL`。DeepSeek Harness 仍直接使用原始 Ollama 模型。DeepSeek Harness 的真实 session ID 和 Codex thread ID 分开保存，并进一步按模型隔离，不会相互覆盖。DeepSeek SDK runtime 会在服务生命周期内按 session 与模型复用，以支持同一前台会话连续对话；服务关闭时统一释放。会话标题仍只做字符串截取，不产生第二次模型调用。

可通过 `/api/health` 查看 DeepSeek 与 Codex 的本机可用状态，以及服务器实际安装的 `deepseek-harness-sdk` 和 `deepseek-harness-runtime-bin` 版本。未安装的发行包版本返回 `null`，不会阻断健康检查。DeepSeek Harness SDK 和 `dsh` Runtime 都不可用时，调用会返回明确的安装提示。AutoGen 不再作为聊天推理框架接受或展示。

运行输出会写入 `outputs/generated/`，该目录可作为运行时产物目录处理。

## A-share data dependency

A 股 API 使用私有仓库 `weiweidesigner/cn-trading-data`，由 `cn-trading-data.lock.json` 固定提交。`app/skills/a-share-data` 链接到 `.dependencies/cn-trading-data` 的 Skill，不维护本地实现副本。历史 OHLCV 直接绑定同版本 `us-trading-charts` 原生 K 线；两份 K 线锁文件需要保持版本一致。密钥继续使用宿主环境变量或忽略的 `.env`。

```bash
python3 scripts/sync_business_charts.py
python3 scripts/sync_data_vis_charts.py
python3 scripts/sync_data_code_interpreter.py
python3 scripts/sync_jev_vis_router.py
python3 scripts/sync_chart_markup.py
python3 scripts/sync_vision_chart_analyst.py
python3 scripts/sync_flux_image.py
python3 scripts/sync_cn_trading_data.py
python3 -m pip install -r requirements.txt
python3 scripts/sync_cn_trading_data.py --check
# 数据仓库升级：先更新 cn-trading-data.lock.json，再同步并重启服务
python3 scripts/sync_cn_trading_data.py --update
```

## Kimi search dependency

Kimi 搜索由公开仓库 `weiweidesigner/kimi-search` 管理，使用 `kimi-search.lock.json` 固定提交。宿主的 `external_info_search.py` 负责 Tavily→Serper 路由，显式选择 Kimi 时调用 `.dependencies/kimi-search` 的实现；URL 阅读器由独立公开 `url-content-reader` 仓库维护。搜索运行时只依赖标准库。

```bash
python3 scripts/sync_kimi_search.py
python3 scripts/sync_kimi_search.py --check
# 更新锁文件后同步并重启服务
python3 scripts/sync_kimi_search.py --update
```

`MOONSHOT_API_KEY` 继续保存在宿主本地被忽略的 `.env` 或进程环境中，由宿主加载后传给子进程。公开仓库不含密钥；不要把本地 `.env`、用户查询结果或日志提交到任何公开仓库。

## Internal market news dependency

端内文本搜索使用私有仓库 `weiweidesigner/us-market-news`，通过 `us-market-news.lock.json` 固定提交。`app/skills/internal-search` 链接到 `.dependencies/us-market-news` 的 Skill，原有脚本入口、Skill 桥接和模块目录继续使用。运行时仅依赖标准库，配置和生成结果留在宿主；视频搜索由独立私有 `us-market-vedio` 仓库维护。

```bash
python3 scripts/sync_us_market_news.py
python3 scripts/sync_us_market_news.py --check
# 更新锁文件后同步并重启服务
python3 scripts/sync_us_market_news.py --update
```

## URL reader dependency

URL 阅读器使用公开仓库 `weiweidesigner/url-content-reader`，通过 `url-content-reader.lock.json` 固定提交。原入口 `app/skills/external-search/scripts/url_content_reader.py` 链接到 `.dependencies/url-content-reader` 的实现，保留 external-search 路由及 HTML/JSON 结果处理。它不依赖 Kimi、API key 或第三方运行库。

```bash
python3 scripts/sync_url_content_reader.py
python3 scripts/sync_url_content_reader.py --check
# 更新锁文件后同步并重启服务
python3 scripts/sync_url_content_reader.py --update
```

## Video search dependency

端内视频搜索使用私有仓库 `weiweidesigner/us-market-vedio`（名称保留 vedio），由 `us-market-vedio.lock.json` 固定提交。`app/skills/video-search` 链接到 `.dependencies/us-market-vedio` 的 Skill，包含视频入口及视频专用辅助脚本，保留 Videos、Featured YouTube、Shorts 流的过滤、分页和元数据输出行为。它与 `us-market-news` 的文本新闻实现独立管理，不互换辅助脚本。

```bash
python3 scripts/sync_us_market_vedio.py
python3 scripts/sync_us_market_vedio.py --check
# 更新锁文件后同步并重启服务
python3 scripts/sync_us_market_vedio.py --update
```

## 验证

所有问题都通过所选框架的通用 Agent 推理循环执行。模型根据本轮问题和历史约束，自行选择技能、数据范围、工具调用、验证方式、图表与交付结构；普通对话和定时任务共用此入口。历史 `AICHART_BOUNDED_RESEARCH` 开关已移除，不再将行情问题分流到固定数据能力或预设报告流程。

`app/dsh_tool_environment.cordis.yml` 关闭 DeepSeek Harness 原生的 `web_search` 与 `web_fetch`，避免它们绕过项目既有的 `external-search` 路由、重复取数或产生额外的搜索费用。Agent 仍可通过项目 Skill 使用 Tavily、Serper 与 Kimi；结构化行情及用户指定 URL 继续使用各自工具。

所有 DeepSeek 推理档位都通过 `app/dsh_lightweight.cordis.yml` 加载同轮执行守卫（保留历史文件名以兼容部署）。它复用参数相同、依赖文件未变且时效有效的成功读取，并合并相同的进行中读取；新轮次或文件变化使缓存失效，动态查询缓存最多 60 秒。写入、订单、账户变更和无法确认只读的命令不缓存。超过 4,000 字符的结果以及较大的结构化行数据统一落到 `outputs/tool-results/`，模型只接收摘要和 `fullOutputPath`；失败诊断同轮去重并保留一次摘要。

外部直连调用并发执行，单来源等待最多 10 秒、单个外部批处理命令最多 30 秒；首次出现网络不可达或直连被阻止后，本轮不再尝试同类直连。后台 `job_output` 单次等待最多 8 秒，相同任务的立即重复轮询有 5 秒冷却。守卫不替模型决定研究范围或何时结束，运行器原有的用户取消与整轮超时仍有效。

所有推理档位采用通用的最短充分证据协议：执行前先定义本问题的最小充分证据条件，达成后立即锁定研究，不再新增数据源。锁定后只允许一次汇总计算、一次必要的 HTML 渲染和一次有界验证；单个失败目标最多使用一条实质不同的替代路线，已有证据足够时则披露限制并收尾。轻度档额外要求：能力候选命中后经 `app/skill_runner.py contract` 一次取得 Skill、CLI 与 schema，再批量执行；成功后不重复读取桥接、源码、帮助文本或等价数据源。联网搜索仅用于用户明确要求的原因/新闻/外部证据，或结构化数据存在关键缺口的情况。协议不预设市场答案和报告结构，Agent 仍可在证据锁定之前放弃候选、组合多个能力或在候选不足时扩展检索。

来源、数据时间和必要验证要求由对应 Skill 及真实工具回执提供；缓存不会构造行情、结论或交易回执。HTML 等交付需求仍须完整履行。`node --test tests/lightweight-guard.test.mjs` 与 `tests/fixtures/run_dsh_guard_probe.py` 验证同轮缓存、失效、并发去重及真实运行器透传。

安装依赖后运行 `python -m pip install -r requirements-dev.txt`、`python -m pytest tests -q` 与 `node --test tests/*.test.mjs`。部分集成测试需要额外的本地模型、Codex Skill 或配置；本地凭据检查在公开检出未配置密钥时跳过。

## Ubuntu 云端部署

仓库提供 `deploy/veya-agent.service` 与 `deploy/nginx-veya.conf`，用于 systemd 常驻运行和已有 HTTPS 站点下的 `/veya/` 路由。后端仅监听本机 8000 端口，入口无需登录并保留 SSE 流式响应。部署与更新说明见 `deploy/README.md`。云端仅保存运行所需的本地 `.env`；模型权重与 Mac 专用生图环境不包含在 CPU 云部署中。
