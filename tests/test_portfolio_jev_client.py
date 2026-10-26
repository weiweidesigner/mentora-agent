from types import SimpleNamespace

from app.portfolio_jev import PortfolioJev


def test_jev_uses_local_laya_client_contract(monkeypatch):
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

    active=SimpleNamespace(
        configured=True,
        client_factory=LocalClient,
        endpoint='http://127.0.0.1:8791/predict',
        model='laya-test',
    )
    monkeypatch.setattr('app.portfolio_jev.COSTS.record_response',lambda *_args,**_kwargs:None)
    result=PortfolioJev(lambda _:active).decide('entry',[{'symbol':'AAPL'}],{})
    assert captured=={'endpoint':'http://127.0.0.1:8791/predict','model':'laya-test','timeout':20}
    assert result[0]['action']=='watch' and result[0]['providerModel']=='laya-local'
