"""On-demand public Stock Heatmap selections; no quote cache or account actions."""
from typing import Literal
from threading import BoundedSemaphore
from fastapi import APIRouter, HTTPException, Query, Response
from app.artifact_upgrades import _native_rating

router = APIRouter(prefix='/api/stock-heatmap', tags=['stock-heatmap'])
_slots = BoundedSemaphore(4)

@router.get('/data')
def stock_heatmap_data(response: Response,
    kind: Literal['universe','themes','theme','sector'],
    universe: Literal['sp500','nasdaq100','nasdaq_composite','nyse_composite','dji','all_stocks']='sp500',
    code: str | None = Query(default=None, pattern=r'^89:\d{6}$')):
    response.headers['Cache-Control']='no-store'
    if kind in ('theme','sector') and code is None:
        raise HTTPException(422, 'Source group is required')
    if not _slots.acquire(blocking=False):
        raise HTTPException(429, 'Heatmap source busy; retry selection')
    try:
        return _native_rating('stock_heatmap').fetch_selection(kind,universe,code)
    except (RuntimeError, ValueError):
        raise HTTPException(502, 'AInvest heatmap source unavailable') from None
    finally:
        _slots.release()
