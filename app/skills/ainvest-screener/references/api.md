# AInvest Screener API 契约

源页面：https://www.ainvest.com/screener/ 。2026-11-02 通过 Chrome Network HAR 和页面实际加载的前端资源确认。版本与检查摘要见 [verification.json](verification.json)。这是前端内部接口，未发现据以承诺稳定性的公开 API 文档。

## 查询入口

**POST https://extquote.ainvest.com/index_api/indicator/v2/snapshot**

用途为筛选和获取指标。浏览器观测成功响应 HTTP 200、status_code 为 0。以下非凭证头来自实际请求：

~~~json
{
  "Content-Type":"application/json",
  "Origin":"https://www.ainvest.com",
  "Referer":"https://www.ainvest.com/screener/",
  "x-auth-progid":"7047",
  "x-auth-version":"1.0",
  "x-auth-select-market-level":"uus:level0"
}
~~~

**不需要账户登录。** 正常网页先初始化匿名游客会话，直接跳过此步骤请求快照会返回 HTTP 401（网关 no-token）。已实测以下标准流程可在独立 HTTP 客户端取数：

1. POST https://user.ainvest.com/auth/visitor/login，Content-Type 为 application/x-www-form-urlencoded；body 为 udid=<新建 UUID>&clientType=WEB，fingerprint 请求头使用相同 UUID，同时带官网 Origin/Referer。
2. 使用 CookieJar 保留服务器 Set-Cookie，含 userid、sessionid 等游客 Cookie；不要求用户提供任何账户凭证。
3. 在同一 CookieJar 中请求快照接口，带上方应用头和相同 fingerprint。结果 access_mode 为 anonymous_visitor。

游客 Cookie 仅在进程内存保存，不写入结果或证据文件。该游客接口名称虽含 login，但属于前端自动游客初始化，不是用户账户登录。源码证据为页面加载的 2514-eb6a189b305d8a4e.js 的 initVisitor 流程。

--headers-file 为本机 JSON 文件（建议 0600），只接受 Cookie、Authorization、fingerprint、x-auth-udid、x-auth-token、x-auth-appname、User-Agent。不要在聊天或 Skill 中填写实际值。

页面还调用了以下接口，**它不是标签/指标字典**：

POST https://user.ainvest.com/od/mobileweb-optdata-app-common-config/optdata/common_config/open/api/collection/v1/query_content/ainvest_screener

请求为 {"modules":["web_screener"],"from":"h5"}，本次返回 data.modules 为空。源码表明它读取用户保存集合。相邻 put_content 是写操作，Skill 不调用。标签、字段目录本次从前端资源静态解析得到。

## 实测请求：Top Gainers ETF

~~~json
{
  "symbol":[{"op":"intersect","type":"block_id","value":["C3FE"]}],
  "indicator":[{"id":"199112","req_unique_id":"ranking","attr":{"trade_class":"intraday"}}],
  "sort":[{"pos":0,"order":"desc"}],
  "page":{"begin":0,"count":20}
}
~~~

C3FE 是网页 ETF 证券池。symbol 筛候选，indicator 选结果指标，sort.pos 是 indicator 数组下标，page.begin 是零起始偏移。该请求的 page.total 是 ETF 候选总数，不能当作 Top 20 策略的最终显示数量。

股票无条件证券池使用网页默认 Prompt ID 67fca073209f225f5e6bd457。股票字段和 ETF 字段分开；ETF 预设不能直接套给股票。

## 行业、费率和成交量组合

以下构造来自实际 Prompt ID、页面条件序列化和已观察的快照请求，同类组合已通过无账户凭证的游客 HTTP 查询验证。

~~~json
{
  "symbol":[
    {"op":"intersect","type":"block_id","value":["C3FE"]},
    {"op":"intersect","type":"prompt_id","value":["6a6870aa1bf1ae4851280446"],"attr":{"value":"Technology"}},
    {"op":"intersect","type":"prompt_id","value":["6a68a1c15656a1493f5b2de6"],"attr":{"min":0,"max":0.005}},
    {"op":"intersect","type":"prompt_id","value":["6a689eef1bf1ae4851280449"],"attr":{"min":100000,"max":999999999999}}
  ],
  "indicator":[
    {"id":"55","req_unique_id":"name"},
    {"id":"10","req_unique_id":"last","attr":{"trade_class":"intraday"}},
    {"id":"199112","req_unique_id":"change","attr":{"trade_class":"intraday"}}
  ],
  "sort":[{"pos":2,"order":"desc"}],
  "page":{"begin":0,"count":40}
}
~~~

费用率筛选 0.5% 发小数 0.005；结果指标 199112 实测返回值如 27.24496 则已经是百分数点，约为 27.24%。**不能对筛选阈值和结果指标共用一个无条件乘/除 100 的规则。** max-only 的 CLI 使用网页空边界哨兵值 -999999999999，不偷偷加入非负约束。

收益率 1D/1W/1M/3M/YTD/1Y/5Y 是不同 Prompt ID，而非随意拼一个 period 属性。信号也各有 Prompt ID，例如 MACD Golden Cross 为 6a6a09815656a1493f5b2dfd，不附数值阈值。MA/EMA 使用 value 为 closing_price 或均线标识、min/max 为 ma_50 / expma_50 等的比较表达式。

源码对 Asset Size 有交换映射：界面 Mega-Cap 发 Large-Cap，界面 Large-Cap 发 Mega-Cap。脚本保留实际兼容行为，不把它推广为通用金融规则。

## 多选和排名

同字段多选先发多个 op 为 union 的 Prompt，分页拿到去重 symbol_code；最终改用 market_code + intersect，与其他字段组合。直接把多选都设为 intersect 会错误排除结果。

排名先按指标排序，跳过空或非数值排名值，截取 Top N 证券代码；再查询这些证券的展示列。高低点类排名另加自己的布尔 Prompt。--top 控制候选数量，--limit / --offset 控制展示分页。两次请求间行情可能变化，不称作原子快照。

## 实测响应样本

~~~json
{
  "status_code":0,
  "status_msg":"success",
  "data":{
    "indicator":[{"id":"199112","req_unique_id":"ranking","attr":{"trade_class":"intraday","value_type":"ratio","unit":"%"}}],
    "symbol_type":"market_code",
    "data":[{"symbol_code":"171:SNDQ","value":[{"v":27.24496}]}],
    "page":{"total":5788}
  }
}
~~~

这是历史捕获样本，数值不可当作未来执行结果。value 按响应 indicator 下标对应；脚本用响应 req_unique_id 命名，保留缺失值和返回指标元数据。

HTTP 错误、业务 status_code 非 0、HTML 验证页或未知结构需要明确报错，不能归类为“没有匹配股票”。retrieved_at 是取数时间；若响应没有交易时间，不伪造实时报价时间。
