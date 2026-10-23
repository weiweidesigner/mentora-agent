"""Persist validated native tool output without invoking another model."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.native_streamviz import _save_widget

if __name__ == '__main__':
    args = json.loads(sys.stdin.read(2_000_000))
    artifact = _save_widget(ROOT / 'outputs/generated', args['title'], args['widget_code'])
    if not artifact:
        raise ValueError('Unsupported widget markup')
    print(json.dumps(dict(ok=True, output=artifact['path'], **artifact)))
