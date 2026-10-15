from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Callable
from typing import Any


class AutoGenPlanningError(RuntimeError):
    """Raised when the AutoGen planner cannot produce an executable route."""


AUTOGEN_PLANNER_VISUAL_GUIDANCE = (
    "采用 Skill 优先、证据先行、图文协同的规划方式。时间序列、两项及以上比较、排名、构成、分布、"
    "K线、资金流、事件过程或关系网络在数据质量足够且存在匹配组件时，默认规划 1 个最能支撑核心结论的主图；"
    "无需等待用户明确说‘画图’。单一数值、简单状态、纯操作结果、数据不足或图形可能误导时不要强行追加图表。"
    "只有不同图表回答不同问题，且用户明确要求扩展研究时，才规划多个图表。"
    "原生业务 kline.py 是跨资产组件：股票、ETF、数字币交易对和数据源可识别的明确期权合约均可使用；"
    "这些资产的行情或技术面优先使用业务K线，不要降级成通用折线。数字币和期权不得追加公司财报、估值或评级组件。"
)


AUTOGEN_INTERPRETER_VISUAL_GUIDANCE = (
    "采用证据先行、图文协同的表达：先给核心结论，再解释关键证据及图表揭示的变化、差异或拐点，"
    "最后说明风险、数据时间与口径。不要机械复述图中全部数值。结论强度必须与证据质量匹配；"
    "代理、降级、不完整或非实时数据必须明确披露。"
)


def _compact_module(item: dict[str, Any]) -> dict[str, str]:
    return {
        "script": str(item.get("script") or ""),
        "label": str(item.get("label") or ""),
        "description": re.sub(r"\s+", " ", str(item.get("description") or "")).strip()[:240],
    }


def _search_catalog(modules: list[dict[str, Any]], query: str, limit: int = 12) -> list[dict[str, str]]:
    normalized = query.strip().lower()
    terms = {term for term in re.split(r"[^\w\u3400-\u9fff]+", normalized) if term}
    scored: list[tuple[int, int, dict[str, str]]] = []
    for index, raw in enumerate(modules):
        item = _compact_module(raw)
        haystack = " ".join(item.values()).lower()
        score = 0
        if normalized and normalized in haystack:
            score += 20
        for term in terms:
            if term in haystack:
                score += 4
        # Common financial concepts are deliberately aliases, not fixed routes.
        aliases = {
            "资金流": ("trade_flow.py", "cash_flow.py"),
            "订单流": ("trade_flow.py",),
            "k线": ("kline.py",),
            "行情": ("kline.py", "yahoo_data.py"),
            "利润": ("income_statement.py",),
            "现金流": ("cash_flow.py",),
            "估值": ("valuation.py", "valuation_ratios.py"),
            "新闻": ("ainvest_news_search.py", "external_info_search.py"),
        }
        for phrase, scripts in aliases.items():
            if phrase in normalized and item["script"] in scripts:
                score += 12
        if score:
            scored.append((score, -index, item))
    scored.sort(reverse=True)
    return [item for _, _, item in scored[:limit]] or [_compact_module(item) for item in modules[:limit]]


async def _plan_async(
    *,
    question: str,
    modules: list[dict[str, Any]],
    contract_loader: Callable[[str], dict[str, Any]],
    api_key: str,
    base_url: str,
    model: str,
    max_messages: int,
    timeout_seconds: float,
    visual_semantics: str = "",
) -> dict[str, Any]:
    try:
        from autogen_agentchat.agents import AssistantAgent
        from autogen_ext.models.openai import OpenAIChatCompletionClient
    except ImportError as exc:
        raise AutoGenPlanningError("AutoGen 依赖尚未安装") from exc

    module_by_script = {
        str(item.get("script") or "").strip(): item
        for item in modules
        if str(item.get("script") or "").strip()
    }
    contracts_read: set[str] = set()
    submitted: dict[str, Any] | None = None
    trace: list[str] = []

    def search_components(query: str) -> str:
        """Search the Mentora component catalog by business intent or chart semantics."""
        trace.append("search:" + str(query)[:120])
        return json.dumps(_search_catalog(modules, query), ensure_ascii=False)

    def get_component_contract(script: str) -> str:
        """Read one component's exact CLI help, schema and data-source contract before planning it."""
        normalized = str(script or "").strip()
        if normalized not in module_by_script:
            return json.dumps({"ok": False, "error": f"未知组件: {normalized}"}, ensure_ascii=False)
        trace.append("contract:" + normalized)
        contract = contract_loader(normalized)
        contracts_read.add(normalized)
        return json.dumps({"ok": True, **contract}, ensure_ascii=False)

    def submit_analysis_plan(plan_json: str) -> str:
        """Submit the final Mentora route JSON after all selected component contracts were read."""
        nonlocal submitted
        trace.append("submit")
        try:
            route = json.loads(plan_json)
        except json.JSONDecodeError as exc:
            return f"PLAN_REJECTED: JSON 无法解析: {exc}"
        if not isinstance(route, dict):
            return "PLAN_REJECTED: 顶层必须是 JSON object"
        steps = route.get("steps")
        if not isinstance(steps, list):
            return "PLAN_REJECTED: steps 必须是数组"
        if not steps and not route.get("requiresClarification"):
            return "PLAN_REJECTED: 空计划必须明确 requiresClarification=true"
        selected_scripts: list[str] = []
        for step in steps:
            if not isinstance(step, dict):
                return "PLAN_REJECTED: 每个 step 必须是 object"
            script = str(step.get("script") or "").strip()
            if script not in module_by_script:
                return f"PLAN_REJECTED: 未知 script: {script}"
            selected_scripts.append(script)
        unread = sorted(set(selected_scripts) - contracts_read)
        if unread:
            return "PLAN_REJECTED: 必须先读取这些组件契约: " + ", ".join(unread)
        submitted = route
        return "PLAN_ACCEPTED"

    # Keep the first model turn small. Detailed descriptions and schemas are
    # retrieved through tools only when the agent needs them.
    catalog = _search_catalog(modules, question, limit=16)
    system_message = (
        "你是 Mentora 的 AutoGen ReAct 规划 Agent。你只负责推理和生成工具执行计划，"
        "不能直接生成图表，也不能回答最终分析结论。Mentora 原有执行器会执行计划并保留全部前端展示逻辑。\n"
        "工作顺序必须是：1) 用 search_components 按用户业务语义寻找候选组件；"
        "2) 对最终选择的每个脚本调用 get_component_contract，核对真实 CLI/schema；"
        "3) 调用 submit_analysis_plan 提交计划。计划通过后停止。\n"
        "如果初始候选索引已经包含精确匹配的组件，可跳过 search_components，直接读取该组件契约。"
        "最多调用一次 search_components；一旦读到足够的组件契约，下一轮必须提交计划，不得继续扩散搜索。"
        + AUTOGEN_PLANNER_VISUAL_GUIDANCE +
        "用户明确点名 K线、资金流、成交结构或某个具体图表时，只选择该主图表；不要擅自追加旁证图表或搜索。"
        "K线契约支持 2h；用户明确要求在 K线上展示当前/近期买点、卖点、支撑位或压力位时，"
        "直接规划 kline.py 并保留该周期，后续执行器会基于行情生成原生标记，不要反问是否需要标记。"
        "不要猜 CLI 参数，不要使用契约中不存在的参数。latest/最新/实时请求不得使用 sample/demo/mock/fallback 数据。"
        "美股 market 应使用 auto 或契约要求的数字 ID，不能传 US/USA/NYSE/NASDAQ。"
        "资金流向/订单流使用 trade_flow.py；公司经营现金流/现金流量表才使用 cash_flow.py。\n"
        "提交结构：{\"steps\":[{\"script\":\"trade_flow.py\",\"label\":\"资金流\","
        "\"code\":\"BABA\",\"cli_args\":[\"--market\",\"auto\"],"
        "\"thought\":\"本步目的\",\"reason\":\"选择原因\","
        "\"expected_observation\":\"预期结果\",\"next_thought\":\"后续用途\"}],"
        "\"reason\":\"整体计划\",\"requiresClarification\":false,\"clarificationQuestion\":\"\"}。\n"
        "所有自然语言字段使用用户语言；script、ticker 和 CLI 名保持原样。"
        + ("\n" + visual_semantics if visual_semantics else "")
    )
    model_client = OpenAIChatCompletionClient(
        model=model,
        api_key=api_key,
        base_url=base_url,
        model_info={
            "vision": False,
            "function_calling": True,
            "json_output": True,
            "family": "unknown",
            "structured_output": False,
        },
        extra_body={"thinking": {"type": "disabled"}},
        timeout=min(timeout_seconds, 45.0),
        max_retries=0,
    )
    agent = AssistantAgent(
        "aime_chart_planner",
        model_client=model_client,
        tools=[search_components, get_component_contract, submit_analysis_plan],
        system_message=system_message,
        reflect_on_tool_use=False,
    )
    task = (
        f"用户问题：{question}\n\n"
        "按当前问题预筛选的候选组件如下。若已有精确匹配，直接读契约；否则搜索一次，再读最终组件契约并提交：\n"
        + json.dumps(catalog, ensure_ascii=False, separators=(",", ":"))
    )
    result = None
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_seconds
    try:
        for round_index in range(max_messages):
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise TimeoutError
            instruction = task if round_index == 0 else (
                "继续完成规划。根据已有工具 observation，读取尚未读取的最终组件契约，"
                "然后调用 submit_analysis_plan；不要输出最终用户答案。"
            )
            result = await asyncio.wait_for(agent.run(task=instruction), timeout=remaining)
            if submitted is not None:
                break
    except TimeoutError as exc:
        raise AutoGenPlanningError(
            f"AutoGen 规划超过 {timeout_seconds:g} 秒；已执行步骤: {', '.join(trace) or '无'}"
        ) from exc
    except Exception as exc:  # noqa: BLE001 - normalize provider failures for the host app
        raise AutoGenPlanningError(
            f"AutoGen 模型调用失败（{type(exc).__name__}）；已执行步骤: {', '.join(trace) or '无'}"
        ) from exc
    finally:
        await model_client.close()
    if submitted is None:
        tail = " | ".join(
            str(getattr(message, "content", ""))[:300]
            for message in (result.messages[-3:] if result is not None else [])
        )
        raise AutoGenPlanningError("AutoGen 未提交有效计划: " + tail)
    submitted["_strategy_source"] = "autogen"
    submitted["_model_planned"] = True
    submitted["_model_reason"] = str(submitted.get("reason") or "").strip()
    submitted["_autogen_contracts_read"] = sorted(contracts_read)
    submitted["_autogen_trace"] = list(trace)
    submitted["_autogen_agent"] = "aime_chart_planner"
    return submitted


def plan_route_with_autogen(
    *,
    question: str,
    modules: list[dict[str, Any]],
    contract_loader: Callable[[str], dict[str, Any]],
    api_key: str,
    base_url: str,
    model: str,
    max_messages: int = 10,
    timeout_seconds: float = 60,
    visual_semantics: str = "",
) -> dict[str, Any]:
    """Run the AutoGen planner from the synchronous FastAPI execution pipeline."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(
            _plan_async(
                question=question,
                modules=modules,
                contract_loader=contract_loader,
                api_key=api_key,
                base_url=base_url,
                model=model,
                max_messages=max_messages,
                timeout_seconds=timeout_seconds,
                visual_semantics=visual_semantics,
            )
        )
    raise AutoGenPlanningError("不能在已运行的 asyncio event loop 中同步调用 AutoGen planner")


async def _complete_text_async(
    *,
    prompt: str,
    api_key: str,
    base_url: str,
    model: str,
    timeout_seconds: float,
    temperature: float,
    max_tokens: int,
) -> str:
    try:
        from autogen_agentchat.agents import AssistantAgent
        from autogen_ext.models.openai import OpenAIChatCompletionClient
    except ImportError as exc:
        raise AutoGenPlanningError("AutoGen 依赖尚未安装") from exc
    model_client = OpenAIChatCompletionClient(
        model=model,
        api_key=api_key,
        base_url=base_url,
        model_info={
            "vision": False,
            "function_calling": True,
            "json_output": True,
            "family": "unknown",
            "structured_output": False,
        },
        extra_body={"thinking": {"type": "disabled"}},
        timeout=min(timeout_seconds, 120.0),
        max_retries=0,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    agent = AssistantAgent(
        "aime_chart_interpreter",
        model_client=model_client,
        system_message=(
            "你是 Mentora 的综合解读 Agent。严格依据任务中提供的数据证据生成结果，"
            "遵守任务指定的语言和 JSON schema，不得编造数据，不得提及内部实现。"
            + AUTOGEN_INTERPRETER_VISUAL_GUIDANCE
        ),
    )
    try:
        result = await asyncio.wait_for(agent.run(task=prompt), timeout=timeout_seconds)
    except Exception as exc:  # noqa: BLE001
        raise AutoGenPlanningError(f"AutoGen 综合解读失败（{type(exc).__name__}）") from exc
    finally:
        await model_client.close()
    for message in reversed(result.messages):
        content = getattr(message, "content", None)
        if isinstance(content, str) and content.strip():
            return content.strip()
    raise AutoGenPlanningError("AutoGen 综合解读没有返回文本")


def complete_text_with_autogen(
    *,
    prompt: str,
    api_key: str,
    base_url: str,
    model: str,
    timeout_seconds: float = 120,
    temperature: float = 0.2,
    max_tokens: int = 6000,
) -> str:
    """Generate the report interpretation through AutoGen's AssistantAgent."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(
            _complete_text_async(
                prompt=prompt,
                api_key=api_key,
                base_url=base_url,
                model=model,
                timeout_seconds=timeout_seconds,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        )
    raise AutoGenPlanningError("不能在已运行的 asyncio event loop 中同步调用 AutoGen interpreter")
