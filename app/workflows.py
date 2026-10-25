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
from app.workflow_observations import update_observations
from app.workflow_graph import WorkflowGraph, ordered_nodes
from app.workflow_contracts import validate_contracts, argument_errors, node_error
from app.day_tasks import COOKIE, TaskInput, now_utc, stamp

ROOT=Path(__file__).resolve().parents[1]
KINDS=[
    dict(id='start',label='流程输入',description='输入本次执行的目标或基础数据。'),
    dict(id='watchlist',label='自选股票',description='每次运行读取个人信息中的最新自选股票。'),
    dict(id='profile',label='投资者档案',description='读取当前用户的投资偏好与约束。'),
    dict(id='model',label='模型',description='使用当前默认模型分析上游输入，保留现有 Agent 能力。'),
    dict(id='condition',label='条件分支',description='按上游数据决定后续分支。'),
    dict(id='watchlist_update',label='更新观察列表',description='将上游实际回测、JEV 决策与交易结果保存到当前用户的观察列表；试运行仅预览。'),
    dict(id='output',label='输出结果',description='汇总上游节点的真实输出。'),
]

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
    return list({row['id']:row for row in result}.values())

def execution_tools(agent):
    return list({row['id']:row for row in legacy_tool_catalog(agent)+tool_catalog(agent)}.values())

class TrialInput(BaseModel):
    graph: WorkflowGraph
    agent: Literal['mentora','mentora-deal']='mentora'
    title: str=Field(default='WorkFlow 试运行',max_length=80)
    question: str=Field(default='',max_length=6000)
    taskId: str | None=Field(default=None,max_length=80)

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
            cutoff=stamp(now_utc()-dt.timedelta(hours=2))
            db.execute("UPDATE workflow_trials SET status='failed',error='试运行已中断，请重试' WHERE status IN ('queued','running','stopping') AND updated<?",(cutoff,))
        tasks.run_handlers.insert(0,self.scheduled)

    def validate(self,graph,agent):
        graph=WorkflowGraph.model_validate(graph)
        allowed={t['id'] for t in execution_tools(agent)}
        for node in graph.nodes:
            if node.kind=='tool' and node.tool not in allowed:raise ValueError('请选择当前 Agent 支持的工具：'+node.title)
        return validate_contracts(graph,execution_tools(agent))

    def build(self,payload):
        tools=tool_catalog(payload.agent)
        context=dict(message=payload.message,currentGraph=payload.graph.model_dump() if payload.graph else None,agent=payload.agent,
                     nodeKinds=KINDS,graphSchema=WorkflowGraph.model_json_schema(),nodeOutputs={'watchlist_update':'保存上游真实工具结果至观察列表；返回 symbols、updatedCount、preview 和 interpretation。试运行 preview=true 不写入。','watchlist':'数组，每项含 symbol/name 等实际字段。{{节点ID}} 是整个列表，{{节点ID.0.symbol}} 是第一项代码；没有 symbols/stocks 属性。','profile':'对象，含 profile/investment/enabled/updated。','tool':'单次调用输出该 Skill 的真实结果；设置 foreach 时输出 {items:[每次真实结果],count:数量}。','model':'对象，主要含 interpretation 文本及 reportArtifacts，不会自动产生任意结构化字段。','output':'仅汇总已有输出，不执行分析、筛选、计算或报告生成；这些任务需先经过工具或模型节点。'},tools=[{k:t.get(k) for k in ('id','label','description','schema','instructions')} for t in tools])
        if self.builder:generate=self.builder
        else:
            from openai import OpenAI
            prompt="""你是 Mentora WorkFlow 构建助手。根据用户要求创建或修改可执行的 DAG，不执行流程。
输出 JSON {"title":"简短中文名称","graph":{"version":1,"nodes":[...],"edges":[...]}}。
严格遵循 graphSchema。连线字段必须为 source（起点节点id）、target（终点节点id）、when（字符串always/true/false）；禁止使用from/to。\n节点字段 id,kind,title,x,y,instruction,tool,arguments,foreach,path,operator,expected。
kind 仅可为 start/watchlist/profile/tool/model/condition/output/watchlist_update。工具必须使用目录中的真实 id。
每个 tool 节点使用 instruction 清楚描述该工具的任务、输入和期望输出；Mentora Deal 工具可通过 arguments 指定其合法 JSON 参数，参数中的 {{节点id.字段}} 引用上游输出，必须连线。
必须遵循每个工具的 schema，禁止猜测参数名、operation 或输出字段。portfolio-data 历史行情使用 operation=history 和单个 symbol，不支持 action=ohlcv 或 symbols。\n对自选列表等多个标的，结构化交易工具节点设置 foreach={{自选节点ID}}，arguments.symbol={{item.symbol}}；执行器会逐项调用，并输出 items 数组。下游逐项工具可用 foreach={{上游工具ID.items}}，不能把列表直接传给单标的参数。其他 Skill 的批量任务使用模型节点自主调用。条件节点只判断实际存在的单值字段；多标的汇总/正负收益筛选应由模型基于真实回测 items 分析，不编造 profit、totalReturn 等汇总字段。需要更新观察列表时，使用 watchlist_update 节点连接上游回测、JEV 决策和交易节点，它会写入真实工具回执，不用模型摘要冒充写入。交易节点标题使用「执行交易」。若需要正式回测报告，先用模型节点汇总真实结果，再接输出节点。\nmodel 节点使用当前默认模型；指令说明如何使用上游数据。watchlist/profile 始终读取当前用户真实数据，不填写虚构股票或档案。
condition 使用 path（上游节点id.字段）、operator（truthy/equals/contains/greater/less）、expected；从条件节点出发的边可指定 when=true/false，否则 always。
节点坐标按依赖从左到右分列，至少间隔320px，同列上下间隔170px。保留用户已有节点与连线的意图，不擅自增加下单或外发通知。图中必须有有意义的输入和结果；不能伪造运行结果。"""
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

    def execute(self,config,run_id,update,trial=False,cancelled=lambda:False):
        graph=self.validate(config['workflow'],config.get('agent','mentora'))
        outputs={};states={};receipts={};artifacts=[];started=time.monotonic();owner=config['_owner']
        emit=config.get('_emit_event',lambda *_:None)
        for node in ordered_nodes(graph):
            if cancelled():raise InterruptedError('试运行已停止')
            if time.monotonic()-started>1200:raise RuntimeError('工作流执行超时')
            incoming=[e for e in graph.edges if e.target==node.id]
            active=[e for e in incoming if states.get(e.source)=='success' and (e.when=='always' or str(bool(outputs.get(e.source,{}).get('value'))).lower()==e.when)]
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
                if trial and node.kind=='tool' and node.tool=='portfolio-order':raise RuntimeError('试运行不提交订单；请先验证研究和决策节点')
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
                    value=dict(interpretation=text or node.instruction or json.dumps(outputs,ensure_ascii=False))
                elif node.kind=='tool' and node.tool.startswith('portfolio-') and (node.arguments or node.foreach):
                    if trial and node.tool=='portfolio-order':raise RuntimeError('试运行不提交订单；请先验证研究和决策节点')
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
                    results=[]
                    try:
                        for index,args in enumerate(arguments):
                            if cancelled():raise InterruptedError('试运行已停止')
                            with skill_events(emit,cancelled):
                                result=call(self.portfolio,owner,node.tool,args)
                                results.append(result)
                                receipts[node.id].append(dict(tool=node.tool,input=args,output=result))
                            if node.foreach:update(node.id,dict(status='running',completed=index+1,total=len(arguments),output=dict(items=list(results),count=len(results))))
                    except Exception as error:
                        if node.foreach:error.partial_output=dict(items=results,count=len(results),failedIndex=len(results))
                        raise
                    value=dict(items=results,count=len(results)) if node.foreach else results[0]
                else:
                    tool=next((t for t in execution_tools(config.get('agent','mentora')) if t['id']==node.tool),None)
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
                outputs[node.id]=value;states[node.id]='success'
                if isinstance(value,dict):artifacts.extend(value.get('reportArtifacts',[]))
                update(node.id,dict(status='success',output=value,durationMs=round((time.monotonic()-tick)*1000)))
            except Exception as exc:
                if isinstance(exc,InterruptedError):
                    update(node.id,dict(status='cancelled',error='试运行已停止'));raise
                error=node_error(node.title,exc)
                state=dict(status='failed',error=error)
                if hasattr(exc,'partial_output'):state['output']=exc.partial_output
                update(node.id,state)
                raise RuntimeError(error) from exc
        leaves=[n.id for n in graph.nodes if not any(e.source==n.id for e in graph.edges) and states.get(n.id)=='success']
        text='\n\n'.join(outputs[i].get('interpretation') or json.dumps(outputs[i],ensure_ascii=False) if isinstance(outputs[i],dict) else json.dumps(outputs[i],ensure_ascii=False) for i in leaves)
        return dict(interpretation=text or '工作流已完成。',reportArtifacts=artifacts,workflowNodes=states)

    def start_trial(self,owner,payload):
        graph=self.validate(payload.graph,payload.agent);rid=str(uuid.uuid4());now=stamp(now_utc())
        config=dict(title=payload.title,question=payload.question,agent=payload.agent,workflow=graph.model_dump(),market='CN',symbols='',newChat=True,reasoningEffort=self.tasks.execution_preferences()['reasoningEffort'] or 'low',taskId=payload.taskId)
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            if payload.taskId:self.tasks.owned(db,owner,payload.taskId)
            if db.execute("SELECT count(*) FROM workflow_trials WHERE status IN ('queued','running','stopping')").fetchone()[0]>=8:raise HTTPException(429,'试运行队列已满，请稍后重试')
            if db.execute("SELECT count(*) FROM workflow_trials WHERE owner=? AND status IN ('queued','running','stopping')",(owner,)).fetchone()[0]>=1:raise HTTPException(409,'已有试运行正在执行')
            db.execute('INSERT INTO workflow_trials(id,owner,config,status,nodes,created,updated) VALUES(?,?,?,?,?,?,?)',(rid,owner,json.dumps(config,ensure_ascii=False),'queued','{}',now,now))
        self.pool.submit(self.trial,rid,owner,config)
        return dict(id=rid,status='queued')

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
                result=self.execute({**config,'_owner':owner},rid,update,trial=True,cancelled=cancelled)
            status='cancelled' if cancelled() else 'success';error=None
        except Exception as exc:result=None;status='cancelled' if isinstance(exc,InterruptedError) else 'failed';error=str(exc)[:500]
        with self.tasks.db() as db:db.execute('UPDATE workflow_trials SET status=?,result=?,error=?,updated=? WHERE id=?',(status,json.dumps(result,ensure_ascii=False) if result else None,error,stamp(now_utc()),rid))

    def read_trial(self,owner,rid):
        with self.tasks.db() as db:row=db.execute('SELECT * FROM workflow_trials WHERE id=? AND owner=?',(rid,owner)).fetchone()
        if not row:raise HTTPException(404,'试运行不存在')
        return dict(id=rid,status=row['status'],nodes=json.loads(row['nodes']),result=json.loads(row['result']) if row['result'] else None,error=row['error'])

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
                if data.get('workflowNode') and data.get('workflowState'):nodes[data['workflowNode']]=data['workflowState']
            return dict(id=run['id'],status=run['status'],nodes=nodes,result=json.loads(run['answer']) if run['answer'] else None,error=run['error'])

def create_router(service):
    router=APIRouter(prefix='/api/workflows')
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
