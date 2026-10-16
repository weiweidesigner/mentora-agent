#!/usr/bin/env python3
"""Regenerate homepage TradingView cases by executing the official widget CLI.

No LLM transcript or market values are synthesized. The checked-in configuration,
artifact hash and measured CLI duration describe exactly what was executed.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from app import widget_library as library

def write_json(path, data):
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

def main():
    directory=json.loads((ROOT/'app/static/tradingview-directory.json').read_text())
    manifest_path=ROOT/'app/static/cases/inspiration/manifest.json'
    manifest=json.loads(manifest_path.read_text())
    previous={r['widget']:r for r in manifest['cases'] if r.get('tool')=='TradingViewChart'}
    groups={g['id']:g for g in directory['groups']}
    now=datetime.now(ZoneInfo('Asia/Shanghai')).isoformat()
    date=now[:10]
    rows=[]
    renderer=library.renderer()
    with tempfile.TemporaryDirectory() as temp:
        for meta in directory['widgets']:
            widget=meta['widget']
            item_id=previous.get(widget,{}).get('id','tradingview-'+widget)
            path=ROOT/'app/static/cases/inspiration'/item_id
            path.mkdir(parents=True,exist_ok=True)
            # Use the same validated input conversion as the live Widget library.
            generated=library.build_widget(library.TradingViewInput(widget=widget,symbols=meta['symbols']),Path(temp))
            config={**generated['config'],**meta['config']}
            title=meta['title']+' · '+meta['example']
            html_path=path/'widget.html'
            payload_path=Path(temp)/(widget+'.json')
            command=[sys.executable,str(ROOT/'app/skills/trading-view-chart/scripts/trading_view_chart.py'),
                     '--widget',widget,'--language','zh-CN','--theme','dark',
                     '--title',title,'--config-json',json.dumps(config,ensure_ascii=False),
                     '--output',str(html_path),'--payload-output',str(payload_path)]
            started=int(time.time()*1000)
            subprocess.run(command,check=True,capture_output=True,text=True)
            ended=int(time.time()*1000)
            payload=json.loads(payload_path.read_text())
            payload['output']=f'/static/cases/inspiration/{item_id}/widget.html'
            write_json(path/'widget-config.json',payload)
            artifact_path=f'case:inspiration/{item_id}/widget.html'
            url=payload['output']
            question=f'用 TradingView 查看{meta["example"]}。'
            interpretation=(f'### {meta["title"]} · {meta["officialName"]}\n\n{meta["description"]}\n\n'
                            f'本例展示**{meta["example"]}**。\n\n[[AIME_CHART:{artifact_path}]]\n\n'
                            '图内数据由 TradingView 在浏览器中加载和更新；不同交易所可能存在延迟或可用性限制。'
                            '案例保存的是组件配置，报价、新闻、日历和指标以打开后的组件显示为准。')
            answer={'question':question,'code':'','selectedSkill':{'key':'trading-view-chart','label':'TradingViewChart','script':'trading_view_chart.py'},
                    'htmlUrl':url,'reportUrl':url,'reportArtifacts':[{'path':artifact_path,'url':url,'title':title}],
                    'interpretation':interpretation,'sources':[{'siteName':'TradingView','url':renderer.CATALOG[widget]['docs'],'title':meta['officialName']}],
                    'videos':[],'actionLinks':[],'lang':'zh-CN'}
            digest=hashlib.sha256(html_path.read_bytes()).hexdigest()
            cached={'question':question,'cachedAt':now,'answer':answer,
                    'activity':{'label':'组件生成记录','elapsedMs':ended-started,'startedAt':started,'endedAt':ended,
                                'durationSource':'measured-cli','steps':[{'title':'生成官方 '+meta['officialName'],
                                'detail':f'调用：TradingViewChart\n组件：{widget}\n已生成并核对官方加载配置。','state':'done','elapsedMs':ended-started}],
                                'stages':[{'name':'官方组件生成','startedAt':started,'endedAt':ended,'elapsedMs':ended-started}]},
                    'provenance':{'generation':'executed-official-widget-cli','renderer':'trading_view_chart.py','sample':False,'widget':widget,
                                  'configUrl':url.replace('widget.html','widget-config.json'),'artifactSha256':digest,
                                  'sourceAnswerSha256':hashlib.sha256(interpretation.encode()).hexdigest(),
                                  'officialDocs':renderer.CATALOG[widget]['docs'],'marketData':'TradingView-hosted; browser-loaded; no numeric values synthesized',
                                  'executedAt':now,'exitCode':0}}
            write_json(path/'conversation.json',cached)
            rows.append({'id':item_id,'title':meta['example'],'mobileTitle':meta['title'],'tag':meta['title'],
                         'question':question,'preview':meta['description'],'cachedDate':date,
                         'conversationUrl':f'/static/cases/inspiration/{item_id}/conversation.json','category':'charts',
                         'featured':True,'generation':'executed-official-widget-cli','tool':'TradingViewChart','widget':widget,
                         'widgetGroup':meta['group'],'officialName':meta['officialName'],'officialDescription':meta['description']})
    manifest['cases']=rows+[r for r in manifest['cases'] if r.get('tool')!='TradingViewChart']
    manifest['tradingViewGroups']=directory['groups']
    manifest['version']=6
    manifest['cachedAt']=now
    write_json(manifest_path,manifest)
    catalog_path=ROOT/'app/static/widget-catalog.json'
    catalog=json.loads(catalog_path.read_text())
    metadata={m['widget']:m for m in directory['widgets']}
    for item in catalog:
        if item.get('provider')!='TradingView':continue
        meta=metadata[item['widget']]
        item['category']=groups[meta['group']]['title']
        item['officialName']=meta['officialName']
        item['widgetGroup']=meta['group']
        if not item.get('preset'):
            item['title']=meta['title']
            item['description']=meta['description']
    write_json(catalog_path,catalog)
    print(f'Executed and verified {len(rows)} official widget cases; updated {len(directory["groups"])} groups.')

if __name__=='__main__':main()
