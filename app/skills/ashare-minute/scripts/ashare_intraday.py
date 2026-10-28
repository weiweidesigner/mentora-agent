#!/usr/bin/env python3
"""Fetch recent five-session CN minute data once and compose native daily charts."""
from __future__ import annotations
import argparse
import html
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
sys.path.insert(0,str(ROOT))
from app.ashare_live import minute_snapshot
from app.artifact_upgrades import _native_multi_intraday


def build_report(symbol, output, *, days=5, dates=None, theme='dark', language='zh-CN', title=None):
    snapshot=minute_snapshot(symbol,days)
    requested=[day.strip() for day in (dates or '').split(',') if day.strip()]
    missing=[day for day in requested if day not in snapshot['dates']]
    if missing:raise ValueError('所选日期不在东方财富返回的最近五个交易日内：'+', '.join(missing))
    selected=sorted(set(requested)) if requested else snapshot['dates']
    payload={'type':'multi-intraday','title':title or f"{snapshot['name']} · 近 {len(selected)} 个交易日分时",
             'props':{'symbols':[snapshot['symbol']],'dates':selected,'timezone':'Asia/Shanghai',
                      'theme':theme,'language':language,'columns':1,'mobileColumns':1,'subIndicators':['VOL']},
             'cards':[{'symbol':snapshot['symbol'],'name':snapshot['name'],'date':day,
                       'data':snapshot['rowsByDate'][day],'source':'eastmoney','reliableVolume':True} for day in selected]}
    native=_native_multi_intraday();config=native._validate_payload(payload)
    document=native.render_document(payload['title'],native.build_cards(config),config)
    warning=snapshot.get('coverageWarning') if not requested else None
    if warning:document=document.replace('<body>', '<body><p role="status">'+html.escape(warning)+'</p>',1)
    path=Path(output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(document,encoding='utf-8')
    return {'html':str(path.resolve()),'symbol':snapshot['symbol'],'source':snapshot['source'],
            'dates':selected,'barCounts':{day:len(snapshot['rowsByDate'][day]) for day in selected},
            'dataTime':snapshot['dataTime'],'cachePolicy':'no-store',
            'coverageWarning':f'请求最近 {days} 个交易日，数据源仅返回 {len(selected)} 天。' if not requested and len(selected)<days else None,
            'baseline':'分时涨跌以各日开盘为基准，不等同较昨收涨跌。'}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--symbol',required=True,help='Explicit SH/SZ listing or index, e.g. 000001.SH')
    p.add_argument('--days',type=int,choices=range(1,6),default=5)
    p.add_argument('--dates',help='Comma-separated YYYY-MM-DD dates within returned five-session window')
    p.add_argument('--theme',choices=['dark','light'],default='dark')
    p.add_argument('--language',choices=['zh-CN','zh-Hant','en'],default='zh-CN')
    p.add_argument('--title');p.add_argument('--output',required=True)
    args=p.parse_args()
    try:print(json.dumps(build_report(args.symbol,args.output,days=args.days,dates=args.dates,theme=args.theme,language=args.language,title=args.title),ensure_ascii=False))
    except (ValueError,RuntimeError) as exc:
        print(json.dumps({'error':str(exc),'cachePolicy':'no-store'},ensure_ascii=False));return 1
    return 0

if __name__=='__main__':raise SystemExit(main())
