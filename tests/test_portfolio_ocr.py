import base64
import io
from types import SimpleNamespace

import pytest
from fastapi import FastAPI,HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from app import portfolio_ocr as ocr


def image_url():
    data=io.BytesIO();Image.new('RGB',(100,100),'white').save(data,format='PNG')
    return 'data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()


def test_extracts_codes_across_markets_without_guessing_or_losing_real_tickers():
    result=ocr.extract_candidates('NASDAQ:AAPL AAPL MSFT OPEN BUY SH600519 600519 000001.SZ 00700.HK 09988 347.47 2026-10-26 USD')
    codes={item['symbol'] for item in result}
    assert {'NASDAQ:AAPL','MSFT','OPEN','BUY','600519.SH','000001.SZ','00700.HK','09988.HK'}<=codes
    assert 'AAPL' not in codes
    assert not codes&{'USD','347.47','2026','10','26'}
    assert all(item['verified'] is False for item in result)
    assert len([v for v in result if v['symbol']=='600519.SH'])==1


def test_ocr_uses_local_process_only_and_never_adds_favorites(monkeypatch):
    seen=[];monkeypatch.setattr(ocr.shutil,'which',lambda _: '/usr/bin/tesseract')
    def execute(command,**kwargs):
        seen.append((command,kwargs))
        assert kwargs['input'].startswith(b'\x89PNG') and kwargs['timeout']==15
        return SimpleNamespace(returncode=0,stdout=b'AAPL MSFT 600519 00700.HK')
    monkeypatch.setattr(ocr.subprocess,'run',execute)
    app=FastAPI();app.include_router(ocr.router);client=TestClient(app)
    assert client.post('/api/portfolio/favorites/ocr',json={'image':image_url()}).status_code==403
    response=client.post('/api/portfolio/favorites/ocr',headers={'X-Veya-Portfolio':'1'},json={'image':image_url()})
    assert response.status_code==200,response.text
    result=response.json();assert result['usesLLM'] is False and result['requiresConfirmation'] is True
    assert len(result['candidates'])==4 and len(seen)==1
    assert response.headers['cache-control']=='no-store'


@pytest.mark.parametrize('value',['https://example.com/image.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,@@@'])
def test_rejects_remote_svg_and_invalid_images(monkeypatch,value):
    monkeypatch.setattr(ocr.shutil,'which',lambda _: '/usr/bin/tesseract')
    monkeypatch.setattr(ocr.subprocess,'run',lambda *_a,**_k:pytest.fail('must not execute invalid input'))
    with pytest.raises(HTTPException):ocr.recognize_image(value)


def test_missing_engine_does_not_fall_back_to_a_model(monkeypatch):
    monkeypatch.setattr(ocr.shutil,'which',lambda _:None)
    with pytest.raises(HTTPException,match='不会改用大模型'):ocr.recognize_image(image_url())
