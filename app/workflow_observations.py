"""Persist workflow execution evidence in the existing owner-scoped observation pool."""
from copy import deepcopy
from app.day_tasks import now_utc, stamp

def update_observations(portfolio,owner,graph,node_id,receipts,run_id,title,preview=False):
    if not portfolio:raise ValueError('观察列表服务暂不可用')
    ancestors=set()
    def visit(target):
        for edge in graph.edges:
            if edge.target==target and edge.source not in ancestors:
                ancestors.add(edge.source);visit(edge.source)
    visit(node_id)
    records={}
    from app.hk_market_data import research_symbol,is_hk_symbol
    def record(symbol):
        if not isinstance(symbol,str) or not symbol.strip():return None
        try:symbol=research_symbol(symbol)
        except (ValueError,TypeError):return None
        return records.setdefault(symbol,dict(backtests=[],tools=[]))
    def rows(value):
        if isinstance(value,list):
            for item in value:yield from rows(item)
        elif isinstance(value,dict):
            # Native batched Skills return items/results/decisions, never narrative text.
            nested=next((value[k] for k in ('items','results','decisions') if isinstance(value.get(k),list)),None)
            if nested is not None:
                for item in nested:
                    if isinstance(item,dict):yield from rows(dict(item,**({'symbol':value['symbol']} if 'symbol' not in item and value.get('symbol') else {})))
            else:yield value
    for node in graph.nodes:
        if node.id not in ancestors:continue
        for receipt in receipts.get(node.id,[]):
            tool=receipt['tool'];args=receipt.get('input') or {};result=receipt.get('output')
            if tool not in ('portfolio-backtest','portfolio-jev','portfolio-order','portfolio-data'):continue
            for value in rows(result):
                symbol=value.get('symbol') or args.get('symbol')
                item=record(symbol)
                if item is None:continue
                if tool=='portfolio-backtest':
                    item['backtests'].append(deepcopy(value))
                elif tool=='portfolio-jev' and args.get('operation','decide')=='decide':
                    item['decision']=deepcopy(value)
                elif tool=='portfolio-order':
                    # Plans are retained as plans; only the execute receipt is a trade.
                    item['trade' if args.get('operation')=='execute' else 'plan']=deepcopy(value)
                elif tool=='portfolio-data' and args.get('operation')=='quote':
                    item['quote']=deepcopy(value)
                else:
                    if not item['tools']:records.pop(symbol,None)
                    continue
                if tool not in item['tools']:item['tools'].append(tool)
    records={symbol:value for symbol,value in records.items() if value['tools']}
    if not records:raise ValueError('没有可更新的真实标的执行结果，请连接行情、回测、JEV 决策或交易节点')
    updated=stamp(now_utc())
    for symbol,item in records.items():
        item.update(runId=run_id,title=title,updated=updated)
        if not preview:
            values=dict(sourceTypes=['workflow'],workflowExecution=item)
            if is_hk_symbol(symbol):values.update(market='HK',nativeCurrency='HKD',researchOnly=True,executionAuthorized=False)
            if item['backtests']:values['backtests']=item['backtests']
            if item.get('quote'):values['quote']=item['quote']
            portfolio.workflow.merge(owner,symbol,values)
    symbols=list(records)
    text=('试运行预览：将更新 ' if preview else '已更新观察列表：')+'、'.join(symbols)
    return dict(interpretation=text,symbols=symbols,updatedCount=0 if preview else len(symbols),preview=preview,observations=records)
