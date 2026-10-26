"""Read-only confidence labels, including explicitly identifiable legacy decisions."""
import math


def trading_confidence(decision):
    gate=decision.get('confidenceGate') or {}
    direction=next((value for value in (decision.get('confidenceDirection'),gate.get('action'),decision.get('modelAction'),decision.get('action')) if value in ('buy','sell','reduce')),None)
    values=decision.get('actionConfidences') or {}
    if direction is None:
        sides=[side for side in ('buy','sell') if isinstance(values.get(side),(int,float)) and not isinstance(values[side],bool)]
        if len(sides)==1:direction=sides[0]
    if direction=='reduce':direction='sell'
    value=values.get(direction) if direction else None
    if value is None and direction:value=decision.get('confidence')
    valid=lambda number:isinstance(number,(int,float)) and not isinstance(number,bool) and math.isfinite(number) and 0<=number<=1
    if not valid(value):value=None
    threshold=gate.get('threshold')
    if not valid(threshold):threshold=None
    gate_value=gate.get('value')
    measured=gate_value if valid(gate_value) else value
    passed=measured>=threshold if measured is not None and threshold is not None and direction else None
    agreement=gate.get('agreementPassed',decision.get('orderAgreement'))
    return dict(direction=direction,value=value,threshold=threshold,thresholdPassed=passed,agreementPassed=agreement,
                executionPassed=gate.get('passed'))
