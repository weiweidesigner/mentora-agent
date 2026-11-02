import json
import pytest
from app.artifact_upgrades import upgrade_data_table


@pytest.mark.parametrize("version", [1, 2])
def test_saved_table_upgrade_preserves_all_embedded_values_without_source_file(version):
    config = {'type': 'data-table', 'title': '完整数据', 'theme': 'dark', 'locale': 'zh-CN', 'height': 360,
              'columns': [{'field': 'v', 'label': '数值', 'type': 'number', 'align': 'right', 'width': 140, 'digits': None, 'prefix': '', 'suffix': ''}],
              'rows': [[i] for i in range(2001)], 'fileSource': {'path': '/nonexistent/source.json', 'recordCount': 2001}}
    old = '<html><body><section data-data-table-version="'+str(version)+'"></section><script id="table-data" type="application/json">'+json.dumps(config)+'</script></body></html>'
    updated = upgrade_data_table(old, 'dark')
    assert 'data-data-table-version="3"' in updated
    embedded = updated.split('<script id="table-data" type="application/json">')[1].split('</script>')[0]
    assert json.loads(embedded) == config
    assert 'class="table-count"' not in updated and 'class="table-footer"' not in updated
    assert '<dialog>' not in updated
    assert upgrade_data_table(updated, 'dark') == updated
    assert upgrade_data_table('<html>Other content</html>', 'dark') == '<html>Other content</html>'
