"""Install the unified gallery, including earlier branding/sticky changes."""
from pathlib import Path
import argparse,hashlib,json,os,re,time
HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--root',default='/home/ubuntu/mentora-releases/current')
root=Path(parser.parse_args().root).resolve()
def read(name):return json.loads((HERE/name).read_text())
def apply(source,edits):
 for edit in edits:
  if edit['new'] in source:continue
  before=next((candidate for candidate in [edit['old'],*edit.get('alternatives',[])] if candidate and source.count(candidate)==1),None)
  if before is None:raise RuntimeError('Gallery source changed: '+edit['old'][:90])
  source=source.replace(before,edit['new'],1)
 return source
rules=read('changes.json');branding=read('branding.json');groups=read('groups.json');changes={}
p=root/'app/static/cases.js';current=p.read_text();updated=current
if 'const financialChartGroups = [' not in updated:
 if 'const businessGroups = [' not in updated:
  updated=apply(updated,branding['app/static/cases.js'])
  updated=apply(updated,groups['app/static/cases.js'])
 updated=apply(updated,rules['app/static/cases.js'])
if updated!=current:changes[p]=updated
p=root/'app/static/styles.css';current=p.read_text();updated=apply(current,branding['app/static/styles.css'])
if updated!=current:changes[p]=updated
version=hashlib.sha256(json.dumps([rules,branding],sort_keys=True).encode()).hexdigest()[:12]
p=root/'app/static/index.html';current=p.read_text();updated=current
for asset in ('cases.js','styles.css'):
 updated,count=re.subn(r'(/static/'+re.escape(asset)+r')(?:\?[^"\'<>]*)?(?=["\'])',lambda m:m[1]+'?v=unified-gallery-'+version,updated)
 if not count:raise RuntimeError('Gallery asset hook missing: '+asset)
if updated!=current:changes[p]=updated
if changes:
 backup=HERE/'backups'/(root.name+'-'+str(time.time_ns()))
 for path,value in changes.items():
  saved=backup/path.relative_to(root);saved.parent.mkdir(parents=True,exist_ok=True);saved.write_bytes(path.read_bytes())
  staged=path.with_name(path.name+'.unified-gallery-new');staged.write_text(value);os.replace(staged,path)
print(json.dumps({'release':root.name,'updated':len(changes),'version':version}))
