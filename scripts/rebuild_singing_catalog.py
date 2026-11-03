#!/usr/bin/env python3
"""Admin migration: reimport explicit local originals, then warm full-song caches.

The manifest contains {"songs": [{"id": existing_id, "input": local_mixed_file}]};
use vocalFile instead of input for an already isolated vocal recording.
This never sends a QQ message. A durable journal allows interrupted work to resume.
Run while no catalog imports are active; the service can still serve cached songs.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import requests


def write(path, value):
    tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2));tmp.chmod(0o600);tmp.replace(path)


def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True)
    p.add_argument('--manifest',type=Path,required=True);p.add_argument('--endpoint',default='http://127.0.0.1:8769')
    args=p.parse_args();root=args.root.resolve()
    token=Path(os.environ['SINGING_TOKEN_FILE']).read_text().strip()
    journal=args.manifest.with_suffix('.progress.json')
    status=json.loads(journal.read_text()) if journal.exists() else {}
    for item in json.loads(args.manifest.read_text())['songs']:
        ident=item['id']
        if status.get(ident,{}).get('state')=='ready':continue
        catalog=json.loads((root/'catalog.json').read_text())
        old=next(s for s in catalog['songs'] if s['id']==ident)
        status[ident]={'state':'preparing','title':old['title']};write(journal,status)
        try:
            stage=root/'full-sources'/ident;stage.mkdir(parents=True,exist_ok=True)
            registry=stage/'catalog.json'
            if not registry.exists():write(registry,{'songs':[],'voices':[]})
            entries=json.loads(registry.read_text())['songs']
            if not entries:
                command=[sys.executable,str(root/'register_singing_song.py'),'--root',str(stage),
                         '--id',ident,'--title',old['title'].replace('片段',''),'--source',old.get('source','')+'; full original reimported without excerpt cropping.']
                command+=['--vocal-file',item['vocalFile']] if item.get('vocalFile') else ['--input',item['input']]
                if old.get('attribution'):command+=['--attribution',old['attribution']]
                subprocess.run(command,check=True,stdout=subprocess.DEVNULL)
                entries=json.loads(registry.read_text())['songs']
            new={**old,**entries[0],'aliases':old.get('aliases',[])}
            for field in ('vocal','backing'):
                if field in entries[0]:new[field]=str((stage/entries[0][field]).relative_to(root))
                else:new.pop(field,None)
            # Re-read just before publication; preserve unrelated catalog entries.
            catalog=json.loads((root/'catalog.json').read_text())
            catalog['songs']=[new if s['id']==ident else s for s in catalog['songs']]
            write(root/'catalog.json',catalog)
            status[ident].update(state='converting',sourceSeconds=new['seconds']);write(journal,status)
            headers={'Authorization':'Bearer '+token}
            if old.get('owner'):
                import hashlib,hmac
                owner=old['owner']
                headers['X-Singing-Library']=owner+'.'+hmac.new(token.encode(),('song-library:'+owner).encode(),hashlib.sha256).hexdigest()
            while True:
                response=requests.post(args.endpoint.rstrip('/')+'/render',json={'songId':ident},headers=headers,timeout=(5,None))
                if response.status_code!=409:break
                response.close();time.sleep(5)
            response.raise_for_status()
            if not response.content.startswith(b'\x02#!SILK_V3'):raise ValueError('Invalid full-song render')
            seconds=float(response.headers['X-Audio-Duration'])
            if abs(seconds-new['seconds'])>max(1,new['seconds']*.01):raise ValueError('Full-song duration mismatch')
            status[ident].update(state='ready',seconds=seconds);write(journal,status)
            print(json.dumps({'id':ident,'state':'ready','seconds':seconds}),flush=True)
        except Exception as exc:
            catalog=json.loads((root/'catalog.json').read_text())
            catalog['songs']=[old if s['id']==ident else s for s in catalog['songs']]
            write(root/'catalog.json',catalog)
            status[ident].update(state='failed',error=type(exc).__name__);write(journal,status)
            print(json.dumps({'id':ident,'state':'failed','error':type(exc).__name__}),flush=True)
    if any(s.get('state')=='failed' for s in status.values()):raise SystemExit(1)


if __name__=='__main__':main()
