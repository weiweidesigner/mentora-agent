"""On-demand windows from the registered standalone Congress disclosures component."""
from functools import lru_cache
import importlib.util
from pathlib import Path
from threading import BoundedSemaphore
from fastapi import APIRouter, HTTPException, Query, Response
from app.skill_runner import _registered_script

router=APIRouter()
ROOT=Path(__file__).resolve().parents[1]
_workers=BoundedSemaphore(4)

@lru_cache(maxsize=1)
def component():
    # Cache code only. No source rows, sessions or credentials are retained.
    path,_=_registered_script('congress_recent_trades.py',ROOT)
    spec=importlib.util.spec_from_file_location('native_congress_recent_trades',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

@router.get('/api/congress-recent-trades')
def recent_trades(response:Response,cursor:int=Query(default=1,ge=1,le=100000),direction:str=Query(default='all',pattern='^(all|buy|sell)$'),from_date:str='',to_date:str='',all_dates:bool=False):
    response.headers['Cache-Control']='no-store'
    native=component()
    try:
        native.validate_filters(direction,from_date,to_date)
        if all_dates and (from_date or to_date):raise ValueError('Conflicting date scope')
    except ValueError:raise HTTPException(400,'Invalid date range') from None
    if not _workers.acquire(blocking=False):raise HTTPException(429,'Please wait for the current disclosure request')
    try:
        return native.fetch_window(cursor,direction,from_date,to_date,timeout=6,all_dates=all_dates)
    except (ValueError,RuntimeError,TypeError):raise HTTPException(502,'AInvest disclosures are unavailable') from None
    finally:_workers.release()
