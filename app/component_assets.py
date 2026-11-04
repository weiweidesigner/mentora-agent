"""Serve only static paths explicitly exported by pinned private components."""
import json
from pathlib import Path

from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def mount_component_assets(app, root: Path):
    for name in ('mentora-companion', 'mentora-themes', 'mentora-workflows'):
        manifest = root / (name + '.lock.json')
        if not manifest.is_file():
            continue
        spec = json.loads(manifest.read_text())
        checkout = (root / spec['checkout']).resolve()
        if not checkout.is_relative_to(root.resolve() / '.dependencies'):
            raise ValueError('Component checkout must stay under .dependencies')
        for target, relative in spec['links'].items():
            if not target.startswith('app/static/'):
                continue
            suffix = Path(target).relative_to('app/static')
            source = (checkout / relative).resolve()
            if '..' in suffix.parts or not source.is_relative_to(checkout):
                raise ValueError('Unsafe component static export')
            if not source.exists():
                raise RuntimeError('Missing component asset: ' + target)
            url = '/static/' + suffix.as_posix()
            if source.is_dir():
                app.mount(url, StaticFiles(directory=source), name=name + '-' + suffix.name)
            else:
                app.add_api_route(url, _file_handler(source), methods=['GET', 'HEAD'],
                                  include_in_schema=False)


def _file_handler(path):
    def asset():
        return FileResponse(path)
    return asset
