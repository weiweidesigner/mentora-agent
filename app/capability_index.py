"""Fast, bounded capability retrieval for the general Mentora agent.

The index narrows the context presented to the model.  It deliberately does
not choose an execution plan: the model may combine candidates or fall back to
the full skill directory when the shortlist is insufficient.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.business_chart_dependency import load_registry_data


_SEMANTIC_ALIASES: dict[str, tuple[str, ...]] = {
    "macro_indicator.py": ("宏观指标走势", "各国宏观经济", "澳大利亚利率", "中国GDP走势", "美国失业率", "失业率走势", "美国利率", "政策利率", "利率变化", "美国贸易差额", "贸易逆差", "USUR", "USINTR", "USBOT", "economic indicator history", "US unemployment rate", "US interest rate", "US trade balance"),
    "economic_indicators_heatmap.py": ("全球经济指标", "各国经济指标对比", "经济指标热力图", "economic indicators heatmap"),
    "inflation_map.py": ("全球通胀", "通胀地图", "inflation map"),
    "gdp_growth.py": ("GDP", "G20", "经济增长排名", "GDP同比增长", "GDP growth"),
    "ashare_intraday.py": ("a股分时", "上证指数", "深证指数", "分时走势", "每天分时", "五日分时", "分钟行情", "沪深分时"),
    "read_market_data.py": ("行情", "报价", "价格", "走势", "美股", "投资机会", "股票机会", "quote", "market data", "stock opportunities"),
    "price_snapshot.py": (
        "a股表现", "a股行情", "市场表现", "上午行情", "午盘", "收盘",
        "上涨家数", "下跌家数", "市场宽度", "全市场", "行情快照", "snapshot", "breadth",
    ),
    "historical_kline.py": ("a股k线", "a股历史行情", "a股走势", "历史k线"),
    "adjustment_factors.py": ("复权因子", "除权除息", "adjustment factor"),
    "income_statements.py": ("a股利润表", "a股财报", "a股营收", "a股净利润"),
    "trading_calendar.py": ("a股交易日", "交易日历", "休市", "开市"),
    "kline.py": ("k线", "k線", "蜡烛图", "行情图", "candlestick", "price chart"),
    "multi_kline.py": ("多k线", "多标的k线", "多周期k线", "compare candlestick"),
    "suspicious_trades.py": ("可疑交易线索", "可疑交易", "议员交易关联事件", "Suspicious Trade", "suspicious_trade", "交易事件窗口"),
    "congress_leaderboard.py": ("议员交易排行榜", "国会议员收益排名", "议员交易活跃度", "这个月表现最差的议员都是谁", "本月表现最好的议员", "议员投资表现最差", "congress trade leaderboard", "congress returns ranking"),
    "congress_recent_trades.py": ("国会近期交易", "近期议员交易", "国会最新披露", "美国国会交易记录", "recent congress trades", "recent trades", "按交易日期筛选"),
    "politician_trades.py": ("议员交易", "格林交易", "佩洛西交易", "议员买卖", "政治人物交易", "季度交易金额", "交易行业", "politician trades", "top traded industry"),
    "politician_holdings.py": ("议员持仓", "议员持股", "国会议员持仓", "政治人物持仓", "佩洛西持仓", "格林持仓", "politician holdings", "top holdings", "current holdings"),
    "politician_performance.py": ("议员投资表现", "佩洛西", "Nancy Pelosi", "佩洛西收益", "佩洛西投资", "议员收益曲线", "人物收益", "politician performance", "Nancy Pelosi performance"),
    "smart_money.py": ("smart money", "聪明钱", "聰明錢", "国会交易", "机构预测", "institution forecasts"),
    "multi_intraday.py": ("多股分时", "盘中对比", "intraday comparison"),
    "income_statement.py": ("利润表", "损益表", "收入利润", "income statement"),
    "balance_sheet.py": ("资产负债表", "balance sheet"),
    "cash_flow.py": ("现金流量表", "现金流", "cash flow"),
    "valuation.py": ("估值", "valuation"),
    "revenue_sources.py": ("收入构成", "业务收入", "revenue breakdown"),
    "revenue_geography.py": ("地区收入", "地理收入", "revenue geography"),
    "analyst_recommendations.py": ("分析师评级", "华尔街评级", "analyst recommendation"),
    "price_target_vs_actual.py": ("目标价", "price target"),
    "eps_estimate.py": ("eps预期", "每股收益预测", "eps estimate"),
    "revenue_estimate.py": ("营收预期", "收入预测", "revenue estimate"),
    "bar_chart.py": ("柱状图", "柱形图", "排名", "排行", "a股表现", "市场表现", "板块表现", "涨跌幅对比", "bar chart"),
    "bar_line.py": ("柱折图", "柱线图", "双轴", "bar line"),
    "line_chart.py": ("折线图", "趋势图", "line chart"),
    "group_line.py": ("多系列折线", "分组折线", "group line"),
    "grouped_bar.py": ("分组柱状", "并列柱", "a股表现", "市场表现", "上涨下跌", "涨跌分布", "grouped bar"),
    "pie.py": ("饼图", "占比", "pie chart"),
    "treemap.py": ("矩形图", "树图", "treemap"),
    "timeline.py": ("时间线", "timeline"),
    "flowchart.py": ("流程图", "flowchart"),
    "mind_map.py": ("思维导图", "脑图", "mind map"),
    "external_info_search.py": ("联网搜索", "外部搜索", "最新新闻", "为什么", "原因", "解释", "kimi", "web search", "latest news", "搜图", "搜索图片", "找图片", "找照片", "image search", "photos"),
    "render_streamviz.py": ("可视化", "看板", "仪表盘", "dashboard", "visualization"),
    "ainvest_news_search.py": ("ainvest新闻", "站内新闻", "美股新闻", "最新新闻", "为什么", "原因", "解释"),
    "ainvest_video_search.py": ("视频搜索", "shorts", "youtube video"),
    "url_content_reader.py": ("读取链接", "网页正文", "url", "webpage"),
    "code_interpreter.py": ("数据清洗", "聚合", "统计", "汇总", "a股表现", "市场表现", "市场宽度", "横截面", "分布", "csv", "json", "同比", "环比", "code interpreter"),
}

_SKILL_ALIASES: dict[str, tuple[str, ...]] = {
    "my-holdings": ("我的持仓", "持仓", "我的股票", "持仓看板", "my portfolio", "my holdings"),
    "my-watchlist": ("我的自选", "自选股", "自选", "my watchlist", "favorites"),
    "streamviz": ("streamviz", "dashboard", "仪表盘", "看板", "可视化", "交互式html", "流式网页"),
    "custom-html-widget": ("html报告", "html页面", "html组件", "widget", "mini app"),
    "vision-chart-analyst": ("看图分析", "图片分析", "视觉检查", "multimodal"),
    "flux-image": ("生成图片", "插画", "海报", "image generation"),
    "market-data": ("行情数据", "报价", "ohlcv", "market data"),
    "ashare-minute": ("a股分时", "上证指数分时", "深证指数分时", "五日分时", "每天分时", "分钟行情"),
    "a-share-data": ("a股", "沪深", "中国股票"),
    "chart-markup": ("标注", "参考线", "事件点", "mark"),
}


def _terms(value: str) -> set[str]:
    text = str(value or "").lower().replace("_", " ").replace("-", " ")
    terms = set(re.findall(r"[a-z0-9]+|[\u3400-\u9fff]{2,}", text))
    for chunk in re.findall(r"[\u3400-\u9fff]{2,}", text):
        terms.update(chunk[i:i + 2] for i in range(len(chunk) - 1))
    return terms


def _score(query: str, searchable: str, aliases: tuple[str, ...] = ()) -> int:
    q = query.lower()
    haystack = searchable.lower()
    score = 0
    for alias in aliases:
        if alias.lower() in q:
            score += 16 + min(8, len(alias))
    q_terms = _terms(q)
    candidate_terms = _terms(haystack + " " + " ".join(aliases))
    score += 2 * len(q_terms & candidate_terms)
    for term in q_terms:
        if len(term) >= 3 and term in haystack:
            score += 2
    return score


@dataclass(frozen=True)
class CapabilityShortlist:
    skills: tuple[dict[str, str], ...]
    modules: tuple[dict[str, str], ...]

    def render(self) -> str:
        if not self.skills and not self.modules:
            return ""
        lines = [
            "\n\n宿主轻量能力检索（候选集，不是写死路由）：",
            "优先在下列候选中选择、组合或放弃；候选不足时才扩展读取 .agents/skills，不要先扫描全部目录。",
            "下列 Skill 元数据已完成发现；不要再调用 skill 工具重复加载 bridge。选定组件后，contract 的一次回执会同时提供完整规范、CLI 和 schema，该回执即完成契约读取。",
        ]
        if self.skills:
            lines.append("相关 Skill：")
            lines.extend(f"- {item['name']}: {item['description'][:220]}" for item in self.skills)
        if self.modules:
            lines.append("相关可执行能力：")
            for item in self.modules:
                lines.append(
                    f"- {item['script']} [Skill: {item['skill']}]: {item['description'][:260]} "
                    f"| 契约: python3 app/skill_runner.py contract --script {item['script']} "
                    f"| 执行: python3 app/skill_runner.py execute --script {item['script']} -- <该组件参数>"
                )
        lines.append(
            "展示选择：标准数值趋势、对比、占比或分布优先选择相应的通用确定性图表渲染器，"
            "即使用户没有指定图表类型，也由你根据数据选择，不默认交给 StreamViz 手写 SVG 坐标。"
            "原生业务组件的明确样式契约继续保留。StreamViz 负责看板布局、叙事和非标准交互；"
            "可用 chart_artifacts 嵌入已通过 chartValidation 的图表，保留其数据、坐标和交互。"
            "通用图表可用 payload.dataSource 的 path/recordsPath/fields 直接读取上游文件，避免转抄数据。"
            "可选具体脚本：line_chart.py 折线、group_line.py 分组折线、bar_chart.py 柱状、grouped_bar.py 分组柱、bar_line.py 柱折、pie.py 饼图。"
            "按所选脚本获取 contract --script；不存在 generic_chart.py 或 contract --skill。"
        )
        lines.append(
            "对每个最终选定的组件最多调用 contract 一次；多个独立 contract 可在同一步并行获取。"
            "不再单独读取 bridge、SKILL.md、源码或 schema，不用 --help、ls、cat、sed、grep 反复查找。"
            "统一入口只允许 module_registry 中的脚本，会原样返回结构化 stdout 并验证产物；"
            "execute 会自动创建 outputs/ 下的目标目录，不要额外调用 mkdir。"
            "成功回执的 artifacts[].verified=true 且 bytes>0 已是产物验证，不要再用 test/ls/wc/cat 复查。"
            "同一数据和参数失败后不要重复调用。"
        )
        return "\n".join(lines)


class CapabilityIndex:
    def __init__(self, project_root: Path) -> None:
        self.root = project_root.resolve()
        self._skills = self._load_skills()
        self._modules = self._load_modules()

    def _load_skills(self) -> list[dict[str, str]]:
        entries: list[dict[str, str]] = []
        for path in sorted((self.root / ".agents/skills").glob("*/SKILL.md")):
            try:
                frontmatter = path.read_text(encoding="utf-8").split("---", 2)[1]
            except (OSError, IndexError):
                continue
            match = re.search(r"(?m)^description:\s*(.+)$", frontmatter)
            if match:
                entries.append({"name": path.parent.name, "description": match.group(1).strip()})
        return entries

    def _script_skill(self, script: str, module_name: str) -> str:
        preferred = {
            "ainvest_news_search": "internal-search",
            "ainvest_video_search": "video-search",
            "external_info_search": "external-search",
            "url_content_reader": "external-search",
        }.get(module_name)
        if preferred:
            return preferred
        matches = [p.parent.parent.name for p in (self.root / "app/skills").glob(f"*/scripts/{script}")]
        return matches[0] if matches else "unknown"

    def _load_modules(self) -> list[dict[str, str]]:
        try:
            raw = load_registry_data(self.root / "app/module_registry.json")
        except (OSError, json.JSONDecodeError):
            return []
        entries: list[dict[str, str]] = []
        for item in raw if isinstance(raw, list) else []:
            if not isinstance(item, dict):
                continue
            script = Path(str(item.get("script") or "")).name
            if not script.endswith(".py"):
                continue
            name = str(item.get("name") or Path(script).stem)
            entries.append({
                "name": name,
                "script": script,
                "label": str(item.get("label") or name),
                "description": str(item.get("description") or item.get("label") or name).strip(),
                "skill": self._script_skill(script, name),
            })
        return entries

    def shortlist(self, question: str, *, skill_limit: int = 4, module_limit: int = 6) -> CapabilityShortlist:
        ranked_modules: list[tuple[int, dict[str, str]]] = []
        for item in self._modules:
            aliases = _SEMANTIC_ALIASES.get(item["script"], ())
            searchable = " ".join((item["name"], item["label"], item["description"], item["script"]))
            ranked_modules.append((_score(question, searchable, aliases), item))
        ranked_modules.sort(key=lambda pair: (-pair[0], pair[1]["script"]))
        top_module_score = ranked_modules[0][0] if ranked_modules else 0
        module_floor = max(4, int(top_module_score * 0.30))
        selected_modules = [item for score, item in ranked_modules if score >= module_floor][:module_limit]

        module_skills = {item["skill"] for item in selected_modules}
        ranked_skills: list[tuple[int, dict[str, str]]] = []
        for item in self._skills:
            score = _score(question, f"{item['name']} {item['description']}", _SKILL_ALIASES.get(item["name"], ()))
            if item["name"] in module_skills:
                score += 12
            ranked_skills.append((score, item))
        ranked_skills.sort(key=lambda pair: (-pair[0], pair[1]["name"]))
        top_skill_score = ranked_skills[0][0] if ranked_skills else 0
        skill_floor = max(4, int(top_skill_score * 0.30))
        selected_skills = [item for score, item in ranked_skills if score >= skill_floor][:skill_limit]
        return CapabilityShortlist(tuple(selected_skills), tuple(selected_modules))
