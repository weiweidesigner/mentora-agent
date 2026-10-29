"""Owner-scoped homepage case snapshots. Saving never publishes or runs research."""
import datetime as dt
import hashlib
import json
import re
import html
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote,urlsplit
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.chat_sessions import identity

CATEGORIES = {'mine': '我的', 'lane': '泳道', 'reports': '市场报告', 'charts': '金融图表',
              'analysis': '数据分析', 'videos': '金融视频', 'art': '艺术绘图'}
ANSWER_FIELDS = {'interpretation', 'reportUrl', 'reportArtifacts', 'fileArtifacts',
                 'streamBlocks', 'sources', 'videos', 'actionLinks', 'lang'}


class FavoriteSnapshot(BaseModel):
    model_config = ConfigDict(extra='forbid')
    question: str = Field(min_length=1, max_length=50000)
    title: str = Field(default='', max_length=160)
    answer: dict


class FavoriteInput(FavoriteSnapshot):
    category: Literal['mine', 'lane', 'reports', 'charts', 'analysis', 'videos', 'art'] = 'mine'


def snapshot_content(payload):
    question = payload.question.strip()
    answer = {k: v for k, v in payload.answer.items() if k in ANSWER_FIELDS}
    if not question or not any(answer.get(k) for k in ('interpretation', 'reportUrl', 'reportArtifacts', 'streamBlocks', 'videos')):
        raise HTTPException(400, '暂无可收藏的完整内容')
    content = json.dumps(dict(question=question, answer=answer), ensure_ascii=False, sort_keys=True)
    if len(content.encode()) > 2_000_000:
        raise HTTPException(413, '内容过大，无法收藏')
    return content


def _body_excerpt(value):
    text=str(value or '')
    text=re.sub(r'```[\s\S]*?(?:```|$)','',text)
    text=re.sub(r'\[\[(?:AIME_[A-Z_]+(?::[^\]\n]*)?|MENTORA_ANSWER)\]\]','',text)
    text=re.sub(r'<(script|style|svg)\b[^>]*>[\s\S]*?</\1\s*>','',text,flags=re.I)
    text=re.sub(r'<h[1-6]\b[^>]*>[\s\S]*?</h[1-6]\s*>','',text,flags=re.I)
    text=re.sub(r'<[^>]+>',' ',text)
    text=re.sub(r'^\s*#{1,6}\s+.*$','',text,flags=re.M)
    text=re.sub(r'!?\[([^\]]*)\]\(([^)]*)\)',lambda m:'' if re.search(r'/(?:generated|share-artifact)/',m[2]) else m[1],text)
    text=re.sub(r'^\s*(?:[-*>]|\d+[.)])\s+','',text,flags=re.M)
    text=text.replace('**','').replace('__','').replace('`','')
    return ' '.join(html.unescape(text).split())[:140]

class _Paragraphs(HTMLParser):
    def __init__(self):
        super().__init__();self.parts=None;self.paragraphs=[];self.ignored=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','svg','head'):self.ignored+=1
        if tag=='p' and not self.ignored:self.parts=[]
    def handle_data(self,data):
        if self.parts is not None and not self.ignored:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag=='p' and self.parts is not None:
            self.paragraphs.append(''.join(self.parts));self.parts=None
        if tag in ('script','style','svg','head'):self.ignored=max(0,self.ignored-1)

def answer_preview(answer,generated_dir=None):
    """Use public answer prose, never the question or private tool progress."""
    answer=answer if isinstance(answer,dict) else {}
    text=_body_excerpt(answer.get('interpretation'))
    if text:return text
    blocks=answer.get('streamBlocks') if isinstance(answer.get('streamBlocks'),list) else []
    prose=[]
    for block in blocks:
        if not isinstance(block,dict) or block.get('kind')!='text':continue
        data=block.get('data') if isinstance(block.get('data'),dict) else {}
        if not data.get('provisional'):prose.append(str(block.get('text') or data.get('text') or ''))
    text=_body_excerpt('\n'.join(prose))
    if text:return text
    for document in _artifact_documents(answer, generated_dir):
        parser=_Paragraphs();parser.feed(document)
        paragraphs=[_body_excerpt(value) for value in parser.paragraphs]
        text=next((value for value in paragraphs if len(value)>=20),next((value for value in paragraphs if value),''))
        if text:return text
    return ''

def _artifact_documents(answer, generated_dir):
    """Inspect bounded local artifacts only; never fetch links or follow traversal."""
    if not generated_dir:return
    root=Path(generated_dir).resolve()
    artifacts=answer.get('reportArtifacts') if isinstance(answer.get('reportArtifacts'),list) else []
    seen=set()
    for item in [*artifacts,{'url':answer.get('reportUrl')}]:
        if not isinstance(item,dict):continue
        url=urlsplit(str(item.get('url') or item.get('htmlUrl') or ''))
        if url.scheme or url.netloc:continue
        match=re.fullmatch(r'/(?:[^/]+/)?(?:generated|share-artifact)/([^/]+\.html)',url.path)
        if not match:continue
        path=(root/unquote(match[1])).resolve()
        if path in seen or root not in path.parents or not path.is_file():continue
        seen.add(path)
        try:
            with path.open(encoding='utf-8') as handle:yield handle.read(524288)
        except (OSError,UnicodeError):continue


def _component_names():
    # Share the component library's Chinese names without loading its renderers.
    rows=json.loads((Path(__file__).parent/'static/widget-catalog.json').read_text())
    names={row['id']:row['title'] for row in rows}
    names.update(kline='K线图',smart_money='聪明钱',multi_intraday='多股分时',
                 capital_structure='资本结构',key_statistics='关键统计数据')
    return names


def _document_component_names(document):
    from app.widget_capabilities import GENERIC_TITLES
    document=html.unescape(document).lower()
    if 'data-image-search-gallery' in document:return ['搜图']
    if 'streamviz' in document:return ['可视化报告']
    names=_component_names()
    # Container identities take priority over their embedded child charts.
    for marker,key in [('multi-politician-performance','politician_performance'),
                       ('multi-intraday','multi_intraday'),('multi-kline','multi_kline')]:
        if re.search(r'class=["\'][^"\']*\b'+marker+r'\b',document):return [names[key]]
    identities=[]
    for attribute in re.findall(r'\b(?:id|class|data-component-type)=["\']([^"\']+)["\']',document):
        for token in attribute.split():
            token=re.sub(r'-(?:meta|component|root)$','',token).replace('-','_')
            if token in names and not token.startswith('tv_'):identities.append(names[token])
    if identities:return list(dict.fromkeys(identities))
    if 'tradingview' in document:
        for widget,name in names.items():
            if widget.startswith('tv-') and ('embed-widget-'+widget[3:]) in document:return [name]
        if 'tv.js' in document:return ['高级图表']
    aliases={'bar':'bar_chart','line':'line_chart','group-line':'group_line','grouped-bar':'grouped_bar',
             'bar-line':'bar_line','double-ring-pie':'double_ring_pie'}
    for value in re.findall(r'["\'](?:type|chartName)["\']\s*:\s*["\']([^"\']+)["\']',document,re.I):
        key=value.replace('-','_')
        if key in names:return [names[key]]
        generic=aliases.get(value,key)
        if generic in GENERIC_TITLES:return [GENERIC_TITLES[generic]]
    if re.search(r'data-component-type=["\']icons?["\']',document):return ['图标']
    return ['金融图表'] if 'data-business-title' in document else ['可视化报告']


def answer_component_tag(answer, generated_dir=None, category='mine'):
    """Name the rendered components in Chinese, independently of storage category."""
    labels=[]
    for document in _artifact_documents(answer,generated_dir):
        labels.extend(_document_component_names(document))
    blocks=answer.get('streamBlocks') if isinstance(answer.get('streamBlocks'),list) else []
    artifacts=answer.get('reportArtifacts') if isinstance(answer.get('reportArtifacts'),list) else []
    if any(isinstance(item,dict) and (item.get('kind')=='image' or re.search(r'\.(?:png|jpe?g|webp|gif)(?:[?#]|$)',str(item.get('url') or ''))) for item in [*blocks,*artifacts]):labels.append('图片')
    if re.search(r'!\[[^\]]*\]\(|\[\[AIME_IMAGE:',str(answer.get('interpretation') or '')):labels.append('图片')
    if answer.get('videos') or any(isinstance(item,dict) and item.get('kind')=='video' for item in blocks):labels.append('视频')
    if not labels:
        labels.append({'reports':'可视化报告','charts':'金融图表','analysis':'数据分析','videos':'视频','art':'绘图'}.get(category,'图文分析'))
    # A business card is named for its business component, not helper plots.
    from app.widget_capabilities import GENERIC_TITLES
    if any(label in set(_component_names().values()) for label in labels):
        labels=[label for label in labels if label not in set(GENERIC_TITLES.values())]
    return ' · '.join(dict.fromkeys(labels))


def create_router(store):
    router = APIRouter(prefix='/api/case-favorites')
    with store.db() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS case_favorites(
            owner TEXT NOT NULL,id TEXT NOT NULL,category TEXT NOT NULL,
            metadata TEXT NOT NULL,payload TEXT NOT NULL,created TEXT NOT NULL,
            PRIMARY KEY(owner,id))''')

    def owner(request, response, write=False):
        if write and (request.headers.get('x-veya-day') != '1' or
                      request.headers.get('sec-fetch-site') == 'cross-site'):
            raise HTTPException(403, '请从收藏入口操作')
        response.headers['Cache-Control'] = 'no-store'
        return identity(request, response)

    @router.get('')
    def listing(request: Request, response: Response):
        user = owner(request, response)
        with store.db() as db:
            rows = db.execute('SELECT metadata,payload FROM case_favorites WHERE owner=? ORDER BY created DESC,id', (user,))
            cases=[]
            for row in rows:
                metadata=json.loads(row['metadata'])
                answer=json.loads(row['payload']).get('answer') or {}
                metadata['preview']=answer_preview(answer,store.directory.parent/'generated')
                metadata['tag']=answer_component_tag(answer,store.directory.parent/'generated',metadata.get('category','mine'))
                cases.append(metadata)
            return dict(cases=cases)

    @router.post('')
    def save(payload: FavoriteInput, request: Request, response: Response):
        user = owner(request, response, True)
        question = payload.question.strip()
        content = snapshot_content(payload)
        fingerprint = hashlib.sha256(content.encode()).hexdigest()
        key = 'favorite-' + hashlib.sha256((user + payload.category + fingerprint).encode()).hexdigest()[:32]
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        metadata = dict(id=key, category=payload.category, title=payload.title.strip() or question[:40],
                        question=question, preview=answer_preview(payload.answer,store.directory.parent/'generated'), tag=answer_component_tag(payload.answer,store.directory.parent/'generated',payload.category),
                        cachedDate=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),
                        conversationUrl='/api/case-favorites/' + key, personal=True,
                        fingerprint=fingerprint)
        with store.db() as db:
            db.execute('BEGIN IMMEDIATE')
            existing = db.execute('SELECT metadata FROM case_favorites WHERE owner=? AND id=?', (user, key)).fetchone()
            if existing:
                saved=json.loads(existing['metadata']);saved.update(preview=metadata['preview'],tag=metadata['tag']);return saved
            db.execute('INSERT INTO case_favorites VALUES(?,?,?,?,?,?)',
                       (user, key, payload.category, json.dumps(metadata, ensure_ascii=False), content, now))
        return metadata

    @router.delete('')
    def remove(payload: FavoriteSnapshot, request: Request, response: Response):
        """Remove only this owner's exact answer snapshot, across its modules."""
        user = owner(request, response, True)
        fingerprint = hashlib.sha256(snapshot_content(payload).encode()).hexdigest()
        with store.db() as db:
            db.execute('BEGIN IMMEDIATE')
            rows = db.execute("SELECT id FROM case_favorites WHERE owner=? AND json_extract(metadata,'$.fingerprint')=?", (user, fingerprint)).fetchall()
            ids = [row['id'] for row in rows]
            db.execute("DELETE FROM case_favorites WHERE owner=? AND json_extract(metadata,'$.fingerprint')=?", (user, fingerprint))
        return dict(removedIds=ids, removedCount=len(ids), fingerprint=fingerprint)

    @router.post('/status')
    def status(payload: FavoriteSnapshot, request: Request, response: Response):
        """Read-only lookup shares the save serializer, including numeric values."""
        user = owner(request, response, True)
        fingerprint = hashlib.sha256(snapshot_content(payload).encode()).hexdigest()
        with store.db() as db:
            rows = db.execute("SELECT category FROM case_favorites WHERE owner=? AND json_extract(metadata,'$.fingerprint')=?", (user, fingerprint)).fetchall()
        return dict(saved=bool(rows), categories=[row['category'] for row in rows])

    @router.get('/{case_id}')
    def read(case_id: str, request: Request, response: Response):
        user = owner(request, response)
        with store.db() as db:
            row = db.execute('SELECT payload FROM case_favorites WHERE owner=? AND id=?', (user, case_id)).fetchone()
        if not row: raise HTTPException(404, '案例不存在')
        return json.loads(row['payload'])

    return router
