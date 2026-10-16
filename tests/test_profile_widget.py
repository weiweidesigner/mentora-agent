import json
import re

from app.artifact_upgrades import upgrade_widget_tradingview
from app.widget_library import renderer


def test_saved_profile_uses_official_content_sized_web_component():
    config=renderer().build_config('company-profile',symbol='NASDAQ:AAPL',language='zh-CN')
    source=renderer().render('company-profile',config,'苹果简介',560,'zh-CN')
    upgraded=upgrade_widget_tradingview(source)
    spec=json.loads(re.search(r'<script id="tv-config" type="application/json">(.*?)</script>',upgraded,re.S)[1])
    assert spec['format']=='web-component'
    assert spec['tag']=='tv-company-profile'
    assert spec['module'] is True
    assert spec['script']=='https://widgets.tradingview-widget.com/w/en/tv-company-profile.js'
    assert spec['config']=={'symbol':'NASDAQ:AAPL','colorTheme':'dark','locale':'zh_CN'}
    assert upgrade_widget_tradingview(upgraded)==upgraded


def test_other_widgets_keep_their_original_provider_format():
    source='<html><head></head><script id="tv-config" type="application/json">{"widget":"advanced-chart","config":{"symbol":"NASDAQ:AAPL"}}</script></html>'
    upgraded=upgrade_widget_tradingview(source)
    assert 'tv-company-profile' not in upgraded
