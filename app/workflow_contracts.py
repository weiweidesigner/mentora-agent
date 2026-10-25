"""Validate workflow wiring and Skill arguments without inventing data."""
import re
from jsonschema import Draft202012Validator, validators
from pydantic import ValidationError

REFERENCE=re.compile(r'\{\{([A-Za-z][\w.-]*)\}\}')
def _allow_reference(check):
    def validate(validator,value,instance,schema):
        if isinstance(instance,str) and REFERENCE.fullmatch(instance):return
        yield from check(validator,value,instance,schema)
    return validate
TemplateValidator=validators.extend(Draft202012Validator,{key:_allow_reference(check) for key,check in Draft202012Validator.VALIDATORS.items()})

def argument_errors(arguments,schema,templates=False):
    if not schema:return []
    errors=[]
    for e in (TemplateValidator if templates else Draft202012Validator)(schema).iter_errors(arguments):
        path='.'.join(map(str,e.absolute_path)) or 'arguments'
        if e.validator=='required':message='缺少必填字段 '+', '.join(k for k in e.validator_value if k not in e.instance)
        elif e.validator=='additionalProperties':message='不支持字段 '+', '.join(str(k) for k in e.instance if k not in e.schema.get('properties',{}))
        elif e.validator=='enum':message=path+' 只支持 '+', '.join(map(str,e.validator_value))
        elif e.validator=='type':message=path+' 类型应为 '+str(e.validator_value)
        else:message=path+' 不符合工具格式：'+str(e.message)[:140]
        if message not in errors:errors.append(message)
    return errors[:6]

def node_error(title,error):
    if isinstance(error,ValidationError):
        parts=[]
        for item in error.errors():
            field='.'.join(map(str,item['loc'])) or 'arguments';kind=item['type']
            message=('缺少字段 '+field if kind=='missing' else '不支持字段 '+field if kind=='extra_forbidden' else field+'：'+item['msg'])
            if message not in parts:parts.append(message)
        return '节点「'+title+'」参数不匹配：'+'；'.join(parts[:5])
    return '节点「'+title+'」：'+str(error)[:380]

def references(value):
    if isinstance(value,dict):
        for child in value.values():yield from references(child)
    elif isinstance(value,list):
        for child in value:yield from references(child)
    elif isinstance(value,str):yield from REFERENCE.findall(value)

def validate_contracts(graph,tools,*,node_ids=None):
    known={n.id:n for n in graph.nodes};tool_map={t['id']:t for t in tools}
    for node in graph.nodes:
        if node_ids is not None and node.id not in node_ids:continue
        ancestors=set();pending=[e.source for e in graph.edges if e.target==node.id]
        while pending:
            source=pending.pop()
            if source in ancestors:continue
            ancestors.add(source);pending.extend(e.source for e in graph.edges if e.target==source)
        if node.foreach and (node.kind!='tool' or not REFERENCE.fullmatch(node.foreach)):
            raise ValueError('节点「'+node.title+'」逐项执行需要工具节点和 {{上游节点ID}} 列表引用')
        if node.foreach and not node.tool.startswith('portfolio-'):
            raise ValueError('节点「'+node.title+'」逐项执行暂仅支持结构化交易工具，其他 Skill 请用模型节点自主调用')
        refs=list(references(node.arguments))+list(references(node.foreach))
        if node.kind=='condition':
            if not node.path:raise ValueError('节点「'+node.title+'」需要设置判断字段')
            refs.append(node.path)
        for ref in refs:
            parts=ref.split('.');source=parts[0]
            if source=='item':
                if not node.foreach:raise ValueError('节点「'+node.title+'」引用 item 前必须设置逐项执行列表')
                continue
            if source not in ancestors:raise ValueError('节点「'+node.title+'」引用 '+ref+'，但该节点不在它的上游连线中')
            parent=known[source]
            list_output=parent.kind=='watchlist' or (parent.kind=='tool' and parent.tool=='portfolio-jev' and bool(parent.arguments) and not parent.foreach)
            if list_output and len(parts)>1 and not parts[1].isdigit():
                label='自选股票' if parent.kind=='watchlist' else '上游 '+parent.title
                raise ValueError('节点「'+node.title+'」：'+label+'输出是列表，没有 '+parts[1]+' 字段；逐项执行填 {{'+source+'}}，symbol 填 {{item.symbol}}')
        if node.kind=='tool' and (node.arguments or node.foreach):
            errors=argument_errors(node.arguments,tool_map[node.tool].get('schema'),templates=True)
            if errors:raise ValueError('节点「'+node.title+'」参数不匹配：'+'；'.join(errors))
    return graph

def contract_errors(graph,tools):
    """Report independent node failures together for a build-only repair."""
    errors=[]
    for node in graph.nodes:
        try:validate_contracts(graph,tools,node_ids={node.id})
        except (ValueError,KeyError) as exc:errors.append(str(exc))
    return errors
