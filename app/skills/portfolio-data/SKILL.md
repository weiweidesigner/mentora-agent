---
name: portfolio-data
description: 读取候选池、市场扫描、真实报价、OHLCV 与财务数据，或更新经过研究的候选池。适用于 Mentora Deal 的市场数据输入；不管理账户、不产生买卖决策。
---

# portfolio-data

调用 `scripts/run.py` 的 `execute(service, owner, payload)`；owner 由已认证服务注入，不接受模型提供的账户身份。持仓任务与分析复用这个入口，不重写取数、回测或决策实现。

candidates 输出候选数组；scan 输出 {symbol,signal} 数组；quote 输出原币/美元报价及时间与来源；history 输出真实 OHLCV rows 和数据源；fundamentals 输出 当前数据工具支持的可验证财务快照字段与来源；save_candidate 输出实际保存的候选版本。refresh 仅用于 quote，symbol 用于 quote/history/fundamentals/save_candidate，values 用于 save_candidate，days/limit 用于列表查询。账户由独立 `portfolio-account` Skill 读取。

执行前按 `Input` 校验参数；工具目录中的 `inputSchema` 由该模型生成。结果与异常通过统一 `tool_step` 保存到对应任务 run，包含 callId、skillId、operation、input、output 或 error。不要把进度提示当作实际输出，也不要把新结果补写到旧执行记录。

港股 `quote/history` 支持 `0700.HK`、`00700.HK`、`HKEX:700`，统一为 `0700.HK`。
通过主项目 `app.hk_market_data` 和现有 MarketDataHub 取数；历史使用腾讯港股前复权日线，
香港完整交易日（含收市竞价缓冲）、HKD 原币、真实 OHLCV 与来源，默认最近132条，
不把港股当美股、不替换 ADR、不猜测成交量手/股换算。保留 asOf、stale 和复权元数据。
接口失败只报真实错误，不伪造价格。宿主 ExecutionMarket 支持港股账户执行：quote 使用
未复权港币快照，验证香港交易日历、报价时效及 HKD/USD 参考汇率后提供 USD 账户估值，
同时保留 nativePrice、nativeCurrency、fx 与来源。禁止把原始 HKD 价格直接当 USD。
历史前复权 OHLCV 及其 researchOnly 元数据只描述历史证据，不是成交报价或下单授权。
订单仍须经过同一次 JEV 决策、用户置信度门槛及账户风控。手动工作流和定时执行均可保存
决策、执行订单并更新观察列表；“试运行”不是不写入的预览。当前账户按整数股记账，
不声称复现券商整手撮合。回测由 portfolio-backtest 执行；美股基本面不能用于港股。
