#!/usr/bin/env python3
"""Catalog lookup and real Seed-VC audio generation; never sends a QQ message."""
import argparse
import json
import os
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[4]))
import requests
from app.qq_singing import save


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--schema',action='store_true')
    parser.add_argument('--operation',choices=['catalog','render'],default='catalog')
    parser.add_argument('--song-id')
    parser.add_argument('--voice-id',default='companion')
    parser.add_argument('--delivery-key')
    parser.add_argument('--output')
    args=parser.parse_args()
    if args.schema:
        print(json.dumps({'operation':['catalog','render'],'song-id':'real catalog id','voice-id':'catalog voice id',
                          'delivery-key':'32 hex characters supplied by current QQ turn','output':'JSON output path'}));return
    if not args.output:parser.error('--output is required')
    endpoint=os.getenv('QQ_SINGING_ENDPOINT','').rstrip('/');token=os.getenv('QQ_SINGING_TOKEN','')
    if not endpoint or not token:raise RuntimeError('歌声服务暂未配置')
    headers={'Authorization':'Bearer '+token}
    response=requests.get(endpoint+'/songs',headers=headers,timeout=10,allow_redirects=False)
    if response.status_code!=200:raise RuntimeError('歌声曲库暂时无法读取')
    catalog=response.json()
    if args.operation=='catalog':result={'type':'singing-catalog',**catalog}
    else:
        if not args.delivery_key:raise ValueError('当前 QQ 轮次缺少 delivery-key')
        song=next((s for s in catalog['songs'] if s['id']==args.song_id),None)
        if not song:raise ValueError('这首歌尚未加入曲库，请从实际曲库选择')
        if args.voice_id not in {v['id'] for v in catalog['voices']}:raise ValueError('声线未配置')
        if not catalog.get('ready'):raise RuntimeError('本地歌声模型尚未就绪')
        response=requests.post(endpoint+'/render',headers=headers,json={'songId':song['id'],'voiceId':args.voice_id},
                               timeout=(5,210),allow_redirects=False,stream=True)
        if response.status_code!=200:
            response.close();raise RuntimeError('歌声生成暂未完成或服务忙，请稍后再试')
        if response.headers.get('X-Singing-Engine')!='seed-vc-svc':
            response.close();raise ValueError('歌声服务返回了不匹配的音频类型')
        audio=bytearray()
        for chunk in response.iter_content(65536):
            audio.extend(chunk)
            if len(audio)>2*1024*1024:response.close();raise ValueError('歌声音频过大')
        receipt=save(bytes(audio),delivery_key=args.delivery_key,song=song,voice_id=args.voice_id,
                     duration=float(response.headers['X-Audio-Duration']))
        result={'type':'singing-result','qqSong':receipt,'source':song.get('source',''),
                'answer':'已生成'+song['title']+'的歌声片段，由 QQ 通道发送。'}
    path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,ensure_ascii=False));path.chmod(0o600)
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    try:main()
    except Exception as exc:
        print(json.dumps({'ok':False,'error':str(exc)},ensure_ascii=False));sys.exit(1)
