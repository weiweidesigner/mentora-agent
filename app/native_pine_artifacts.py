"""Upgrade native K-lines in static inspiration cases at response time."""
import re
from pathlib import Path

from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from app.artifact_upgrades import upgrade_native_kline_pine, sync_native_kline_theme
from urllib.parse import parse_qs


class NativePineStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if not (path.startswith('cases/') and path.endswith('.html') and
                response.status_code == 200 and isinstance(response, FileResponse)):
            return response
        # StaticFiles has already checked traversal and resolved the allowed file.
        artifact = await run_in_threadpool(Path(response.path).read_text, encoding='utf-8')
        theme=parse_qs(scope.get('query_string',b'').decode()).get('theme',[''])[0]
        if theme not in {'dark','light'}:
            match=re.search(r'<html\b[^>]*data-theme=["\'](dark|light)',artifact,re.I)
            theme=match[1] if match else 'light'
        artifact=sync_native_kline_theme(artifact,theme)
        artifact = upgrade_native_kline_pine(artifact)
        if 'root.dataset.pineBridge' not in artifact:
            return response
        adapter = (Path(__file__).parent/'static/kline-pine.js').read_text(encoding='utf-8')
        script = '<script data-kline-pine-host>'+adapter+'</script>'
        artifact = re.sub(r'</body\s*>', lambda _:script+'</body>', artifact, count=1, flags=re.I) if re.search(r'</body\s*>', artifact, re.I) else artifact+script
        return HTMLResponse(artifact, headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
