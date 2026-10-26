from types import SimpleNamespace

from app.portfolio_jev import PortfolioJev,decision_client


def test_local_laya_client_constructor_contract():
    captured={}

    class LocalClient:
        def __init__(self,*,endpoint,model,timeout):
            captured.update(endpoint=endpoint,model=model,timeout=timeout)

        def __enter__(self):return self
        def __exit__(self,*args):pass

        def system_one(self,state,questions):
            return SimpleNamespace(model='laya-local',answers={
                'item_0_action':SimpleNamespace(choice='watch',confidence=.8),
                'item_0_factor':SimpleNamespace(choice='price-risk'),
                'item_0_size':SimpleNamespace(choice='quarter'),
                'item_0_catalyst':SimpleNamespace(choice='unavailable'),
            })

    active=SimpleNamespace(client_factory=LocalClient,endpoint='http://127.0.0.1:8791/predict',model='laya-test')
    with decision_client(active):pass
    assert captured=={'endpoint':'http://127.0.0.1:8791/predict','model':'laya-test','timeout':20}


def test_portfolio_jev_routes_local_client_to_compact_laya_pipeline(monkeypatch):
    expected=[{'symbol':'AAPL','action':'watch','providerModel':'laya-local'}]
    captured={}
    class LocalClient:
        def __init__(self,*,endpoint,model,timeout):pass
    class Pipeline:
        def decide(self,kind,evidence,account):
            captured.update(kind=kind,evidence=evidence,account=account)
            return expected
    monkeypatch.setattr('app.portfolio_laya.LayaPortfolio',lambda:Pipeline())
    active=SimpleNamespace(configured=True,client_factory=LocalClient,endpoint='http://127.0.0.1:8791/predict',model='laya-test')
    evidence=[{'symbol':'AAPL','technicalAnalysis':{'summary':'bounded upstream'}}]
    account={'cash':1000}
    assert PortfolioJev(lambda _:active).decide('entry',evidence,account)==expected
    assert captured=={'kind':'entry','evidence':evidence,'account':account}
