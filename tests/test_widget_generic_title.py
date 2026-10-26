from app.artifact_upgrades import upgrade_widget_generic_chart


def test_widget_generic_title_is_query_scoped():
    source = '<html><head></head><body><section class="chart-component"><h2 class="chart-title">重复标题</h2><div class="chart-stage"></div></section></body></html>'
    upgraded = upgrade_widget_generic_chart(source)
    assert "p.get('canvas')==='1'||p.get('widgetTitle')==='0'" in upgraded
    assert 'html[data-widget-title="hidden"] .chart-title' in upgraded
    assert upgraded.count('data-widget-generic-title') == 2
    assert upgrade_widget_generic_chart(upgraded) == upgraded


def test_non_generic_artifacts_keep_their_own_title():
    source = '<html><head></head><body><h1 class="streamviz-title">StreamViz 标题</h1></body></html>'
    assert upgrade_widget_generic_chart(source) == source


def test_native_kline_title_is_hidden_only_inside_widget_canvas():
    source = '<html><head></head><body><section class="kline-component"><header class="kline-title"><strong data-business-title="true">重复标题</strong><nav>周期</nav></header></section></body></html>'
    upgraded = upgrade_widget_generic_chart(source)
    assert '.kline-title>strong[data-business-title]' in upgraded
    assert "p.get('canvas')==='1'||p.get('widgetTitle')==='0'" in upgraded
    assert '<strong data-business-title="true">重复标题</strong><nav>周期</nav>' in upgraded
