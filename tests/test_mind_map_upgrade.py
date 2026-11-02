import json
from app.artifact_upgrades import upgrade_mind_map


def test_saved_map_shell_upgrades_without_touching_embedded_content():
    markdown='# A source topic\n## Original branch\n- Exact 2.84 value\n- </script> literal'
    old='<html><body><div data-mind-map-container="true"><pre id="mm"></pre></div><script>document.getElementById("mm").textContent = '+json.dumps(markdown).replace('</','<\\/')+';</script></body></html>'
    result=upgrade_mind_map(old,'dark')
    assert 'data-mind-map-version="4"' in result
    assert 'body class="theme-dark"' in result
    encoded=result.split('document.getElementById("mm").textContent = ',1)[1]
    assert json.JSONDecoder().raw_decode(encoded)[0]==markdown
    assert upgrade_mind_map(result,'dark')==result
    assert upgrade_mind_map('<html>Unrelated</html>','dark')=='<html>Unrelated</html>'
