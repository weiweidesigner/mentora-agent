"""Shared, scheduled scene reports. One copy per deployment, never per visitor."""
SCENE_OWNER='mentora-public-scene-reports-v1'
# Each preset uses the ordinary research executor, its evidence/skill contract,
# and durable task/run storage. Nothing here substitutes canned report content.
PRESETS=[
 ('pre', '08:00', '🌅', '隔夜市场，先看重点', '帮我看看昨晚欧美市场发生了什么，重点说说哪些变化可能影响今天的A股。'),
 ('pre', '08:30', '🗓️', '今天的大事与催化', '今天A股有哪些值得留意的大事？帮我把重要数据、政策、公司公告和财报时间理一理。'),
 ('pre', '09:00', '🔭', '开盘前的观察清单', '快开盘了，结合昨晚的消息和昨天的行情，帮我列几个今天值得观察的指数、行业和ETF。'),
 ('live', '10:00', '📊', '早盘走到哪里了', '帮我看看今天A股早盘走得怎么样，指数、成交量和大多数股票的表现有没有什么值得注意的变化？'),
 ('live', '11:00', '☀️', '盘中强弱，一起看清', '现在盘中哪些行业和ETF比较强，哪些比较弱？帮我看看热点有没有变化。'),
 ('live', '14:00', '🧭', '午后市场观察', '帮我看看A股午后有什么新变化，结合量能、涨跌分布和新闻，说说尾盘可以留意什么。'),
 ('post', '15:15', '🌇', '收盘后，读懂今天', '收盘了，帮我复盘一下今天的A股。除了指数，也看看大多数股票、成交量和行业表现。'),
 ('post', '16:00', '🧩', '今天的主线与分歧', '今天A股的主线是什么，市场又在哪些地方有分歧？结合收盘数据和新闻帮我捋一捋。'),
 ('post', '17:30', '📝', '明天，值得留意什么', '帮我看看收盘后有哪些重要公告和消息，再整理一下明天开市值得关注的事情。'),
 ('rest', '09:00', '🧳', '休市日，轻松看一周', 'A股今天休市，陪我回顾一下最近一周吧，看看市场、行业和重要事件有哪些变化。'),
 ('rest', '12:00', '🌍', '市场之外的新变化', '今天A股休市，帮我看看全球市场和公司新闻有什么新变化，哪些可能影响下次开盘？'),
 ('rest', '17:00', '🗺️', '为下次开市做点准备', '趁休市，帮我为下次开盘做点准备。有哪些重要数据、政策和财报要留意，可以观察哪些指标？'),
]


def preset_payloads():
    from app.day_tasks import TaskInput
    for i,(stage,time,emoji,title,prompt) in enumerate(PRESETS,1):
        question=prompt
        yield f'mentora-scene-cn-{i:02d}',emoji,TaskInput(title=title,question=question,market='CN',stage=stage,assetType='index',time=time,timeMode='fixed',timezone='Asia/Shanghai',cadence='daily' if stage=='rest' else 'trading',enabled=True)
