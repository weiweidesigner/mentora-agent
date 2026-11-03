#!/usr/bin/env python3
"""Admin-side import of local song stems or a locally supplied mixed recording."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


def run(args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--root',type=Path,required=True)
    p.add_argument('--id',required=True)
    p.add_argument('--title',required=True)
    group=p.add_mutually_exclusive_group(required=True)
    group.add_argument('--vocal-file',type=Path)
    group.add_argument('--input',type=Path,help='Mixed recording; use Demucs to prepare stems once')
    p.add_argument('--backing-file',type=Path)
    p.add_argument('--start',type=float,default=0)
    p.add_argument('--seconds',type=float,default=20)
    p.add_argument('--alias',action='append',default=[])
    p.add_argument('--source',required=True,help='Origin and permission/provenance note')
    p.add_argument('--attribution',default='',help='Required credit text to send with the QQ audio (maximum 700 characters)')
    a=p.parse_args()
    if not re.fullmatch(r'[a-z0-9_-]{1,64}',a.id):p.error('Invalid song id')
    if not 3<=a.seconds<=30 or a.start<0:p.error('Use a 3–30 second clip and nonnegative start')
    if len(a.attribution)>700:p.error('Attribution must be at most 700 characters')
    root=a.root.expanduser().resolve();registry=root/'catalog.json';data=json.loads(registry.read_text())
    if any(s['id']==a.id for s in data['songs']):p.error('Song id already exists; choose a new id')
    source=(a.input or a.vocal_file).expanduser().resolve()
    if not source.is_file():p.error('Source file does not exist')
    destination=root/'songs'/a.id
    with tempfile.TemporaryDirectory(prefix='song-import-',dir=root) as tmp:
        tmp=Path(tmp);vocal=tmp/'vocal.wav';backing=None
        def cut(src,target):
            run(['ffmpeg','-v','error','-y','-ss',str(a.start),'-i',str(src),'-t',str(a.seconds),'-ac','2','-ar','44100',str(target)])
        if a.input:
            mixed=tmp/'clip.wav';cut(source,mixed)
            run([sys.executable,'-m','demucs','--two-stems','vocals','-d','cpu','--out',str(tmp/'stems'),str(mixed)])
            vocal=tmp/'stems/htdemucs/clip/vocals.wav';backing=tmp/'stems/htdemucs/clip/no_vocals.wav'
        else:
            cut(source,vocal)
            if a.backing_file:
                backing=tmp/'backing.wav';cut(a.backing_file.expanduser().resolve(),backing)
        if not vocal.is_file():raise RuntimeError('No prepared vocal stem')
        destination.mkdir(parents=True,exist_ok=False)
        shutil.copyfile(vocal,destination/'vocal.wav')
        entry={'id':a.id,'title':a.title,'aliases':a.alias,'vocal':'songs/'+a.id+'/vocal.wav',
               'seconds':a.seconds,'source':a.source}
        if a.attribution:entry['attribution']=a.attribution
        if backing:
            shutil.copyfile(backing,destination/'backing.wav');entry['backing']='songs/'+a.id+'/backing.wav'
        data['songs'].append(entry)
        temp=registry.with_suffix('.json.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2));temp.chmod(0o600);temp.replace(registry)
    print(json.dumps({'ok':True,'song':entry},ensure_ascii=False))


if __name__=='__main__':main()
