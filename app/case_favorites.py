"""Owner-scoped homepage case snapshots. Saving never publishes or runs research."""
import datetime as dt
import hashlib
import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from app.chat_sessions import identity

CATEGORIES = {'lane': '泳道', 'reports': '市场报告', 'charts': '金融图表',
              'analysis': '数据分析', 'videos': '金融视频', 'art': '艺术绘图'}
ANSWER_FIELDS = {'interpretation', 'reportUrl', 'reportArtifacts', 'fileArtifacts',
                 'streamBlocks', 'sources', 'videos', 'actionLinks', 'lang'}


class FavoriteSnapshot(BaseModel):
    model_config = ConfigDict(extra='forbid')
    question: str = Field(min_length=1, max_length=50000)
    title: str = Field(default='', max_length=160)
    answer: dict


class FavoriteInput(FavoriteSnapshot):
    category: Literal['lane', 'reports', 'charts', 'analysis', 'videos', 'art']


def snapshot_content(payload):
    question = payload.question.strip()
    answer = {k: v for k, v in payload.answer.items() if k in ANSWER_FIELDS}
    if not question or not any(answer.get(k) for k in ('interpretation', 'reportUrl', 'reportArtifacts', 'streamBlocks', 'videos')):
        raise HTTPException(400, '暂无可收藏的完整内容')
    content = json.dumps(dict(question=question, answer=answer), ensure_ascii=False, sort_keys=True)
    if len(content.encode()) > 2_000_000:
        raise HTTPException(413, '内容过大，无法收藏')
    return content


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
            rows = db.execute('SELECT metadata FROM case_favorites WHERE owner=? ORDER BY created DESC,id', (user,))
            return dict(cases=[json.loads(row['metadata']) for row in rows])

    @router.post('')
    def save(payload: FavoriteInput, request: Request, response: Response):
        user = owner(request, response, True)
        question = payload.question.strip()
        content = snapshot_content(payload)
        fingerprint = hashlib.sha256(content.encode()).hexdigest()
        key = 'favorite-' + hashlib.sha256((user + payload.category + fingerprint).encode()).hexdigest()[:32]
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        metadata = dict(id=key, category=payload.category, title=payload.title.strip() or question[:40],
                        question=question, preview=question[:140], tag='收藏',
                        cachedDate=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat(),
                        conversationUrl='/api/case-favorites/' + key, personal=True,
                        fingerprint=fingerprint)
        with store.db() as db:
            db.execute('BEGIN IMMEDIATE')
            existing = db.execute('SELECT metadata FROM case_favorites WHERE owner=? AND id=?', (user, key)).fetchone()
            if existing: return json.loads(existing['metadata'])
            db.execute('INSERT INTO case_favorites VALUES(?,?,?,?,?,?)',
                       (user, key, payload.category, json.dumps(metadata, ensure_ascii=False), content, now))
        return metadata

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
