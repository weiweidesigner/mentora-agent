import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.component_assets import mount_component_assets


def test_pinned_assets_keep_original_urls_and_do_not_expose_component_code(tmp_path):
    checkout = tmp_path / '.dependencies/mentora-themes'
    folder = checkout / 'app/static/assets/scene'
    folder.mkdir(parents=True)
    (folder / 'poster.svg').write_text('<svg/>')
    (checkout / 'private.py').write_text('private implementation')
    (checkout / 'app/static/theme.css').write_text('body {color:white}')
    (tmp_path / 'mentora-themes.lock.json').write_text(json.dumps({
        'checkout': '.dependencies/mentora-themes',
        'links': {'app/static/theme.css': 'app/static/theme.css',
                  'app/static/assets/scene': 'app/static/assets/scene'},
    }))
    app = FastAPI()
    mount_component_assets(app, tmp_path)
    client = TestClient(app)
    assert client.get('/static/theme.css').text == 'body {color:white}'
    assert client.head('/static/theme.css').status_code == 200
    assert client.get('/static/assets/scene/poster.svg').text == '<svg/>'
    assert client.get('/static/assets/scene/../../private.py').status_code == 404
    assert client.get('/static/private.py').status_code == 404


def test_export_cannot_escape_its_repository(tmp_path):
    checkout = tmp_path / '.dependencies/mentora-themes'
    checkout.mkdir(parents=True)
    outside = tmp_path / '.dependencies/private.txt'
    outside.write_text('secret')
    (checkout / 'escape.css').symlink_to(outside)
    (tmp_path / 'mentora-themes.lock.json').write_text(json.dumps({
        'checkout': '.dependencies/mentora-themes',
        'links': {'app/static/escape.css': 'escape.css'},
    }))
    with pytest.raises(ValueError, match='Unsafe'):
        mount_component_assets(FastAPI(), tmp_path)


def test_workflow_paths_use_the_host_even_when_the_module_is_a_repository_link():
    from app.host_paths import PROJECT_ROOT
    from app.workflows import ROOT
    assert ROOT == PROJECT_ROOT
    assert (ROOT / 'app/module_registry.json').is_file()
