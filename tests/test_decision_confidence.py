"""Offline regressions for trading-direction confidence versus final action."""
from types import SimpleNamespace
import pytest
from app.decision_confidence import trading_confidence
from app.portfolio_jev import PortfolioJev, execution_confidence_gate
from app.portfolio_laya import LayaPortfolio
from app.portfolio import DEFAULTS
from app.workflow_observations import observation_summary


def decide(first,second,kind='entry'):
    item=dict(symbol='T',quote=dict(price=100,currency='USD',tradable=True,priceAt='2026-10-26T12:00:00+00:00'),backtests=[],risk=dict(quantity=100,availableToSell=100))
    account=dict(cash=100000,equity=100000,positions=[],settings=dict(DEFAULTS),valuationComplete=True,recommendationProfile={'investment':{'confidenceThresholdPct':30}})
    def predict(state,questions):
        answers={}
        for key,q in questions.items():
            values=first if key=='action' else second if key=='action_reversed' else {'quarter':.1,'half':.8,'full':.1}
            answers[key]=dict(choice=max(values,key=values.get),probabilities=values)
        return dict(model='offline-laya',answers=answers)
    return LayaPortfolio(predict).decide(kind,[item],account)[0]


def summary(decision):
    return observation_summary(dict(observations={'T':{'decision':decision}}))


def test_3472_percent_passes_30_percent_despite_option_order_disagreement():
    decision=decide({'buy':.3472,'watch':.4,'skip':.2528},{'buy':.4,'watch':.35,'skip':.25})
    assert decision['confidence']==.3472 and decision['actionConfidences']=={'buy':.3472}
    assert decision['action']=='buy' and decision['status']=='decided' and decision['sizeFraction']==.5
    gate=decision['confidenceGate']
    assert gate['thresholdPassed'] is True and gate['agreementPassed'] is False and gate['passed'] is True
    assert gate['agreementRequired'] is False
    assert decision['classificationActions']=={'forward':'watch','reversed':'buy'}
    text=summary(decision)
    assert '买入；买入置信度 34.72%；置信度门槛 30%（通过）' in text
    assert '顺序一致性校验未通过' not in text and '未下单' in text
    assert '趋势与回测支持参与' not in text


def test_low_buy_probability_is_not_watch_probability_or_a_positive_trend_claim():
    first={'buy':.248,'watch':.5,'skip':.252}
    decision=decide(first,first)
    assert decision['confidenceDirection']=='buy' and decision['confidence']==.248
    assert decision['confidenceGate']['thresholdPassed'] is False
    assert decision['confidenceGate']['agreementPassed'] is True
    assert decision['status']=='low-confidence' and decision['action']=='watch'
    assert '买入置信度 24.80%' in summary(decision) and '门槛 30%（未通过）' in summary(decision)
    assert '当前趋势与回测支持参与' not in summary(decision)


def test_explicit_sell_confidence_stays_attached_to_sell_direction():
    decision=decide({'hold':.2,'reduce':.6,'sell':.2},{'hold':.25,'reduce':.6,'sell':.15},kind='risk')
    assert decision['confidenceDirection']=='sell' and decision['confidence']==.75
    assert decision['actionConfidences']=={'sell':.75}
    assert '卖出置信度 75.00%' in summary(decision)


def test_consistent_above_threshold_still_allows_the_existing_trade_policy():
    probabilities={'buy':.7,'watch':.2,'skip':.1}
    decision=decide(probabilities,probabilities)
    assert decision['action']=='buy' and decision['status']=='decided'
    assert decision['confidenceGate']['passed'] is True and decision['sizeFraction']==.5


@pytest.mark.parametrize('confidence,passed',[(.3449,True),(.3,True),(.2999,False)])
@pytest.mark.parametrize('direction',['buy','sell','reduce'])
def test_order_disagreement_cannot_override_the_direction_threshold(direction,confidence,passed):
    gate=execution_confidence_gate(direction,confidence,False,{'investment':{'confidenceThresholdPct':30}})
    assert gate['passed'] is passed and gate['thresholdPassed'] is passed
    assert gate['agreementPassed'] is False and gate['agreementRequired'] is False


def test_disagreement_below_threshold_still_stays_watch():
    decision=decide({'buy':.2,'watch':.5,'skip':.3},{'buy':.4,'watch':.35,'skip':.25})
    assert decision['orderAgreement'] is False
    assert decision['action']=='watch' and decision['status']=='low-confidence'
    assert decision['sizeFraction']==0 and decision['confidenceGate']['passed'] is False
    assert '顺序一致性校验未通过' not in summary(decision)


def test_sell_disagreement_above_threshold_passes_without_executing_order():
    decision=decide({'hold':.3,'reduce':.6,'sell':.1},{'hold':.4,'reduce':.35,'sell':.25},kind='risk')
    assert decision['orderAgreement'] is False
    assert decision['action']=='reduce' and decision['status']=='decided'
    assert decision['confidence']==.6 and decision['sizeFraction']==.5
    assert '顺序一致性校验未通过' not in summary(decision)
    assert '未下单' in summary(decision)


@pytest.mark.parametrize('action',['watch','hold','skip'])
def test_legacy_nontrading_certainty_is_not_relabelled_as_trade_confidence(action):
    decision=dict(action=action,modelAction=action,confidence=.99,actionConfidences={action:.99})
    assert trading_confidence(decision)['value'] is None
    text=summary(decision)
    assert '99.00%' not in text and '未记录买卖方向置信度' in text


def test_historical_above_threshold_failure_is_not_reported_as_numeric_failure():
    decision=dict(action='watch',modelAction='buy',confidence=.3472,orderAgreement=False,
                  confidenceGate={'action':'buy','threshold':.3,'passed':False},factor='trend-confirmed',factorLabel='当前趋势与回测支持参与')
    assert '门槛 30%（通过）' in summary(decision) and '顺序一致性校验未通过' in summary(decision)
    assert '当前趋势与回测支持参与' not in summary(decision)
    decision.pop('orderAgreement')
    assert '历史记录未提供具体原因' in summary(decision)


def test_gate_uses_actual_precision_instead_of_rounded_display_value():
    decision=dict(action='watch',modelAction='buy',confidence=.3,confidenceGate={'action':'buy','value':.29996,'threshold':.3,'passed':False})
    assert trading_confidence(decision)['thresholdPassed'] is False


def test_hosted_watch_certainty_is_kept_only_as_classification_metadata(monkeypatch):
    monkeypatch.setenv('PORTFOLIO_DECISION_PROVIDER','jev')
    class Client:
        def __init__(self,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def system_one(self,**kwargs):
            return SimpleNamespace(model='offline-jev',answers={'item_0_action':SimpleNamespace(choice='watch',confidence=.91),'item_0_factor':SimpleNamespace(choice='catalyst-unclear'),'item_0_size':SimpleNamespace(choice='quarter'),'item_0_catalyst':SimpleNamespace(choice='unavailable')})
    active=SimpleNamespace(configured=True,client_factory=Client,api_key='fixture',model='offline')
    decision=PortfolioJev(lambda _:active).decide('entry',[{'symbol':'T'}],{})[0]
    assert decision['confidence'] is None and decision['classificationConfidence']==.91
    assert decision['confidenceDirection'] is None and decision['actionConfidences']=={}
    assert decision['confidenceGate']['applicable'] is False


def test_nontrading_action_has_no_execution_confidence_gate():
    gate=execution_confidence_gate('watch',.9)
    assert gate['threshold'] is None and gate['value'] is None and gate['passed'] is None
