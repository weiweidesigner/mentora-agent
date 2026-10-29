from io import BytesIO
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
import pytest
from app import business_images as m


def png():
    image=Image.new('RGBA',(300,240),(20,180,100,190));out=BytesIO();image.save(out,format='PNG');return out.getvalue()


def test_thumbnail_is_small_webp_with_preserved_alpha_and_bounded_dimensions():
    content=m.compress_image(png(),72)
    with Image.open(BytesIO(content)) as image:
        assert image.format=='WEBP' and image.width==72 and image.height<=72 and image.mode=='RGBA'
    assert len(content)<2000


@pytest.mark.parametrize('url',['http://cdn.ainvest.com/icon/a.png','https://cdn.ainvest.com.evil/icon/a.png','https://cdn.ainvest.com@localhost/icon/a.png','https://cdn.ainvest.com/icon/../private.png','https://cdn.ainvest.com/icon/a.png?redirect=https://localhost'])
def test_thumbnail_does_not_accept_arbitrary_sources(url):
    with pytest.raises(ValueError):m.source_url(url)


def test_saved_known_cards_rewrite_images_without_changing_text_or_metadata():
    source='<main>Investor META <img src="https://cdn.ainvest.com/icon/ownership/a.png"><img data-stock-logo src="https://cdn.ainvest.com/icon/us/META.png"></main><script id="smart-money-meta">{"source":"AInvest"}</script>'
    result=m.upgrade_business_images(source)
    assert 'size=72' in result and 'size=48' in result
    assert 'Investor META' in result and '{"source":"AInvest"}' in result
    assert result==m.upgrade_business_images(result)
    assert m.upgrade_business_images(source.replace('smart-money-meta','other-component'))==source.replace('smart-money-meta','other-component')


def test_endpoint_returns_compressed_media_and_rejects_redirects(monkeypatch):
    class Source:
        status_code=200
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def iter_content(self,size):yield png()
    calls=[]
    def get(url,**options):calls.append((url,options));return Source()
    monkeypatch.setattr(m.requests,'get',get)
    app=FastAPI();app.include_router(m.router);client=TestClient(app)
    response=client.get('/api/business-image',params={'url':'https://cdn.ainvest.com//icon/us/META.png','size':48})
    assert response.status_code==200 and response.headers['content-type']=='image/webp'
    assert calls[0][0]=='https://cdn.ainvest.com/icon/us/META.png' and calls[0][1]['allow_redirects'] is False
    assert 'max-age=86400' in response.headers['cache-control']
    Source.status_code=302
    assert client.get('/api/business-image',params={'url':'https://cdn.ainvest.com/icon/a.png'}).status_code==502
    count=len(calls)
    assert client.get('/api/business-image',params={'url':'https://localhost/a.png'}).status_code==400
    assert len(calls)==count


def test_holdings_center_portrait_and_stock_icons_share_compression_route():
    source='<main><img src="https://cdn.ainvest.com/icon/ownership/p.png"><img data-stock-logo src="https://cdn.ainvest.com/icon/us/AMD.png"></main><script id="politician-holdings-meta">{"total":75}</script>'
    result=m.upgrade_business_images(source)
    assert 'size=112' in result and 'size=48' in result and '{"total":75}' in result
    assert result==m.upgrade_business_images(result)
