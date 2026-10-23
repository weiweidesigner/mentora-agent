"""Run genuine Mentora conversations. Cache publication is a separate verified step."""
from __future__ import annotations
import argparse,concurrent.futures,datetime,json,re,shutil,time,urllib.parse,urllib.request,uuid
from pathlib import Path
from zoneinfo import ZoneInfo
QUESTIONS={
'advanced-chart':'用 TradingView 的 Advanced Chart 高级图表给我展示苹果日线，加上成交量和均线，方便我自己切换周期查看。',
'symbol-overview':'用 TradingView 的 Symbol Overview 把苹果、微软和英伟达放在同一个走势概览里，方便我切换比较。',
'mini-chart':'用 TradingView 的 Mini Chart 给我一张特斯拉近一年的迷你走势图，简单说说如何使用这张图。',
'seasonal-chart':'用 TradingView 的 Seasonal Chart 季节性图表展示苹果历年走势，让我对照不同年份的季节变化。',
'market-overview':'用 TradingView 的 Market Overview 做个全球市场概览，把指数、期货、债券和外汇分组展示。',
'stock-market':'用 TradingView 的 Stock Market 股票市场组件展示美股活跃股、涨幅榜和跌幅榜，让我自己浏览比较。',
'market-data':'用 TradingView 的 Market Data 把苹果、微软、英伟达和特斯拉整理成行情列表，方便一起看报价。',
'market-summary':'用 TradingView 的 Market Summary 做一个美股市场动态摘要，我想查看市场表现和重点标的。',
'world-market-summary':'用 TradingView 的 World Market Summary 展示全球股票市场指数地图，方便比较不同市场。',
 'ticker-tape':'用 TradingView 的 Ticker Tape 做一条苹果、微软和英伟达滚动行情条，方便我放在旁边看。',
 'single-ticker':'我关注英伟达，用 TradingView 的 Single Ticker 给我一张单股报价卡，快速看价格和涨跌。',
 'tickers':'用 TradingView 的 Tickers 把苹果、微软和英伟达报价卡片并排放在一起，方便对照。',
 'ticker-tag':'用 TradingView 的 Ticker Tag 给我展示苹果的紧凑行情标签，包含标的和涨跌。',
 'stock-heatmap':'用 TradingView 的 Stock Heatmap 看看标普500，按行业分组，让我直观看板块和股票的涨跌分布。',
 'crypto-heatmap':'用 TradingView 的 Crypto Coins Heatmap 展示数字货币市场热力图，说明面积和颜色如何读。',
 'etf-heatmap':'用 TradingView 的 ETF Heatmap 展示美国ETF热力图，方便我按资产类别浏览和比较。',
 'forex-cross-rates':'用 TradingView 的 Forex Cross Rates 展示美元、欧元、日元和英镑交叉汇率，方便互相比较。',
 'forex-heatmap':'用 TradingView 的 Forex Heatmap 展示主要货币日内强弱热力图，说明行列怎么读。',
 'forex-table':'用 TradingView 的 Forex Table 做一个美元、欧元、日元和英镑的汇率矩阵，方便对照货币汇率。',
 'screener':'用 TradingView 的 Screener 打开美股筛选器，我想按市值、估值和涨跌幅自己筛选股票。',
 'crypto-mkt-screener':'用 TradingView 的 Cryptocurrency Market 展示美元计价的数字货币行情筛选列表，方便比较价格、市值和涨跌。',
 'symbol-info':'用 TradingView 的 Symbol Info 商品信息卡片展示英伟达行情摘要和基本交易信息。',
 'technical-analysis':'用 TradingView 的 Technical Analysis 展示 AMD 技术分析摘要，我想对照振荡指标和均线，并自己切换周期。',
 'fundamental-data':'用 TradingView 的 Fundamental Data 展示微软财务数据面板，说明收入和盈利指标应该怎么读。',
 'company-profile':'英伟达主要做什么业务？用 TradingView 的 Company Profile 公司简介展示一下公司背景。',
 'top-stories':'用 TradingView 官方 Top Stories 做一个新闻阅读组件，保留原生新闻列表和报道跳转链接。只需要这个组件和简短使用说明，不需要另做新闻盘点或自制仪表盘。',
 'economic-calendar':'用 TradingView 的 Economic Calendar 展示美国、欧洲和中国的经济日历，让我按重要程度查看数据发布时间。',
 'broker-rating':'用 TradingView 的 Broker Rating 展示 easyMarkets 经纪商用户评分，说明评分应该如何理解。',
 'broker-reviews':'用 TradingView 的 Broker Reviews 展示 easyMarkets 用户评论，方便我浏览评价详情。',
 'economic-map':'用 TradingView 的 Economic Map 展示全球 GDP 经济地图，让我比较不同经济体的规模。',
}

def run(widget,base,out):
 folder=out/widget;folder.mkdir(parents=True,exist_ok=True)
 if (folder/'accepted.json').exists():return widget,'accepted-existing'
 if (folder/'events.jsonl').exists():
  archive=folder/'attempts'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S');archive.mkdir(parents=True)
  for previous in list(folder.iterdir()):
   if previous.is_file():shutil.move(str(previous),archive/previous.name)
 session='tradingview-real-'+widget+'-'+uuid.uuid4().hex
 question=QUESTIONS[widget]
 body={'question':question,'sessionId':session,'themeMode':'dark'}
 started=datetime.datetime.now(ZoneInfo('Asia/Shanghai'));start=time.monotonic();events=[];kind=''
 print('START '+widget,flush=True)
 try:
  req=urllib.request.Request(base+'/api/chat/stream',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=600) as response,(folder/'events.jsonl').open('w') as log:
   for raw in response:
    line=raw.decode().strip()
    if line.startswith('event:'):kind=line[6:].strip()
    elif line.startswith('data:'):
     try:data=json.loads(line[5:].strip())
     except ValueError:continue
     event={'event':kind,'data':data,'elapsedMs':round((time.monotonic()-start)*1000)}
     events.append(event);log.write(json.dumps(event,ensure_ascii=False)+'\n');log.flush()
  final=next((e['data'] for e in reversed(events) if e['event']=='final'),None)
  if not final:raise ValueError('No final answer returned')
  if any(e['event']=='error' for e in events):raise ValueError('Error event in stream')
  (folder/'final.json').write_text(json.dumps(final,ensure_ascii=False,indent=2))
  found=[];files=[]
  for artifact in final.get('reportArtifacts') or []:
   parsed=urllib.parse.urlparse(artifact.get('url') or '')
   path=parsed.path.removeprefix('/mentora')
   if not path.startswith(('/generated/','/share-artifact/')) or not path.endswith('.html'):continue
   with urllib.request.urlopen(base+path,timeout=40) as response:document=response.read().decode()
   name=Path(path).name;(folder/name).write_text(document);files.append(name)
   match=re.search(r'<script\b[^>]*\bid=["\']tv-config["\'][^>]*>(.*?)</script>',document,re.S)
   if match:found.append(json.loads(match.group(1)).get('widget'))
  meta={'question':question,'sessionId':session,'startedAt':started.isoformat(),'elapsedMs':round((time.monotonic()-start)*1000),'widgets':found,'artifacts':files,'agentRunId':final.get('agentRunId')}
  (folder/'metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
  if widget not in found:raise ValueError('Expected widget missing: '+widget+'; found '+','.join(found))
  if not final.get('interpretation'):raise ValueError('Empty answer')
  if not any(e['event']=='tool_step' and e['data'].get('phase')=='completed' for e in events):raise ValueError('No completed tool records')
  (folder/'accepted.json').write_text(json.dumps({'widget':widget,'agentRunId':final.get('agentRunId'),'elapsedMs':meta['elapsedMs']}))
  print('DONE '+widget+' '+str(round(time.monotonic()-start,1))+'s',flush=True)
  return widget,'accepted'
 except Exception as exc:
  (folder/'error.txt').write_text(str(exc));print('FAILED '+widget+' '+str(exc)[:150],flush=True);return widget,'failed'

def main():
 p=argparse.ArgumentParser();p.add_argument('--base-url',default='http://127.0.0.1:8000');p.add_argument('--run-dir',type=Path,required=True);p.add_argument('--workers',type=int,default=2);p.add_argument('widgets',nargs='*',choices=list(QUESTIONS));a=p.parse_args()
 with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
  results=list(pool.map(lambda w:run(w,a.base_url.rstrip('/'),a.run_dir),a.widgets or list(QUESTIONS)))
 print(json.dumps(results),flush=True)
if __name__=='__main__':main()
