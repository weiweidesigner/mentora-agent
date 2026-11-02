---
name: ainvest-screener
description: 美股和美国上市 ETF 的条件筛选数据工具。按行业、主题、估值、盈利、费率、成交量、收益率或技术指标筛选证券，支持标签策略、多条件组合、排序、分页及表格所需数据和 JSON/CSV 导出。自然语言选股、选 ETF、找符合条件的证券时使用，无需用户指定技能名；不执行交易。
---

# 美股与美股 ETF 筛选数据

源页面：https://www.ainvest.com/screener/ 。股票和 ETF 使用不同字段目录；截图中的费用率、DMI 等属于 ETF。先确定资产，再按语义选择真实参数，不用固定自然语言关键词代替模型判断。

根据用户的自然语言选择参数，无需用户说“使用 ainvest-screener”。“用表格展示”是筛选结果的交付格式，仍由本工具取数；按需用普通表格展示，不需要先取热力图数据。市场范围为美股及美国上市 ETF；股票和 ETF 分别选择 asset。用户要求选股/筛选 ETF 时，直接查询符合条件的证券，无需先全量获取市场或热力图数据。

先读取与当前条件有关的 fields / metrics / strategies，组合条件后执行 query。已确认的字段和指标可直接复用，无需每次浏览器取证、读取源码或重建 API。只按用户要求选列和分页；保留总匹配数。显示行业、费用率、成交量、规模时，可用 columns：55,ext_metric_sector_1_name,国际北美etf@Expense Ratio,13,国际北美etf@Assets Under Management(Latest)。若行业返回缺失，应如实显示，不能用组合条件推断每只 ETF 的行业。

通过 app/skill_runner.py execute --script screen.py -- 执行；参数发现命令 fields / metrics / strategies 也使用同一入口。脚本位于本文件旁的 scripts/screen.py，按网页流程初始化匿名游客会话，再请求已观察的只读 POST 快照接口，使用 Python 标准库。

## 发现参数

~~~bash
python3 app/skill_runner.py execute --script screen.py -- strategies --search 'Top Gainers'
python3 app/skill_runner.py execute --script screen.py -- fields --asset etf --search expense --detail
python3 app/skill_runner.py execute --script screen.py -- fields --asset stock --search 'Return on Equity' --detail
python3 app/skill_runner.py execute --script screen.py -- metrics --asset etf --search 'AUM' --detail
~~~

strategies 是网页 126 个 **ETF** 预设，不冒充股票标签。fields 包含 29 个 ETF 字段、38 个股票字段。metrics 的 359 个结果指标定义按资产过滤，并非每个结果指标都是筛选字段。遇到别名歧义读取准确 ID，不静默选择。

- [etf-strategies.json](references/etf-strategies.json)：预设名称、query、排名。
- [etf-fields.json](references/etf-fields.json)、[stock-fields.json](references/stock-fields.json)：字段的 options、周期和信号 Prompt ID。
- [indicator-dictionary.json](references/indicator-dictionary.json)：结果列和排序定义。
- [API 契约](references/api.md)：组合逻辑、游客初始化、单位和来源。

## 构造请求

~~~bash
python3 app/skill_runner.py execute --script screen.py -- plan --asset etf \
  --strategy ranking-top-gainers --top 20 --limit 10

python3 app/skill_runner.py execute --script screen.py -- plan --asset etf \
  --filters-json '[{"field":"sector","value":["Technology","Energy"]},{"field":"expenseRatio","max":"0.5%"},{"field":"dailyVolume","min":"100K"}]' \
  --sort AUM --limit 20 --output /absolute/path/plan.json
~~~

条件对象使用 field 加 value、min/max 或 option；需要周期的范围字段加 period。也支持 --filters-file 读取 JSON 数组。

- **不同字段 AND；同字段多项 OR。** 同一范围上下限放在一个对象，如 {"field":"P/E","min":0,"max":20}；拆成两个对象会成为 OR。
- 百分数字符串 "0.5%" 转为 0.005；数值 0.005 保持原值。不能把数值 0.5 当作 0.5%。成交量支持 "100K" / "1M"。上下限包含边界，不能声称严格大于或小于。
- {"field":"performance","period":"1m","min":"5%","max":"30%"} 使用固定的周期 Prompt ID。
- {"field":"macdSignal","value":"Golden Cross"} 使用信号 Prompt ID，不捏造数值阈值。
- {"field":"ema","option":"Price above EMA 50"} 使用实际比较表达式，MA/EMA 不是普通数值范围。
- --top 控制排名候选数量，--limit 是返回页大小，--offset 为页偏移。
- 预设追加同字段条件依然是 OR；若要改窄该字段，展开预设 query 后用完整自定义 filters 替换。
- 模型根据用户语义选择参数，脚本不解析整句自然语言。

## 查询结果

~~~bash
python3 app/skill_runner.py execute --script screen.py -- query --asset etf \
  --strategy ranking-top-gainers --top 20 --limit 20 \
  --output /absolute/path/results.json --csv /absolute/path/results.csv

python3 app/skill_runner.py execute --script screen.py -- query --asset stock \
  --filters-json '[{"field":"P/E","min":0,"max":20},{"field":"Return on Equity","min":"15%"}]' \
  --sort total_market_value --limit 40 \
  --output /absolute/path/stocks.json
~~~

**默认无需登录、无需提供 Cookie。** 脚本先通过网页公开游客接口创建临时会话，Cookie 仅在内存保留，再自动查询快照。仅在明确需要已有会话时使用 --cookie-file、AINVEST_COOKIE_FILE、AINVEST_COOKIE 或 --headers-file；不自动读取浏览器登录数据。只初始化游客和查询筛选，不查询账户、不交易、不收藏、不保存策略。--evidence-output 可保存不含请求头和游客凭证的本轮快照请求和结果。

结果保留条件、排名、API page.total、返回数量、证券代码、指标元数据和取数时间。保留原始单位和缺失值；取数时间不代表报价时间。要全部结果时依据 total 继续分页，不把第一页称为全部。

## 验证状态和维护

2026-11-02：浏览器捕获 164 条快照请求，其中 160 条返回成功；126 个预设均完成本地请求编译检查。百分比、周期、正反杠杆、信号、MA 比较、并集分页、Top N 缺失值有回归测试。**这些检查不等于所有预设和每个选项都逐项完成了在线调用测试。**

已通过无账户凭证的独立 HTTP 查询：Top Gainers ETF、行业多选 + 费率 + 成交量组合、股票 P/E + ROE 组合。早期直接请求快照返回 401 的原因是漏了网页自动执行的游客初始化，不能据此要求用户登录。401/403、非 JSON 验证页或业务错误明确报错，不返回伪造空结果。

维护可从官方筛选页导出 HAR，再运行：

~~~bash
python3 <skill-dir>/scripts/inspect_har.py /absolute/path/screener.har \
  --output /absolute/path/screener-calls.json
~~~

该工具只提取固定快照接口，不重放、不导出凭证。--request-index N 可提取某条捕获结果；必须保留 browser_capture 和捕获时间，不能称为本轮实时查询。源码变化后更新目录并重验；不要把用户账户响应写进可共享 Skill。
