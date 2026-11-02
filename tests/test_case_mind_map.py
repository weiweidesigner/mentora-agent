import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright
from app.native_pine_artifacts import NativePineStaticFiles

ROOT=Path(__file__).resolve().parents[1]
URL='/static/cases/us-catalysts/deepseek-case-us-catalysts-mindmap.html'


def case_response(headers=None):
    app=FastAPI();app.mount('/static',NativePineStaticFiles(directory=ROOT/'app/static'))
    return TestClient(app).get(URL+'?theme=dark',headers=headers)


def test_actual_static_case_gets_current_map_runtime_with_original_content():
    response=case_response()
    assert response.status_code==200 and response.headers['cache-control']=='no-store'
    assert 'data-mind-map-version="5"' in response.text
    assert 'panFullscreenMindMap(-dx*unit,-dy*unit)' in response.text
    original=(ROOT/URL.lstrip('/').replace('static/','app/static/',1)).read_text()
    marker='document.getElementById("mm").textContent = '
    assert json.JSONDecoder().raw_decode(response.text.split(marker)[1])[0]==json.JSONDecoder().raw_decode(original.split(marker)[1])[0]


def test_case_host_wheel_boundary_allows_fullscreen_only():
    html=case_response().text
    app=(ROOT/'app/static/app.js').read_text()
    start=app.index('function installMindMapWheelBoundary(doc)')
    boundary=app[start:app.index('\nfunction createArtifactFallbackFrame',start)]
    loader="document.getElementById('mm').innerHTML='<svg class=\"markmap\" width=\"100%\" height=\"100%\"><g><rect width=\"500\" height=\"250\"/></g></svg>';"
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        try:
            page=browser.new_page(viewport={'width':1100,'height':800})
            page.route('**/*markmap-autoloader*',lambda r:r.fulfill(body=loader,content_type='application/javascript'))
            page.set_content('<iframe allowfullscreen style="width:100%;height:520px"></iframe>')
            page.locator('iframe').evaluate('(f,html)=>f.srcdoc=html',html)
            frame=page.frames[1];frame.wait_for_selector('svg.markmap')
            frame.add_script_tag(content=boundary+'\ninstallMindMapWheelBoundary(document);')
            position="()=>{const m=document.querySelector('svg.markmap g').getScreenCTM();return [m.e,m.f]}"
            fire="()=>document.querySelector('svg.markmap').dispatchEvent(new WheelEvent('wheel',{deltaX:40,deltaY:60,bubbles:true,cancelable:true}))"
            before=frame.evaluate(position);frame.evaluate(fire);assert frame.evaluate(position)==before
            frame.locator('#fullscreenBtn').click();frame.wait_for_function('!!document.fullscreenElement');frame.wait_for_timeout(400)
            before=frame.evaluate(position);frame.evaluate(fire);after=frame.evaluate(position)
            assert abs(after[0]-before[0]+40)<.1 and abs(after[1]-before[1]+60)<.1
            frame.locator('#exitFullscreenBtn').click();frame.wait_for_function('!document.fullscreenElement');frame.wait_for_timeout(800)
            before=frame.evaluate(position);frame.evaluate(fire);assert frame.evaluate(position)==before
        finally:browser.close()


def test_old_static_etag_does_not_hide_a_runtime_upgrade():
    from fastapi.staticfiles import StaticFiles
    app=FastAPI();app.mount('/static',StaticFiles(directory=ROOT/'app/static'))
    original=TestClient(app).get(URL)
    response=case_response({'If-None-Match':original.headers['etag']})
    assert response.status_code==200 and 'data-mind-map-version="5"' in response.text
    assert response.headers['cache-control']=='no-store'
