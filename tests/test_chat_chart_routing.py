import ast
import json
from pathlib import Path
from types import SimpleNamespace

from app.chat_market_chart import requested_market_chart


def test_xauusd_five_minute_request_produces_the_requested_widget():
    root=Path(__file__).parents[1]
    artifact=requested_market_chart(SimpleNamespace(question='Xauusd buy or sell now for 5m chart?',themeMode='dark'),root)
    path=Path(artifact['path'])
    try:
        content=path.read_text()
        config=json.loads(content.split('<script id="tv-config" type="application/json">')[1].split('</script>')[0])
        assert config['config']['symbol']=='OANDA:XAUUSD'
        assert config['config']['interval']=='5'
        assert artifact['dataStatus']=='display-only' and path.stat().st_size>1000
    finally:path.unlink()


def test_explicit_deal_agent_does_not_route_xauusd_into_equity_trading():
    source=Path(__file__).parents[1]/'app/presentation.py'
    definition=next(node for node in ast.parse(source.read_text()).body if isinstance(node,ast.FunctionDef) and node.name=='durable_chat_events')
    def forbidden(*_):raise AssertionError('gold must not enter equity workflow')
    scope=dict(PORTFOLIO=SimpleNamespace(workflow=SimpleNamespace(research_only_request=lambda _:True,handles_question=lambda *_:True,stream_idea=forbidden)),
               framework_events=lambda _ :iter([('final',{'interpretation':'gold research'})]),
               requested_market_chart=lambda *_:dict(url='/generated/gold-5m.html',dataStatus='display-only'),ROOT=Path('/unused'))
    exec(compile(ast.Module(body=[definition],type_ignores=[]),str(source),'exec'),scope)
    result=list(scope['durable_chat_events'](SimpleNamespace(question='XAUUSD 5m',agent='mentora-deal',history=[]),'owner'))[-1][1]
    assert result['reportArtifacts'][0]['url']=='/generated/gold-5m.html'
    assert 'OHLCV' in result['interpretation']
