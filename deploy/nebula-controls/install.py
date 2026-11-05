"""Apply only the reviewed nebula zoom and fullscreen control changes, preserving other UI patches."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import time

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--root',default='/home/ubuntu/mentora-releases/current')
args=parser.parse_args()
root=Path(args.root).resolve()
rules=json.loads((HERE/'changes.json').read_text())
changes={}
for relative,edits in rules.items():
 path=root/relative
 # Exported companion assets are served from the pinned checkout directly.
 manifest=root/'mentora-companion.lock.json'
 if manifest.is_file():
  spec=json.loads(manifest.read_text())
  if relative in spec.get('links',{}):path=root/spec['checkout']/spec['links'][relative]
 current=path.read_text();updated=current
 for edit in edits:
  if edit['new'] and edit['new'] in updated:continue
  alternatives=edit['old'] if isinstance(edit['old'],list) else [edit['old']]
  matching=[value for value in alternatives if value and updated.count(value)==1]
  if len(matching)!=1:
   raise RuntimeError('Nebula control source changed: '+relative)
  updated=updated.replace(matching[0],edit['new'],1)
 if updated!=current:changes[path]=updated
version=hashlib.sha256(json.dumps(rules,sort_keys=True).encode()).hexdigest()[:12]
index=root/'app/static/index.html';current=index.read_text();updated=current
for asset in ('memory-sphere.js','character.css'):
 pattern=r'(/static/'+re.escape(asset)+r')(?:\?[^"\'<>]*)?(?=["\'])'
 updated,count=re.subn(pattern,lambda match:match[1]+'?v=nebula-controls-'+version,updated)
 if not count:raise ValueError('Missing asset in index: '+asset)
if updated!=current:changes[index]=updated
if changes:
 backup=HERE/'backups'/(root.name+'-'+str(time.time_ns()))
 for path,value in changes.items():
  relative=path.relative_to(root);saved=backup/relative;saved.parent.mkdir(parents=True,exist_ok=True);saved.write_bytes(path.read_bytes())
  staged=path.with_name(path.name+'.nebula-new');staged.write_text(value);os.replace(staged,path)
print(json.dumps({'release':root.name,'updated':len(changes),'version':version}))
