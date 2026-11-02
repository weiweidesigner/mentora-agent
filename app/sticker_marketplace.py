"""Curated public sticker packs; only installed packs enter a persona's pool."""
import json
from pathlib import Path

ROOT = Path(__file__).parent / 'static/assets/qq-stickers'
DEFAULT_PACKS = ['dafeiyu-companion']


def catalog():
    items = json.loads((ROOT/'catalog.json').read_text())
    static = ROOT.parent.parent
    return [item for item in items if item['url'].startswith('/static/assets/')
            and '..' not in item['url'] and (static/item['url'].removeprefix('/static/')).is_file()]


def packs(profile):
    installed = profile.get('stickerPacks', DEFAULT_PACKS)
    items = catalog()
    result = []
    for pack in json.loads((ROOT/'packs.json').read_text()):
        members = [item for item in items if item['packId'] == pack['id']]
        result.append({**pack, 'count':len(members), 'previews':[x['url'] for x in members[:4]],
                       'installed':pack['id'] in installed})
    return result


def installed_stickers(profile):
    enabled = profile.get('stickerPacks', DEFAULT_PACKS)
    return [item for item in catalog() if item['packId'] in enabled]
