"""Validated, portable workflow graphs; no execution or owner data here."""
import json
from typing import Any, Literal
from pydantic import BaseModel, Field, model_validator


def neutralize_workflow_text(value: str) -> str:
    """Keep legacy account wording out of user-visible workflow copy."""
    text = value.replace('模拟账户', '交易账户')
    for phrase, replacement in (('模拟下单', '下单'), ('模拟交易', '交易'), ('模拟订单', '订单'), ('模拟成交', '成交'), ('模拟买入', '买入')):
        text = text.replace(phrase, replacement)
    return text.replace('模拟', '')

class WorkflowNode(BaseModel):
    id: str = Field(pattern=r'^[A-Za-z][A-Za-z0-9_-]{0,63}$')
    kind: Literal['start','watchlist','profile','tool','model','condition','output','watchlist_update']
    title: str = Field(min_length=1,max_length=100)
    x: float = Field(default=80,ge=-10000,le=10000,allow_inf_nan=False)
    y: float = Field(default=100,ge=-10000,le=10000,allow_inf_nan=False)
    instruction: str = Field(default='',max_length=8000)
    tool: str = Field(default='',max_length=120)
    arguments: dict[str,Any] = Field(default_factory=dict)
    foreach: str = Field(default='',max_length=300)
    onItemError: Literal['stop','continue'] = 'stop'
    path: str = Field(default='',max_length=200)
    operator: Literal['truthy','equals','contains','greater','less'] = 'truthy'
    expected: str = Field(default='',max_length=1000)

class WorkflowEdge(BaseModel):
    source: str
    target: str
    when: Literal['always','true','false'] = 'always'

class WorkflowGraph(BaseModel):
    version: Literal[1] = 1
    nodes: list[WorkflowNode] = Field(min_length=1,max_length=48)
    edges: list[WorkflowEdge] = Field(default_factory=list,max_length=192)

    @model_validator(mode='before')
    @classmethod
    def migrate_node_labels(cls,value):
        if not isinstance(value,dict):return value
        nodes=[]
        for raw in value.get('nodes',[]):
            if not isinstance(raw,dict):
                nodes.append(raw);continue
            node=dict(raw)
            for field in ('title', 'instruction'):
                if isinstance(node.get(field), str):
                    node[field] = neutralize_workflow_text(node[field])
            if node.get('kind')=='output' and node.get('title')=='输出回测决策与交易报告':
                node.update(kind='watchlist_update',title='更新观察列表',instruction='将上游真实回测、JEV 决策和交易回执更新到当前用户的观察列表。')
            nodes.append(node)
        return dict(value,nodes=nodes)

    @model_validator(mode='after')
    def validate_graph(self):
        if len(json.dumps(self.model_dump(),ensure_ascii=False))>256000:raise ValueError('工作流参数过大，请改用文件路径传递数据')
        ids=[n.id for n in self.nodes]
        if len(set(ids))!=len(ids):raise ValueError('节点 ID 不能重复')
        known=set(ids);seen=set();degree=dict.fromkeys(ids,0);out={i:[] for i in ids}
        for e in self.edges:
            if e.source not in known or e.target not in known:raise ValueError('连线引用了不存在的节点')
            if e.source==e.target or (e.source,e.target) in seen:raise ValueError('连线不能重复或连接自身')
            if e.when!='always' and next(n for n in self.nodes if n.id==e.source).kind!='condition':raise ValueError('只有条件节点可以使用分支连线')
            seen.add((e.source,e.target));degree[e.target]+=1;out[e.source].append(e.target)
        ready=[i for i in ids if not degree[i]];count=0
        while ready:
            i=ready.pop();count+=1
            for target in out[i]:
                degree[target]-=1
                if not degree[target]:ready.append(target)
        if count!=len(ids):raise ValueError('工作流存在循环，请调整连线')
        return self

def ordered_nodes(graph):
    pending=list(graph.nodes);done=set()
    while pending:
        for node in list(pending):
            if all(e.source in done for e in graph.edges if e.target==node.id):
                yield node;done.add(node.id);pending.remove(node)
