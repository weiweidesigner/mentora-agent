"""Display an explicitly requested non-equity market chart via the existing Skill."""
import re
import subprocess
import sys
import uuid


def requested_market_chart(payload,root):
    question=payload.question
    match=re.search(r'\b(XAU\s*/?\s*USD|XAG\s*/?\s*USD|BTC\s*/?\s*USDT?|ETH\s*/?\s*USDT?|EUR\s*/?\s*USD|USD\s*/?\s*JPY)\b',question,re.I)
    if not match:return None
    code=re.sub(r'[\s/]','',match[0]).upper()
    interval=re.search(r'\b(1|3|5|15|30|60)\s*(?:m|min(?:ute)?s?)\b|(1|3|5|15|30|60)\s*分钟',question,re.I)
    if not interval and not re.search(r'chart|K\s*线|图表|走势',question,re.I):return None
    period=next((part for part in interval.groups() if part),None) if interval else 'D'
    symbol=('BINANCE:'+code.replace('BTCUSD','BTCUSDT').replace('ETHUSD','ETHUSDT')) if code in {'BTCUSD','ETHUSD'} else ('BINANCE:'+code if code.endswith('USDT') else 'OANDA:'+code)
    directory=root/'outputs/generated';directory.mkdir(parents=True,exist_ok=True)
    path=directory/('market-chart-'+uuid.uuid4().hex+'.html')
    script=root/'app/skills/trading-view-chart/scripts/trading_view_chart.py'
    title=f'{symbol} · {period+"分钟" if period.isdigit() else "日线"}'
    subprocess.run([sys.executable,str(script),'--widget','advanced-chart','--symbol',symbol,'--interval',period,
                    '--theme',payload.themeMode,'--language','zh-CN','--title',title,'--output',str(path)],check=True,capture_output=True,text=True,timeout=30)
    if not path.is_file() or not path.stat().st_size:raise RuntimeError('请求的行情图表未生成')
    return dict(path=str(path),url='/generated/'+path.name,label=title,script='trading_view_chart.py',dataStatus='display-only')
