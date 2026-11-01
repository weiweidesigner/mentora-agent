"""Read the fixed AInvest earnings-calendar resources observed in its official UI."""
from __future__ import annotations
import argparse
from contextlib import nullcontext
from datetime import date, datetime, timezone
import json
import math
from pathlib import Path
import sys
import uuid
import requests

BASE = 'https://fundamental.ainvest.com/fuyao/america_financial_calendar/'
PAGE_SIZE = 60
PATHS = {'events':'financialCalendar/v1/cateDataList', 'statistics':'financialCalendar/v1/statistic', 'backtest':'financialCalendar/v1/backtest', 'recommendations':'query/v1/recommend'}


def now():
    return datetime.now(timezone.utc).isoformat()


def source_data(envelope):
    if not isinstance(envelope, dict) or 'data' not in envelope:
        raise ValueError('Expected AInvest envelope with data')
    if envelope.get('status_code', 0) not in (0, '0') or envelope.get('code', 0) not in (0, '0', 200, '200'):
        raise ValueError('Source returned an error envelope')
    if envelope['data'] is None:
        raise ValueError('Source data unavailable, not an empty calendar')
    return envelope['data']


def numeric(value):
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        raise ValueError('Boolean is not a financial number')
    number = float(value)
    if not math.isfinite(number):
        raise ValueError('Nonfinite financial number')
    return number


def normalize_events(rows):
    events, seen, invalid = [], set(), 0
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get('uniqueId'), str) or not row['uniqueId']:
            raise ValueError('Source event lacks uniqueId')
        if row.get('eventType') != 'earning':
            raise ValueError('Source returned a non-earnings event')
        if row['uniqueId'] in seen:
            continue
        seen.add(row['uniqueId'])
        earning = row.get('earning')
        if not isinstance(earning, dict):
            raise ValueError('Source event lacks earning object')
        values = {}
        for target, field in [('estimateEps','forecastValue'),('actualEps','actualValue'),('estimateRevenue','forecastRev'),('actualRevenue','actualRev')]:
            try:
                values[target] = numeric(earning.get(field))
            except (ValueError, TypeError, OverflowError):
                values[target] = None
                invalid += 1
        events.append({'id':row['uniqueId'], 'symbol':row.get('symbol'), 'marketId':row.get('marketId'), 'name':row.get('symbolName'), 'companyNameEn':row.get('companyNameEn'), 'eventDate':row.get('eventDate'), 'reportYear':earning.get('reportYear'), 'reportType':earning.get('reportType'), 'disclosureTimeType':earning.get('disclosureTimeType'), **values, 'raw':row})
    return events, {'invalidNumericFields':invalid, 'duplicateEvents':len(rows)-len(events)}



def visitor_session():
    """Use the same standard ephemeral visitor flow as native AInvest components."""
    session=requests.Session();device=str(uuid.uuid4())
    try:
        response=session.post('https://user.ainvest.com/auth/visitor/login', data={'udid':device,'clientType':'WEB'}, headers={'Origin':'https://www.ainvest.com','Referer':'https://www.ainvest.com/','fingerprint':device}, timeout=(5,15), allow_redirects=False)
        if response.status_code!=200 or not response.json().get('data',{}).get('userId') or not session.cookies:
            raise ValueError('Visitor unavailable')
        session.headers.update({'fingerprint':device,'Origin':'https://www.ainvest.com','Referer':'https://www.ainvest.com/market/calendar/','X-Auth-Version':'1.0','X-Auth-Progid':'7047','X-Auth-Select-Market-Level':'uus:level0','Accept-Language':'en'})
        return session
    except (ValueError,TypeError,AttributeError,requests.RequestException):
        session.close()
        raise ValueError('AInvest visitor authentication unavailable; source route ended') from None

def get_json(session, path, params):
    response = session.get(BASE + path, params=params, headers={'Accept':'application/json'}, timeout=(5,30), allow_redirects=False)
    response.raise_for_status()
    if response.status_code != 200 or 'json' not in response.headers.get('Content-Type','').lower():
        raise ValueError('Expected JSON HTTP 200; source route ended')
    return response.json(), response.url


def fetch_events(fetch, params, *, cursor=None, max_pages=None):
    initial_cursor = cursor
    rows, pages, cursors, ids = [], [], set(), set()
    if cursor:
        cursors.add(cursor)
    complete, reason, next_cursor = False, None, cursor
    while True:
        query = {**params, 'eventType':'earning', 'size':PAGE_SIZE}
        if cursor:
            query['startId'] = cursor
        try:
            envelope, url = fetch(PATHS['events'], query)
            batch = source_data(envelope)
            if not isinstance(batch, list) or any(not isinstance(r,dict) for r in batch):
                raise ValueError('Expected event array')
            # Validate the entire page before accepting it; previous pages survive failure.
            normalize_events(batch)
            batch_ids = {r['uniqueId'] for r in batch}
            pages.append({'url':url, 'rows':len(batch), 'fetchedAt':now(), 'i18nMsg':envelope.get('i18nMsg')})
            if batch and not (batch_ids - ids):
                reason = 'page_did_not_advance'
                break
            rows.extend(batch)
            ids.update(batch_ids)
            if len(batch) < PAGE_SIZE:
                complete, next_cursor = True, None
                break
            next_cursor = batch[-1].get('startId')
            if not isinstance(next_cursor,str) or not next_cursor or next_cursor in cursors:
                reason = 'missing_or_repeated_cursor'
                break
            if max_pages is not None and len(pages) >= max_pages:
                reason = 'requested_page_limit'
                break
            cursors.add(next_cursor)
            cursor = next_cursor
        except (requests.RequestException, ValueError, TypeError, KeyError) as exc:
            if not pages:
                raise
            reason = 'source_error_after_partial_success'
            # Preserve the failed page cursor for explicit resumption, never automatically retry.
            next_cursor = cursor
            pages.append({'url':BASE+PATHS['events'], 'ok':False, 'errorType':type(exc).__name__})
            break
    return rows, {'complete':complete, 'stoppedBecause':reason, 'nextCursor':next_cursor, 'pages':pages, 'resumedFromCursor':initial_cursor}



def summarize_backtest(data):
    """Expose existing source statistics without recomputing histories or model prose."""
    if not isinstance(data,dict) or not isinstance(data.get('backtest'),list):
        return {'schemaInspected':False,'schemaWarning':'Unrecognized backtest shape; raw data retained'}
    scenarios=[]
    for entry in data['backtest']:
        if not isinstance(entry,dict):continue
        result=entry.get('backtest_result') or {}
        visual=result.get('visual') if isinstance(result,dict) else None
        value=visual.get('value') if isinstance(visual,dict) else None
        rows=value.get('datas',[]) if isinstance(value,dict) else []
        scenario={'sourceTag':entry.get('tag'),'available':bool(rows),'results':[]}
        for row in rows:
            if not isinstance(row,dict):continue
            backtest=row.get('backtest_result') or {}
            target=backtest.get('target_result') if isinstance(backtest,dict) else None
            if not isinstance(target,dict):continue
            windows=[]
            for window in target.get('stockEventData',[]):
                if isinstance(window,dict):
                    windows.append({key:window.get(key) for key in ('dayIndex','winRate','averageYield','positiveDays')})
            scenario['results'].append({'object':row.get('Backtest Object'),'sourcePeriod':row.get('Backtest Period'),'sampleCount':target.get('targetEventTimes'),'windows':windows})
        scenarios.append(scenario)
    return {'schemaInspected':True,'scenarios':scenarios,'epsObservationCount':len(data.get('periods',[])), 'units':{'winRate':'source fraction, 0.75 = 75%','averageYield':'source percent number, 1.45 = 1.45%; do not multiply by 100','dayIndex':'source horizon label; trading/calendar-day convention not independently verified','sourceTag.value':'probability tags use percent numbers, 75 = 75%; other tag types may contain text'},'methodology':'Provider statistics, not an independent backtest. Keep sample counts; source prose may conflict with structured values.'}

def make_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--operation', choices=list(PATHS), default='events')
    parser.add_argument('--date', help='Disclosure date, YYYY-MM-DD')
    parser.add_argument('--start-date')
    parser.add_argument('--end-date')
    parser.add_argument('--cursor', help='Opaque source startId for explicit resumption')
    parser.add_argument('--max-pages', type=int, help='Optional caller bound; result explicitly remains incomplete')
    parser.add_argument('--country-codes', help='Statistics only, comma-separated source country codes')
    parser.add_argument('--event-id', help='Backtest: exact uniqueId from an events result')
    parser.add_argument('--symbols', nargs='+', help='Recommendations only: stockList context')
    parser.add_argument('--source-input', help='Saved source envelope, envelope list (events), or raw event array; no HTTP')
    parser.add_argument('--output', required=True)
    return parser


def arguments(parser, args):
    if args.date and (args.start_date or args.end_date):
        parser.error('Use --date or a start/end range')
    if args.operation in ('events','statistics'):
        start, end = (args.date,args.date) if args.date else (args.start_date,args.end_date)
        try:
            if not start or not end or date.fromisoformat(start).isoformat()!=start or date.fromisoformat(end).isoformat()!=end or start>end:
                raise ValueError()
        except ValueError:
            parser.error('Supply --date YYYY-MM-DD or a valid --start-date/--end-date range')
        params = {'startDate':start,'endDate':end}
    else:
        if args.date or args.start_date or args.end_date:
            parser.error('Dates apply to events/statistics')
        params = {}
    if args.max_pages is not None and args.max_pages<1:
        parser.error('--max-pages must be positive')
    if (args.cursor or args.max_pages is not None) and args.operation!='events':
        parser.error('Pagination applies to events only')
    if args.country_codes and args.operation!='statistics':
        parser.error('--country-codes is confirmed only for statistics')
    if args.event_id and args.operation!='backtest' or args.symbols and args.operation!='recommendations':
        parser.error('Event identity/symbol context does not match operation')
    if args.operation=='statistics':
        params['scope']='day'
        if args.country_codes:
            codes=[c.strip() for c in args.country_codes.split(',')]
            if not all(c.isascii() and c.isalpha() and c.isupper() and 2<=len(c)<=3 for c in codes):
                parser.error('Expected comma-separated source country codes')
            params['countryCodes']=','.join(codes)
    elif args.operation=='backtest':
        if not args.event_id or not args.event_id.startswith('earning_'):
            parser.error('Backtest requires --event-id from a source event uniqueId')
        params['id']=args.event_id
    elif args.operation=='recommendations':
        if not args.symbols:
            parser.error('Recommendations require --symbols from the current event list')
        params={'userId':'guest','context':json.dumps({'tab':'earnings','stockList':args.symbols},separators=(',',':'))}
    return params


def main():
    parser=make_parser();args=parser.parse_args();params=arguments(parser,args)
    started=now()
    with (nullcontext(None) if args.source_input else visitor_session()) as session:
        fetch=lambda path, query:get_json(session,path,query)
        if args.source_input:
            document=json.loads(Path(args.source_input).read_text())
            if args.operation=='events':
                if isinstance(document,list) and (not document or 'uniqueId' in document[0]):
                    rows=document
                else:
                    envelopes=document if isinstance(document,list) else [document]
                    rows=[]
                    for envelope in envelopes:
                        batch=source_data(envelope)
                        if not isinstance(batch,list):raise ValueError('Expected source event array')
                        rows.extend(batch)
                paging={'complete':False,'stoppedBecause':'offline_input_coverage_unverified','nextCursor':None,'pages':[]}
            else:
                data=source_data(document)
        elif args.operation=='events':
            rows,paging=fetch_events(fetch,params,cursor=args.cursor,max_pages=args.max_pages)
            paging['resumedFromCursor']=args.cursor
        else:
            envelope,url=fetch(PATHS[args.operation],params);data=source_data(envelope)
    source={'provider':'AInvest','url':BASE+PATHS[args.operation], 'parameters':params,'startedAt':None if args.source_input else started, 'completedAt':None if args.source_input else now(), 'transport':'offline-input' if args.source_input else 'https-visitor', 'sourceInput':args.source_input}
    result={'operation':args.operation,'source':source}
    if args.operation=='events':
        events,quality=normalize_events(rows)
        result.update(events=events,pagination=paging,quality=quality)
        summary={'eventCount':len(events),'complete':paging['complete'],'stoppedBecause':paging['stoppedBecause'],'nextCursor':paging['nextCursor'],'pageCount':len(paging['pages']),'quality':quality,'missing':{k:sum(e[k] is None for e in events) for k in ('estimateEps','actualEps','estimateRevenue','actualRevenue')},'sample':[ {k:e[k] for k in ('id','symbol','eventDate','reportYear','reportType','estimateEps','actualEps')} for e in events[:3]]}
    else:
        if args.operation=='statistics' and (not isinstance(data,list) or any(not isinstance(r,dict) or not isinstance(r.get('statistic'),dict) for r in data)):
            raise ValueError('Unexpected statistics schema')
        result['data']=data
        summary=summarize_backtest(data) if args.operation=='backtest' else {'recordCount':len(data) if isinstance(data,list) else None,'sample':data[:3] if args.operation=='statistics' else None,'schemaInspected':args.operation=='statistics'}
    result['limitations']=['Disclosure date differs from fiscal period; source timezone, complete time-type enumeration and currency metadata are not established.','No EPS/revenue surprise fields are invented; raw values and nulls are retained.','Backtest output is source material; methodology and historical performance are not independently validated.']
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,ensure_ascii=False,allow_nan=False,indent=2),encoding='utf-8')
    print(json.dumps({'ok':True,'output':str(output),'summary':{'operation':args.operation,**summary,'source':source}},ensure_ascii=False))


if __name__=='__main__':
    try:
        main()
    except (ValueError,TypeError,OSError,requests.RequestException) as exc:
        print(json.dumps({'ok':False,'error':str(exc)},ensure_ascii=False));sys.exit(1)
