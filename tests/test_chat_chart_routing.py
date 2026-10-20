import ast
from pathlib import Path
from types import SimpleNamespace

def test_explicit_deal_agent_does_not_route_xauusd_into_equity_trading():
    source=Path(__file__).parents[1]/'app/presentation.py'
    definition=next(node for node in ast.parse(source.read_text()).body if isinstance(node,ast.FunctionDef) and node.name=='durable_chat_events')
    def forbidden(*_):raise AssertionError('gold must not enter equity workflow')
    scope=dict(PORTFOLIO=SimpleNamespace(workflow=SimpleNamespace(research_only_request=lambda _:True,handles_question=lambda *_:True,stream_idea=forbidden)),
               framework_events=lambda _ :iter([('final',{'interpretation':'gold research'})]),
               ROOT=Path('/unused'))
    exec(compile(ast.Module(body=[definition],type_ignores=[]),str(source),'exec'),scope)
    result=list(scope['durable_chat_events'](SimpleNamespace(question='XAUUSD 5m',agent='mentora-deal',history=[]),'owner'))[-1][1]
    assert result['agent']=='mentora'
    assert result['interpretation']=='gold research'
    assert not result.get('reportArtifacts')


def test_recalled_chart_is_preserved_without_injecting_another_provider():
    source=Path(__file__).parents[1]/'app/presentation.py'
    definition=next(node for node in ast.parse(source.read_text()).body if isinstance(node,ast.FunctionDef) and node.name=='durable_chat_events')
    scope=dict(framework_events=lambda _:iter([
        ('module',{'htmlUrl':'/generated/native-kline.html','label':'Gold K-line'}),
        ('final',{'interpretation':'verified chart analysis'}),
    ]))
    exec(compile(ast.Module(body=[definition],type_ignores=[]),str(source),'exec'),scope)
    result=list(scope['durable_chat_events'](SimpleNamespace(question='XAUUSD 5m',agent='',history=[]),'owner'))[-1][1]
    assert result['reportArtifacts']==[{'url':'/generated/native-kline.html','label':'Gold K-line'}]
    assert result['reportUrl']=='/generated/native-kline.html'
    assert result['interpretation']=='verified chart analysis'
