"""Owner-scoped workflow building and trials, sharing the task scheduler and Agent runtime."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import time
import uuid
from typing import Literal
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field, ValidationError
from app.workflow_observations import update_observations, observation_summary
from app.workflow_graph import WorkflowGraph, ordered_nodes
from app.workflow_contracts import validate_contracts, contract_errors, argument_errors, node_error
from app.day_tasks import COOKIE, TaskInput, now_utc, stamp
from app.text_opportunities import TOOL as TEXT_OPPORTUNITIES_TOOL

ROOT=Path(__file__).resolve().parents[1]
KINDS=[
    dict(id='start',label='流程输入',description='输入本次执行的目标或基础数据。'),
    dict(id='watchlist',label='自选股票',description='每次运行读取个人信息中的最新自选股票。'),
    dict(id='profile',label='投资者档案',description='读取当前用户的投资偏好与约束。'),
    dict(id='model',label='模型',description='使用当前默认模型分析上游输入，保留现有 Agent 能力。'),
    dict(id='condition',label='条件分支',description='按上游数据决定后续分支。'),
    dict(id='watchlist_update',label='更新观察列表',description='将上游实际回测、JEV 决策与交易结果保存到当前用户的观察列表；手动运行与定时执行均写入。'),
    dict(id='output',label='输出结果',description='汇总上游节点的真实输出。'),
]

PORTFOLIO_DECISION_TOOL=dict(
    id='portfolio-decision',
    label='Mentora Deal 决策',
    description='将上游回测结果与当前行情、账户、风控和已启用的投资偏好合并为完整 JEV 证据，执行置信度门槛并保存可执行决策。',
    instructions='输入回测 items、账户和用户偏好；输出 decisions 全量评估与 items 可执行决策。items 每项含 decisionId、symbol、side、confidence，可逐项连接 portfolio-order plan。',
    script='portfolio-decision',group='交易能力',icon='scale',
    schema={
        'type':'object','additionalProperties':False,
        'properties':{
            'kind':{'type':'string','enum':['entry','risk'],'default':'entry'},
            'items':{'type':'array','items':{'type':'object'},'minItems':1},
            'account':{'type':'object'},
            'profile':{'type':'object'},
        },
        'required':['items','account','profile'],
    },
)

@lru_cache(maxsize=2)
def legacy_tool_catalog(agent):
    from app.business_chart_dependency import load_registry_data
    rows=load_registry_data(ROOT/'app/module_registry.json')
    result=[]
    for row in rows:
        if not row.get('name'):continue
        result.append(dict(id=row['name'],label=row.get('label') or row['name'],description=row.get('description',''),script=Path(row.get('script','')).name,group='Agent 工具',schema=None))
    if agent=='mentora-deal':
        from app.portfolio_skills import catalog
        for row in catalog():
            result.append(dict(id=row['name'],label=row['name'],description=row['instructions'][:1600],script=row['name'],group='Mentora Deal',schema=row['inputSchema']))
    return list({r['id']:r for r in result}.values())


# Workflow nodes follow Skill boundaries, while legacy component nodes remain executable.
SKILL_NODES=[
 ('generic-chart','通用图表','可视化','bar_chart'),
 ('business-chart-recall','业务图表','可视化','kline'),
 ('trading-view-chart','TradingView 图表','可视化','line_chart'),
 ('chart-markup','图表标记','可视化','pen'),
 ('custom-html-widget','自定义组件','可视化','layout'),
 ('streamviz','报告与页面','可视化','document'),
 ('market-data','行情数据','数据与搜索','database'),
 ('a-share-data','A 股数据','数据与搜索','database'),
 ('external-search','网页搜索','数据与搜索','globe'),
 ('internal-search','资讯搜索','数据与搜索','news'),
 ('video-search','视频搜索','数据与搜索','video'),
 ('screener','股票筛选','数据与搜索','filter'),
 ('code-interpreter','代码计算','计算与生成','code'),
 ('pine-script','Pine Script','计算与生成','code'),
 ('flux-image','图片生成','计算与生成','image'),
 ('vision-chart-analyst','图表识别','计算与生成','scan'),
]
@lru_cache(maxsize=2)
def tool_catalog(agent):
    result=[]
    for skill,label,group,icon in SKILL_NODES:
        source=ROOT/'app'/'skills'/skill/'SKILL.md'
        if not source.is_file():continue
        content=source.read_text(encoding='utf-8')
        match=re.search(r'^description:\s*(.+)',content,re.M)
        description=match[1].strip().strip('"') if match else label+'，遵循对应 Skill 的输入和执行规范。'
        result.append(dict(id=skill,label=label,description=description,script='app/skills/'+skill+'/',group=group,icon=icon,schema=None))
    from app.portfolio_skills import catalog
    icons={'portfolio-account':'wallet','portfolio-backtest':'backtest','portfolio-jev':'scale','portfolio-order':'order','portfolio-data':'database','portfolio-symbols':'search','portfolio-technical':'line_chart'}
    for row in catalog():
        match=re.search(r'^description:\s*(.+)',row['instructions'],re.M)
        description=match[1].strip() if match else row['name']
        schema=json.loads(json.dumps(row['inputSchema']))
        if row['name']=='portfolio-data':
            schema.setdefault('allOf',[]).append({'if':{'properties':{'operation':{'enum':['quote','history','fundamentals','save_candidate']}},'required':['operation']},'then':{'required':['symbol'],'properties':{'symbol':{'type':'string','minLength':1}}}})
        result.append(dict(id=row['name'],label={'screener':'股票筛选','portfolio-account':'账户信息','portfolio-backtest':'策略回测','portfolio-jev':'JEV 决策','portfolio-order':'执行交易','portfolio-data':'交易数据','portfolio-symbols':'标的查询','portfolio-technical':'技术分析','portfolio-strategies':'策略配置'}.get(row['name'],row['name']),description=description,instructions=row['instructions'],script=row['name'],group='数据与搜索' if row['name']=='screener' else '交易能力',icon='filter' if row['name']=='screener' else icons.get(row['name'],'tool'),schema=schema))
    result.append(PORTFOLIO_DECISION_TOOL)
    result.append(TEXT_OPPORTUNITIES_TOOL)
    return list({row['id']:row for row in result}.values())

def execution_tools(agent):
    return list({row['id']:row for row in legacy_tool_catalog(agent)+tool_catalog(agent)}.values())

class TrialInput(BaseModel):
    graph: WorkflowGraph
    agent: Literal['mentora','mentora-deal']='mentora'
    title: str=Field(default='WorkFlow 试运行',max_length=80)
    question: str=Field(default='',max_length=6000)
    taskId: str | None=Field(default=None,max_length=80)
    executionMode: Literal['preview','execute']='preview'

class BuildInput(BaseModel):
    message: str=Field(min_length=2,max_length=6000)
    graph: WorkflowGraph | None=None
    agent: Literal['mentora','mentora-deal']='mentora'

class WorkflowService:
    def __init__(self,tasks,portfolio,runner,builder=None):
        self.tasks,self.portfolio,self.runner,self.builder=tasks,portfolio,runner,builder
        self.pool=ThreadPoolExecutor(max_workers=2,thread_name_prefix='mentora-workflow')
        with tasks.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS workflow_trials(id TEXT PRIMARY KEY,owner TEXT NOT NULL,config TEXT NOT NULL,status TEXT NOT NULL,nodes TEXT NOT NULL,result TEXT,error TEXT,created TEXT NOT NULL,updated TEXT NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0)')
        tasks.run_handlers.insert(0,self.scheduled)

    def recover_interrupted_trials(self):
        """Trial workers live in this server process and cannot survive restart."""
        error='服务重启中断了试运行，请重新试运行。'
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            rows=db.execute("SELECT id,nodes FROM workflow_trials WHERE status IN ('queued','running','stopping')").fetchall()
            for row in rows:
                nodes=json.loads(row['nodes'])
                for node in nodes.values():
                    if node.get('status')=='running':
                        node.update(status='failed',error=error,timingIncomplete=True)
                db.execute("UPDATE workflow_trials SET status='failed',nodes=?,error=?,updated=? WHERE id=?",
                           (json.dumps(nodes,ensure_ascii=False),error,stamp(now_utc()),row['id']))
        return len(rows)

    def validate(self,graph,agent):
        graph=WorkflowGraph.model_validate(graph)
        allowed={t['id'] for t in execution_tools(agent)}
        for node in graph.nodes:
            if node.kind=='tool' and node.tool not in allowed:raise ValueError('请选择当前 Agent 支持的工具：'+node.title)
        return validate_contracts(graph,execution_tools(agent))

    def build(self,payload):
        tools=tool_catalog(payload.agent)
        context=dict(message=payload.message,currentGraph=payload.graph.model_dump() if payload.graph else None,agent=payload.agent,
                     nodeKinds=KINDS,graphSchema=WorkflowGraph.model_json_schema(),nodeOutputs={'text-opportunities':'对象：items 是文本中本地 JEV 筛选的机会候选数组，symbols 是代码列表，assessments 为全量分类；不是买卖决策，无 decisionId。以 foreach={{节点ID.items}} 连接行情/回测，不得直接下单。','watchlist_update':'保存上游真实工具结果至观察列表；返回 symbols、updatedCount、preview 和 interpretation。手动运行与定时执行均实际写入。','watchlist':'数组，每项含 symbol/name 等实际字段。{{节点ID}} 是整个列表，{{节点ID.0.symbol}} 是第一项代码；没有 symbols/stocks 属性。','profile':'对象，含 profile/investment/enabled/updated。','tool':'单次调用输出该 Skill 的真实结果；设置 foreach 时输出 {items:[每次真实结果],count:数量}。','model':'对象，主要含 interpretation 文本及 reportArtifacts，不会自动产生任意结构化字段。','output':'仅汇总已有输出，不执行分析、筛选、计算或报告生成；这些任务需先经过工具或模型节点。'},tools=[{k:t.get(k) for k in ('id','label','description','schema','instructions')} for t in tools])
        context['nodeOutputs'].update({
            'portfolio-data/history':'对象，含 symbol、rows 和实际数据源；不是 symbols/ohlcv 的批量对象。',
            'portfolio-backtest':'单标的实际回测对象；批量执行时外层为 items/count，不存在自动汇总的 metrics。',
            'portfolio-jev':'结构化调用直接返回决策数组，不是 {decisions:...}。每项含 symbol/action/confidence 等评估字段；该原始评估不会自动保存可执行决策，不含可用于下单的 id/decisionId。不得凭空添加或将序号当作决策 ID。',
            'portfolio-order':'plan 返回真实计划对象（id）；execute 仅接受该计划的 planId。plan 必须使用当前用户已保存且有效的 JEV decisionId，不能把原始评估当成已保存决策。watch/skip/hold 不是合法 side，不能直接逐项映射全部决策下单。原始 JEV 评估不含 decisionId 时，不得创建会重新研究或尝试下单的模型节点；直接记录「缺少可执行决策记录」并继续汇总。只有上游明确提供真实 decisionId 时才可连接下单节点；不伪造 ID 或成交。',
            'portfolio-decision':'对每个上游回测项补齐最新行情、技术信号、风控、账户和已启用的用户偏好，再调用 JEV。输出对象中 decisions 是全量结果，items 只含已通过置信度和硬性风控、已保存且含 decisionId/side 的可执行决策。正式流程应将 {{该节点.items}} 逐项连接 portfolio-order plan，再将计划 items 逐项连接 execute；不需要通用模型二次判断置信度。',
        })
        if self.builder:generate=self.builder
        else:
            from openai import OpenAI
            prompt="""你是 Mentora WorkFlow 构建助手。根据用户要求创建或修改可执行的 DAG，不执行流程。
输出 JSON {"title":"简短中文名称","graph":{"version":1,"nodes":[...],"edges":[...]}}。
严格遵循 graphSchema。连线字段必须为 source（起点节点id）、target（终点节点id）、when（字符串always/true/false）；禁止使用from/to。\n节点字段 id,kind,title,x,y,instruction,tool,arguments,foreach,onItemError,path,operator,expected。
kind 仅可为 start/watchlist/profile/tool/model/condition/output/watchlist_update。工具必须使用目录中的真实 id。
文本提取机会时使用 text-opportunities 工具：arguments.text 传原文或上游文本字段引用；markets 可选 CN/HK/US，minimumConfidence 是文本机会分类门槛，不是执行门槛。只提取原文提及的已识别证券，不用通用模型替代本地 JEV，不新增下单节点。
每个 tool 节点使用 instruction 清楚描述该工具的任务、输入和期望输出；Mentora Deal 工具可通过 arguments 指定其合法 JSON 参数，参数中的 {{节点id.字段}} 引用上游输出，必须连线。需要根据 JEV 置信度自动下单时，必须使用 portfolio-decision 合并回测 items、账户和 profile，再将它的 items 逐项连接 portfolio-order plan，最后将 plan 的 items 逐项连接 portfolio-order execute。不添加用途重复的通用模型节点。
必须遵循每个工具的 schema，禁止猜测参数名、operation 或输出字段。portfolio-data 历史行情使用 operation=history 和单个 symbol，不支持 action=ohlcv 或 symbols。\n对自选列表等多个标的，结构化交易工具节点设置 foreach={{自选节点ID}}，arguments.symbol={{item.symbol}}；执行器会逐项调用，并输出 items 数组。下游逐项工具可用 foreach={{上游工具ID.items}}，不能把列表直接传给单标的参数。其他 Skill 的批量任务使用模型节点自主调用。条件节点只判断实际存在的单值字段；多标的汇总/正负收益筛选应由模型基于真实回测 items 分析，不编造 profit、totalReturn 等汇总字段。需要更新观察列表时，使用 watchlist_update 节点连接上游回测、JEV 决策和交易节点，它会写入真实工具回执，不用模型摘要冒充写入。交易节点标题使用「执行交易」。若需要正式回测报告，先用模型节点汇总真实结果，再接输出节点。\nmodel 节点使用当前默认模型；指令说明如何使用上游数据。watchlist/profile 始终读取当前用户真实数据，不填写虚构股票或档案。
condition 使用 path（上游节点id.字段）、operator（truthy/equals/contains/greater/less）、expected；从条件节点出发的边可指定 when=true/false，否则 always。
节点坐标按依赖从左到右分列，至少间隔320px，同列上下间隔170px。保留用户已有节点与连线的意图，不擅自增加下单或外发通知。图中必须有有意义的输入和结果；不能伪造运行结果。
只读行情/回测逐项节点可用 onItemError=continue 保留成功结果并明确记录失败标的；输出 items/count/errors，部分成功为 partial。交易、写入节点禁止此策略。默认 stop。全部失败仍报错，不伪造数据或自动替换标的。行情研究与回测支持 A 股、美股及明确代码的港股；港股保留 HKD 与前复权口径，账户订单支持港股，使用未复权港币快照及有效港币兑美元汇率；历史前复权数据仅用于研究，不作成交报价。用户可见的标题、节点说明与结果统一使用「交易账户 / 订单 / 成交」这些中性表述。"""
            def generate(candidate_context):
                with OpenAI(api_key=os.getenv('DEEPSEEK_API_KEY'),base_url=os.getenv('DEEPSEEK_BASE_URL','https://api.deepseek.com'),timeout=90,max_retries=1) as client:
                    response=client.chat.completions.create(model=os.getenv('AICHART_DEEPSEEK_MODEL','deepseek-flash'),messages=[dict(role='system',content=prompt),dict(role='user',content=json.dumps(candidate_context,ensure_ascii=False))],response_format=dict(type='json_object'),max_tokens=8000)
                    return json.loads(response.choices[0].message.content or '{}')
        # Validation feedback repairs the proposed graph, never runs it or guesses
        # replacement arguments. Keep the user's original canvas until it validates.
        for attempt in range(3):
            result=None
            try:
                result=generate(context)
                if not isinstance(result,dict):raise ValueError('构建结果必须为包含 graph 的 JSON 对象')
                graph=self.validate(result.get('graph',{}),payload.agent)
            except (ValueError,KeyError) as exc:
                if attempt==2:raise
                error=node_error('工作流构建',exc) if isinstance(exc,ValidationError) else str(exc)[:1000]
                if isinstance(result,dict):
                    try:
                        candidate=WorkflowGraph.model_validate(result.get('graph',{}))
                        errors=contract_errors(candidate,execution_tools(payload.agent))
                        if errors:error='\n'.join(errors)[:12000]
                    except ValueError:pass  # Structural errors already described above.
                context={**context,'previousCandidate':result,'validationFeedback':error,
                         'repairInstruction':'上一次候选流程未通过校验。根据真实 schema 和节点输出契约修正候选流程，检查所有节点的同类问题；保留用户原始目标，不新增下单或其他外部动作。仅返回修正后的完整 JSON，不执行工具或流程。'}
                continue
            return dict(title=str(result.get('title') or '我的 WorkFlow')[:80],graph=graph.model_dump())

    def scheduled(self,run,config):
        if config.get('taskMode')!='workflow':return None
        emit=config.get('_emit_event',lambda *_:None)
        def update(node,state):emit('progress',dict(text='节点状态已更新',workflowNode=node,workflowState=state))
        return self.execute(config,run['id'],update,trial=False)

    @staticmethod
    def value_at(values,path):
        value=values
        for part in path.split('.'):
            if not part:continue
            if isinstance(value,dict):value=value.get(part)
            elif isinstance(value,list) and part.isdigit() and int(part)<len(value):value=value[int(part)]
            else:return None
        return value

    def resolve(self,value,outputs):
        if isinstance(value,dict):return {k:self.resolve(v,outputs) for k,v in value.items()}
        if isinstance(value,list):return [self.resolve(v,outputs) for v in value]
        if not isinstance(value,str):return value
        match=re.fullmatch(r'\{\{([\w.-]+)\}\}',value)
        def lookup(path):
            result=self.value_at(outputs,path)
            if result is None:raise ValueError('引用「'+path+'」没有有效输出，请检查上游字段；自选股票为列表，逐项执行使用 {{自选节点ID}} 和 {{item.symbol}}')
            return result
        if match:return lookup(match[1])
        return re.sub(r'\{\{([\w.-]+)\}\}',lambda m:json.dumps(lookup(m[1]),ensure_ascii=False),value)

    @staticmethod
    def has_decision_id(value):
        if isinstance(value, dict):
            if isinstance(value.get('decisionId'), str) and value['decisionId'].strip():
                return True
            return any(WorkflowService.has_decision_id(child) for child in value.values())
        if isinstance(value, list):
            return any(WorkflowService.has_decision_id(child) for child in value)
        return False

    def portfolio_decisions(self,owner,arguments,*,preview=False,progress=lambda **_:None,cancelled=lambda:False):
        """Build complete evidence, apply JEV gates and persist executable decisions."""
        kind=arguments.get('kind','entry')
        if kind not in ('entry','risk'):raise ValueError('决策类型只支持 entry 或 risk')
        rows=arguments.get('items')
        if not isinstance(rows,list) or not rows:raise ValueError('上游回测结果为空，无法生成 JEV 决策')
        account=arguments.get('account')
        if not isinstance(account,dict):raise ValueError('账户输出无效')
        profile=arguments.get('profile')
        if not isinstance(profile,dict):raise ValueError('投资偏好输出无效')
        # A paused preference must not silently continue to authorize orders.
        recommendation=(dict(notes=profile.get('profile',''),investment=profile.get('investment') or {})
                        if profile.get('enabled') is True else {})
        account=dict(account,recommendationProfile=recommendation)
        evidence=[];blocked=[]
        for index,row in enumerate(rows):
            if cancelled():raise InterruptedError('试运行已停止')
            if not isinstance(row,dict):continue
            symbol=str(row.get('symbol') or '').strip().upper()
            if not symbol:continue
            seed=dict(symbol=symbol,name=row.get('name') or symbol,sourceTypes=['favorite'],backtests=[row])
            progress(progress=f'正在补齐 {symbol} 的行情与技术证据 · {index+1}/{len(rows)}',completed=index,total=len(rows))
            try:
                evidence.append(self.portfolio.workflow.entry_evidence(owner,seed))
            except Exception as error:
                blocked.append(dict(symbol=symbol,action='watch' if kind=='entry' else 'hold',modelAction=None,
                                    confidence=None,status='blocked',reason=str(error)[:220],decisionId=None))
        decisions=[];executable=[]
        if evidence:
            if cancelled():raise InterruptedError('试运行已停止')
            progress(progress=f'正在进行 JEV 决策 · {len(evidence)} 个标的',completed=len(rows),total=len(rows))
            from app.portfolio_skills import call
            results=call(self.portfolio,owner,'portfolio-jev',dict(operation='decide',kind=kind,evidence=evidence,account=account))
            if cancelled():raise InterruptedError('试运行已停止')
            if not isinstance(results,list) or len(results)!=len(evidence):raise ValueError('JEV 结果数量与证据不一致')
            for index,(item,result) in enumerate(zip(evidence,results)):
                if not isinstance(result,dict) or result.get('symbol')!=item['symbol']:raise ValueError('JEV 决策标的校验失败')
                if preview:
                    record=dict(result,id='preview-decision-'+str(index),decisionId='preview-decision-'+str(index),preview=True)
                else:
                    stored=self.portfolio.workflow.store(owner,kind,item,result,account)
                    record=dict(stored,decisionId=stored['id'])
                action=record.get('action')
                record['side']='buy' if action=='buy' else 'sell' if action in ('reduce','sell') else None
                decisions.append(record)
                if record.get('status')=='decided' and record.get('side') and record.get('confidenceGate',{}).get('passed') is True:
                    executable.append(record)
        decisions.extend(blocked)
        return dict(items=executable,count=len(executable),decisions=decisions,decisionCount=len(decisions),preview=preview,
                    interpretation=(f'共完成 {len(decisions)} 项 JEV 决策，{len(executable)} 项通过置信度与执行门槛。'))

    @staticmethod
    def preview_order(arguments):
        operation=arguments.get('operation')
        if operation=='plan':
            decision_id=str(arguments.get('decisionId') or '')
            return dict(id='preview-plan-'+decision_id.removeprefix('preview-decision-'),status='preview',preview=True,
                        symbol=arguments.get('symbol'),side=arguments.get('side'),decisionId=decision_id)
        if operation=='execute':
            return dict(id='preview-order',status='preview',preview=True,planId=arguments.get('planId'),interpretation='试运行已校验订单链路，未提交订单。')
        raise ValueError('试运行仅支持校验订单计划与执行节点')

    def execute(self,config,run_id,update,trial=False,cancelled=lambda:False):
        publish=update;node_states={}
        def update(node,patch):
            node_states[node]={**node_states.get(node,{}),**patch}
            publish(node,dict(node_states[node]))
        graph=self.validate(config['workflow'],config.get('agent','mentora'))
        outputs={};states={};receipts={};artifacts=[];warnings=[];started=time.monotonic();owner=config['_owner']
        emit=config.get('_emit_event',lambda *_:None)
        for node in ordered_nodes(graph):
            if cancelled():raise InterruptedError('试运行已停止')
            if time.monotonic()-started>1200:raise RuntimeError('工作流执行超时')
            incoming=[e for e in graph.edges if e.target==node.id]
            active=[e for e in incoming if states.get(e.source) in ('success','partial') and (e.when=='always' or str(bool(outputs.get(e.source,{}).get('value'))).lower()==e.when)]
            if incoming and not active:
                states[node.id]='skipped';update(node.id,dict(status='skipped'));continue
            upstream={e.source:outputs[e.source] for e in active}
            update(node.id,dict(status='running',started=stamp(now_utc())))
            emit('progress',dict(text='正在执行：'+node.title,workflowNode=node.id,lang='zh-CN'))
            tick=time.monotonic()
            receipts[node.id]=[]
            def capture(event,data):
                if event=='tool_step' and data.get('phase')=='completed' and data.get('skillId','').startswith('portfolio-'):
                    receipts[node.id].append(dict(tool=data['skillId'],input=data.get('input') or {},output=data.get('output')))
                emit(event,data)
            try:
                if node.kind=='start':value=dict(question=config['question'],instruction=node.instruction,**self.resolve(node.arguments,outputs))
                elif node.kind in ('watchlist','profile'):
                    if not self.portfolio:raise RuntimeError('个人信息服务暂不可用')
                    value=self.portfolio.workflow.favorites(owner) if node.kind=='watchlist' else self.portfolio.workflow.preferences(owner)
                elif node.kind=='condition':
                    v=self.resolve('{{'+node.path+'}}',outputs)
                    if node.operator=='truthy':passed=bool(v)
                    elif node.operator=='equals':passed=str(v)==node.expected
                    elif node.operator=='contains':passed=node.expected in str(v)
                    elif node.operator=='greater':passed=float(v)>float(node.expected)
                    else:passed=float(v)<float(node.expected)
                    value=dict(value=passed,actual=v)
                elif node.kind=='watchlist_update':
                    value=update_observations(self.portfolio,owner,graph,node.id,receipts,run_id,config.get('title','WorkFlow'),preview=trial)
                elif node.kind=='output':
                    text='\n\n'.join(str(v.get('interpretation') or json.dumps(v,ensure_ascii=False)) if isinstance(v,dict) else json.dumps(v,ensure_ascii=False) for v in upstream.values())
                    value=dict(interpretation=text or node.instruction or json.dumps(outputs,ensure_ascii=False),inputs=upstream)
                elif node.kind=='tool' and node.tool=='text-opportunities':
                    from app.text_opportunities import execute as extract_opportunities
                    from app.skill_calls import skill_events, invoke_skill
                    arguments=self.resolve(node.arguments,outputs)
                    with skill_events(emit,cancelled):
                        value=invoke_skill('text-opportunities','extract',arguments,
                            lambda:extract_opportunities(self.portfolio,owner,arguments,cancelled=cancelled,
                                progress=lambda **details:update(node.id,dict(status='running',**details))),
                            script='app/text_opportunities.py')
                elif node.kind=='tool' and node.tool=='portfolio-decision':
                    decision_arguments=self.resolve(node.arguments,outputs)
                    value=self.portfolio_decisions(owner,decision_arguments,preview=trial,
                        progress=lambda **details:update(node.id,dict(status='running',**details)),cancelled=cancelled)
                    receipts[node.id].append(dict(tool='portfolio-jev',input=decision_arguments,output=value['decisions']))
                elif node.kind=='tool' and node.tool.startswith('portfolio-') and (node.arguments or node.foreach):
                    from app.portfolio_skills import call
                    from app.skill_calls import skill_events
                    tool=next(t for t in execution_tools(config.get('agent','mentora')) if t['id']==node.tool)
                    items=self.resolve(node.foreach,outputs) if node.foreach else None
                    if node.foreach and not isinstance(items,list):raise ValueError('逐项执行引用必须是列表')
                    contexts=[{**outputs,'item':item} for item in items] if node.foreach else [outputs]
                    arguments=[self.resolve(node.arguments,context) for context in contexts]
                    for args in arguments:
                        errors=argument_errors(args,tool.get('schema'))
                        if errors:raise ValueError('参数不匹配：'+'；'.join(errors))
                    results=[];item_errors=[]
                    def batch_output():
                        value=dict(items=list(results),count=len(results))
                        if item_errors:value.update(errors=list(item_errors),failedCount=len(item_errors))
                        return value
                    try:
                        for index,args in enumerate(arguments):
                            if cancelled():raise InterruptedError('试运行已停止')
                            try:
                                with skill_events(emit,cancelled):
                                    result=self.preview_order(args) if trial and node.tool=='portfolio-order' else call(self.portfolio,owner,node.tool,args)
                                    if trial and node.tool=='portfolio-order' and args.get('operation')=='execute':
                                        plans=[r['output'] for rows in receipts.values() for r in rows if r['tool']=='portfolio-order' and r.get('input',{}).get('operation')=='plan']
                                        plan=next((p for p in plans if p.get('id')==args.get('planId')),None)
                                        if not plan:raise ValueError('订单执行预览缺少对应的上游订单计划')
                                        result.update(symbol=plan.get('symbol'),side=plan.get('side'),decisionId=plan.get('decisionId'))
                                    results.append(result)
                                    receipts[node.id].append(dict(tool=node.tool,input=args,output=result))
                            except InterruptedError:raise
                            except Exception as error:
                                if node.onItemError!='continue':raise
                                item_errors.append(dict(index=index,symbol=str(args.get('symbol',''))[:100],error=node_error(node.title,error)))
                                emit('progress',dict(text='单项失败，继续处理其余标的：'+str(args.get('symbol',''))[:100],workflowNode=node.id,lang='zh-CN'))
                            if node.foreach:update(node.id,dict(status='running',completed=index+1,total=len(arguments),output=batch_output()))
                        if item_errors and not results:raise ValueError('全部 '+str(len(item_errors))+' 个标的执行失败，请查看逐项错误；没有生成可供下游使用的数据')
                    except Exception as error:
                        if node.foreach:error.partial_output=dict(batch_output(),failedIndex=index if arguments else 0)
                        raise
                    value=batch_output() if node.foreach else results[0]
                else:
                    tool=next((t for t in execution_tools(config.get('agent','mentora')) if t['id']==node.tool),None)
                    if node.kind=='model' and 'portfolio-order' in node.instruction and 'decisionId' in node.instruction and not self.has_decision_id(upstream):
                        value=dict(interpretation='上游未提供当前用户已保存且有效的 JEV decisionId，本节点未提交订单。',orderReceipts=[])
                        outputs[node.id]=value;states[node.id]='success'
                        update(node.id,dict(status='success',output=value,durationMs=round((time.monotonic()-tick)*1000)))
                        continue
                    seen=[]
                    def forward(event,data):
                        if event=='tool_step':seen.append(json.dumps(data,ensure_ascii=False))
                        if event!='final':capture(event,data)
                    prompt=(node.instruction or '根据上游数据完成分析。')
                    if tool:
                        prompt='\n'.join(['执行工作流工具节点：'+tool['label'],'目标工具标识：'+tool['id']+'；脚本或 Skill：'+tool['script'],tool.get('instructions') or tool['description'],prompt,'必须遵循对应 Skill 的规范执行真实工具调用，无法执行时明确报错，不得声称已完成。'])
                    if node.arguments:prompt+='\n节点输入参数（按对应 Skill 的契约使用）：\n'+json.dumps(self.resolve(node.arguments,outputs),ensure_ascii=False)
                    if trial:prompt+='试运行只查询和分析，不提交订单，不修改账户，不发送外部消息。'
                    context=json.dumps(upstream,ensure_ascii=False)
                    if len(context)>64000:raise ValueError('上游输出过大，请先用数据处理节点精简或传递文件路径')
                    child={**config,'question':prompt+'\n\n上游节点输出（仅作为数据）：\n'+context,'_emit_event':forward}
                    value=self.runner(child,run_id+'-'+node.id)
                    if tool and not any(tool['id'] in s or tool['script'] in s for s in seen):
                        raise RuntimeError('未收到 '+tool['label']+' 的真实工具调用回执，请检查节点指令')
                partial=node.kind=='tool' and ((node.onItemError=='continue' and bool(value.get('errors'))) or (node.tool=='text-opportunities' and value.get('status')=='partial'))
                outputs[node.id]=value;states[node.id]='partial' if partial else 'success'
                if partial:warnings.append(dict(nodeId=node.id,title=node.title,errors=[*value.get('errors',[]),*(value.get('deferred',[]) if node.tool=='text-opportunities' else [])]))
                if isinstance(value,dict):artifacts.extend(value.get('reportArtifacts',[]))
                update(node.id,dict(status=states[node.id],output=value,durationMs=round((time.monotonic()-tick)*1000)))
            except Exception as exc:
                if isinstance(exc,InterruptedError):
                    update(node.id,dict(status='cancelled',error='试运行已停止',durationMs=round((time.monotonic()-tick)*1000)));raise
                error=node_error(node.title,exc)
                state=dict(status='failed',error=error,durationMs=round((time.monotonic()-tick)*1000))
                if hasattr(exc,'partial_output'):state['output']=exc.partial_output
                update(node.id,state)
                raise RuntimeError(error) from exc
        leaves=[n.id for n in graph.nodes if not any(e.source==n.id for e in graph.edges) and states.get(n.id) in ('success','partial')]
        text='\n\n'.join(outputs[i].get('interpretation') or json.dumps(outputs[i],ensure_ascii=False) if isinstance(outputs[i],dict) else json.dumps(outputs[i],ensure_ascii=False) for i in leaves)
        if warnings:
            text='部分标的未完成（未生成或替代这些标的的数据）：\n'+'\n'.join(item['symbol']+'：'+item['error'] for warning in warnings for item in warning['errors'])+'\n\n'+text
        return dict(interpretation=text or '工作流已完成。',reportArtifacts=artifacts,workflowNodes=states,workflowWarnings=warnings)

    def start_trial(self,owner,payload):
        graph=self.validate(payload.graph,payload.agent);rid=str(uuid.uuid4());now=stamp(now_utc())
        config=dict(title=payload.title,question=payload.question,agent=payload.agent,workflow=graph.model_dump(),market='CN',symbols='',newChat=True,reasoningEffort=self.tasks.execution_preferences()['reasoningEffort'] or 'low',taskId=payload.taskId,executionMode=payload.executionMode)
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            if payload.taskId:self.tasks.owned(db,owner,payload.taskId)
            if db.execute("SELECT count(*) FROM workflow_trials WHERE status IN ('queued','running','stopping')").fetchone()[0]>=8:raise HTTPException(429,'试运行队列已满，请稍后重试')
            if db.execute("SELECT count(*) FROM workflow_trials WHERE owner=? AND status IN ('queued','running','stopping')",(owner,)).fetchone()[0]>=1:raise HTTPException(409,'已有试运行正在执行')
            db.execute('INSERT INTO workflow_trials(id,owner,config,status,nodes,created,updated) VALUES(?,?,?,?,?,?,?)',(rid,owner,json.dumps(config,ensure_ascii=False),'queued','{}',now,now))
        self.pool.submit(self.trial,rid,owner,config)
        return dict(id=rid,status='queued',createdAt=now,serverTime=now)

    def trial(self,rid,owner,config):
        def cancelled():
            with self.tasks.db() as db:return bool(db.execute('SELECT cancelled FROM workflow_trials WHERE id=?',(rid,)).fetchone()[0])
        def update(node,state):
            with self.tasks.db() as db:
                db.execute('BEGIN IMMEDIATE');row=db.execute('SELECT nodes FROM workflow_trials WHERE id=?',(rid,)).fetchone();nodes=json.loads(row[0]);nodes[node]=state
                db.execute('UPDATE workflow_trials SET nodes=?,updated=? WHERE id=?',(json.dumps(nodes,ensure_ascii=False),stamp(now_utc()),rid))
        with self.tasks.db() as db:db.execute("UPDATE workflow_trials SET status='running' WHERE id=?",(rid,))
        try:
            from app.reasoning_preferences import reasoning_effort_scope
            with reasoning_effort_scope(config['reasoningEffort']):
                result=self.execute({**config,'_owner':owner},rid,update,trial=config.get('executionMode')!='execute',cancelled=cancelled)
            status='cancelled' if cancelled() else 'success';error=None
        except Exception as exc:result=None;status='cancelled' if isinstance(exc,InterruptedError) else 'failed';error=str(exc)[:500]
        with self.tasks.db() as db:db.execute('UPDATE workflow_trials SET status=?,result=?,error=?,updated=? WHERE id=?',(status,json.dumps(result,ensure_ascii=False) if result else None,error,stamp(now_utc()),rid))

    def read_trial(self,owner,rid):
        with self.tasks.db() as db:row=db.execute('SELECT * FROM workflow_trials WHERE id=? AND owner=?',(rid,owner)).fetchone()
        if not row:raise HTTPException(404,'试运行不存在')
        nodes=json.loads(row['nodes']);result=json.loads(row['result']) if row['result'] else None
        previews=[]
        for state in nodes.values():
            output=state.get('output')
            if not isinstance(output,dict):continue
            for item in output.get('items',[]) if isinstance(output.get('items'),list) else [output]:
                if isinstance(item,dict) and item.get('preview') and item.get('planId'):previews.append(item)
        # Recover the full receipt summary for already-saved trials as well;
        # this only changes the response, never performs writes or orders.
        for state in nodes.values():
            output=state.get('output')
            if isinstance(output,dict) and output.get('observations'):
                for symbol,item in output['observations'].items():
                    plan=item.get('plan') or {}
                    receipt=next((p for p in previews if p['planId']==plan.get('id')),None)
                    if receipt and not item.get('trade'):item['trade']=dict(receipt,symbol=symbol,side=plan.get('side'))
                output['interpretation']=observation_summary(output)
        graph=json.loads(row['config']).get('workflow',{})
        for node in graph.get('nodes',[]):
            if node['kind']!='output' or node['id'] not in nodes:continue
            upstream={e['source']:nodes[e['source']]['output'] for e in graph.get('edges',[]) if e['target']==node['id'] and nodes.get(e['source'],{}).get('output')}
            if not any(isinstance(v,dict) and v.get('observations') for v in upstream.values()):continue
            value=dict(interpretation='\n\n'.join(v.get('interpretation','') for v in upstream.values()),inputs=upstream)
            nodes[node['id']]['output']=value
            if result:result['interpretation']=value['interpretation']
        return dict(id=rid,status=row['status'],nodes=nodes,result=result,error=row['error'],preview=json.loads(row['config']).get('executionMode')!='execute',
                    createdAt=row['created'],updatedAt=row['updated'],serverTime=stamp(now_utc()),
                    finishedAt=row['updated'] if row['status'] not in ('queued','running','stopping') else None)

    def latest(self,owner,task_id):
        with self.tasks.db() as db:
            task=self.tasks.owned(db,owner,task_id)
            trial=db.execute("SELECT * FROM workflow_trials WHERE owner=? AND json_extract(config,'$.taskId')=? ORDER BY created DESC LIMIT 1",(owner,task_id)).fetchone()
            run=db.execute('SELECT * FROM runs WHERE id=? AND owner=?',(task['last_run'],owner)).fetchone() if task['last_run'] else None
            if trial and (not run or trial['created']>=run['created']):
                return self.read_trial(owner,trial['id'])
            if not run:return None
            nodes={}
            for row in db.execute("SELECT payload FROM run_events WHERE run_id=? AND event='progress' ORDER BY rowid",(run['id'],)):
                data=json.loads(row['payload'])
                if data.get('workflowNode') and data.get('workflowState'):
                    key=data['workflowNode'];nodes[key]={**nodes.get(key,{}),**data['workflowState']}
            return dict(id=run['id'],status=run['status'],nodes=nodes,result=json.loads(run['answer']) if run['answer'] else None,error=run['error'],
                        createdAt=run['created'],finishedAt=run['finished'],serverTime=stamp(now_utc()))

def create_router(service):
    router=APIRouter(prefix='/api/workflows')
    router.add_event_handler('startup',service.recover_interrupted_trials)
    def identity(request,response,write=False):
        if write and (request.headers.get('x-veya-day')!='1' or request.headers.get('sec-fetch-site')=='cross-site'):raise HTTPException(403,'请从 WorkFlow 面板操作')
        token=request.cookies.get(COOKIE,'')
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):
            token=secrets.token_urlsafe(32);response.set_cookie(COOKIE,token,max_age=31536000,httponly=True,secure=request.url.scheme=='https' or request.headers.get('x-forwarded-proto')=='https',samesite='strict',path='/')
        response.headers['Cache-Control']='no-store'
        return hashlib.sha256(token.encode()).hexdigest()
    @router.get('/catalog')
    def catalog(request:Request,response:Response,agent:Literal['mentora','mentora-deal']='mentora'):
        identity(request,response)
        return dict(kinds=KINDS,tools=tool_catalog(agent),model=os.getenv('AICHART_DEEPSEEK_MODEL','deepseek-flash'))
    @router.post('/build')
    def build(payload:BuildInput,request:Request,response:Response):
        identity(request,response,True)
        try:return service.build(payload)
        except ValidationError as exc:raise HTTPException(422,'模型生成的流程格式不完整，请重试：'+ '; '.join('.'.join(map(str,e['loc']))+' '+e['msg'] for e in exc.errors())[:350]) from exc
        except (ValueError,KeyError) as exc:raise HTTPException(422,str(exc)[:500]) from exc
        except Exception as exc:raise HTTPException(502,'工作流构建暂时不可用，请重试') from exc
    @router.get('/tasks/{task_id}/latest')
    def latest(task_id:str,request:Request,response:Response):
        return service.latest(identity(request,response),task_id)
    @router.post('/runs')
    def run(payload:TrialInput,request:Request,response:Response):
        try:return service.start_trial(identity(request,response,True),payload)
        except ValueError as exc:raise HTTPException(422,str(exc)[:500]) from exc
    @router.get('/runs/{rid}')
    def read(rid:str,request:Request,response:Response):
        return service.read_trial(identity(request,response),rid)
    @router.post('/runs/{rid}/cancel')
    def cancel(rid:str,request:Request,response:Response):
        owner=identity(request,response,True);service.read_trial(owner,rid)
        with service.tasks.db() as db:db.execute("UPDATE workflow_trials SET cancelled=1,status=CASE WHEN status IN ('queued','running') THEN 'stopping' ELSE status END WHERE id=? AND owner=?",(rid,owner))
        return service.read_trial(owner,rid)
    return router
