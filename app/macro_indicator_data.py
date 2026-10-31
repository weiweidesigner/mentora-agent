"""Source-backed selections for the single native AInvest macro business chart."""
from types import SimpleNamespace
from threading import BoundedSemaphore
from fastapi import APIRouter, HTTPException, Query, Response
from app.artifact_upgrades import _native_rating

router=APIRouter(prefix='/api/macro-indicator',tags=['macro-indicator'])
_slots=BoundedSemaphore(4)

@router.get('/data')
def macro_indicator_data(response: Response,
    country: str=Query(pattern=r'^[A-Z]{2}$'),
    indicator: str=Query(pattern=r'^[A-Z0-9_]{1,40}$'),
    include_catalog: bool=False):
    response.headers['Cache-Control']='no-store'
    if not _slots.acquire(blocking=False):
        raise HTTPException(429,'Macro source busy; retry selection')
    try:
        native=_native_rating('macro_indicator')
        raw=native.fetch_data(SimpleNamespace(country=country,indicator=indicator,symbol=None,
            include_catalog=include_catalog,list_countries=False,list_indicators=False))
        payload=native.normalize(raw)
        return {**payload,'type':'macro-indicator','source':native.source_metadata(payload['symbol'])}
    except (RuntimeError,ValueError,KeyError,TypeError):
        raise HTTPException(502,'AInvest macro source unavailable') from None
    finally:
        _slots.release()
