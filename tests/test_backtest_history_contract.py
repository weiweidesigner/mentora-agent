"""Backtest data stays on the server rather than being reproduced by a model."""
import datetime as dt
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import pytest

from app.portfolio_backtest import backtest


def rows(count):
    return [dict(date=str(dt.date(2025,1,1)+dt.timedelta(days=i)),open=100+i,close=100+i,volume=1000) for i in range(count)]


def test_strategy_window_is_not_a_universal_sixty_five_day_gate():
    result=backtest({'rows':rows(30)},'breakout')
    assert result['status']=='computed' and result['sessions']==9
    assert result['requiredSessions']==22
    result=backtest({'rows':rows(30)},'trend')
    assert result['status']=='insufficient'
    assert result['receivedSessions']==30 and result['requiredSessions']==62
    assert backtest({'rows':rows(62)},'trend')['status']=='computed'


def test_symbol_backtest_uses_all_server_rows_even_if_model_supplies_a_subset():
    path=Path(__file__).parents[1]/'app/skills/portfolio-backtest/scripts/run.py'
    spec=importlib.util.spec_from_file_location('backtest_history_contract_skill',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    calls=[]
    def history(symbol):
        calls.append(symbol)
        return dict(rows=rows(150),source='fixture full history')
    result=module.execute(SimpleNamespace(market=SimpleNamespace(history=history)),'owner',dict(symbol='600000.SH',strategy='trend',history={'rows':rows(30)}))
    assert calls==['600000.SH']
    assert result['status']=='computed' and result['receivedSessions']==150
    assert result['sessions']==89
    schema=module.agent_schema()
    assert 'symbol' in schema['required'] and 'history' not in schema['properties']


@pytest.mark.parametrize('strategy',['trend','reversion','momentum','breakout','ma_cross','rsi_reversal','volume_breakout','pullback'])
def test_full_history_is_computed_for_every_builtin_strategy(strategy):
    result=backtest({'rows':rows(150),'source':'fixture'},strategy)
    assert result['status']=='computed' and result['receivedSessions']==150
    assert result['source']=='fixture'
    assert result['sessions']==149-result['warmupSessions']


def test_next_session_open_is_preserved_and_future_prices_do_not_change_earlier_fills():
    history=rows(150);history[61]['open']=75
    first=backtest({'rows':history},'trend')
    assert first['fills'][0]['date']==history[61]['date']
    assert first['fills'][0]['signalDate']==history[60]['date']
    assert first['fills'][0]['price']==75.075
    history[-1]['close']=10000
    assert backtest({'rows':history},'trend')['fills'][0]==first['fills'][0]
