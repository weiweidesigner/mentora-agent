"""Pure sizing limits shared by decision guards and the final order planner."""
import math


def execution_confidence_threshold(action, preferences=None):
    """Return the account-selected order gate, preserving legacy defaults until set."""
    investment=(preferences or {}).get('investment',preferences or {}) if isinstance(preferences,dict) else {}
    value=investment.get('confidenceThresholdPct') if isinstance(investment,dict) else None
    if isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and 10<=value<=100:
        return value/100
    return .50 if action=='buy' else .60


def recorded_confidence_threshold(trade):
    """Audit older fills against their recorded policy, not today's setting."""
    value=(trade.get('confidenceGate') or {}).get('threshold')
    return value if isinstance(value,(int,float)) and math.isfinite(value) and 0<value<=1 else .60


def buy_limits(summary, symbol, price, settings):
    equity = float(summary['equity'])
    current = next((p for p in summary['positions'] if p['symbol'] == symbol), None)
    quantity = current['quantity'] if current else 0
    cap = max(0, math.floor((equity * settings['maxPositionPct'] / 100 - quantity * price) / price))
    risk = max(0, math.floor((equity * settings['riskPct'] / 100 - settings['fee']) / (price * settings['stopPct'] / 100)) - quantity)
    cash = max(0, math.floor((summary['cash'] - equity * settings['reservePct'] / 100 - settings['fee']) / price))
    return cap, risk, cash, min(cap, risk, cash)
