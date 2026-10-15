"""Shared, scheduled scene reports. One copy per deployment, never per visitor."""
SCENE_OWNER='mentora-public-scene-reports-v1'
# Each preset uses the ordinary research executor, its evidence/skill contract,
# and durable task/run storage. Nothing here substitutes canned report content.
PRESETS=[
 ('pre','08:00','🌅','隔夜市场，先看重点','整理隔夜欧美主要指数、利率、汇率与大宗商品变化，筛选会影响今日A股的已确认事件与风险。'),
 ('pre','08:30','🗓️','今天的大事与催化','整理今日A股经济数据、政策、重要公告和财报日历，按已确认时间列出观察清单，不编造事件。'),
 ('pre','09:00','🔭','开盘前的观察清单','结合隔夜消息和上一交易日行情，梳理今日A股主要指数、行业与可核验ETF的观察指标和风险，不假设用户持仓。'),
 ('live','10:00','📊','早盘走到哪里了','观察A股主要指数、市场宽度、成交量与行业变化，对比可靠历史同期数据，解释早盘值得关注的变化。'),
 ('live','11:00','☀️','盘中强弱，一起看清','比较A股行业与有可靠行情的代表性ETF的涨跌、量能和相对强弱，梳理热点变化，注明数据截至时间。'),
 ('live','14:00','🧭','午后市场观察','汇总A股午后指数、成交量、涨跌分布与重要新闻，区分已确认驱动与推测，列出尾盘观察点。'),
 ('post','15:15','🌇','收盘后，读懂今天','在A股收盘后复盘主要指数、市场宽度、成交量与行业表现，说明当日变化与数据口径。'),
 ('post','16:00','🧩','今天的主线与分歧','基于A股当日收盘数据与可靠新闻，梳理行业主线、市场分歧及风险，不把成交额解读为资金净流入。'),
 ('post','17:30','📝','明天，值得留意什么','复盘A股收盘后已确认的重要公告、财报与政策事件，整理下一交易日观察日历和风险清单。'),
 ('rest','09:00','🧳','休市日，轻松看一周','今天是A股非交易日。回顾最近一个完整交易周的指数、行业、市场宽度与重要事件，明确数据日期，不冒充今日行情。'),
 ('rest','12:00','🌍','市场之外的新变化','在A股休市日梳理最近已确认的全球市场、宏观政策与公司新闻，说明对下个交易日的潜在影响和信息限制。'),
 ('rest','17:00','🗺️','为下次开市做点准备','在A股休市日整理下一交易日或下一周已确认的数据、政策与财报日历，结合最近收盘情况列出观察指标。'),
]


def preset_payloads():
    from app.day_tasks import TaskInput
    for i,(stage,time,emoji,title,prompt) in enumerate(PRESETS,1):
        question=prompt+' 使用项目已有金融研究技能获取可靠证据，优先提供清晰结论和有依据的可视化。注明市场、行情日期、数据截至时间与延迟；区分事实、判断和缺失数据；无法获得可靠数据时明确说明。只做研究，不交易、不修改账户、不向外部发送消息。'
        yield f'mentora-scene-cn-{i:02d}',emoji,TaskInput(title=title,question=question,market='CN',stage=stage,assetType='index',time=time,timeMode='fixed',timezone='Asia/Shanghai',cadence='daily' if stage=='rest' else 'trading',enabled=True)
