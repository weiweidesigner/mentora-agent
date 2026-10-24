"""Only explicitly delivered, verified generated files become download cards."""
import re
from pathlib import Path
from urllib.parse import quote,unquote,urlsplit

FILE_SUFFIXES={'.html','.pdf','.docx','.xlsx','.pptx','.csv','.txt','.md','.json','.png','.jpg','.jpeg','.webp','.svg','.zip','.pine'}

def collect_file_artifacts(question,answer,artifacts,generated_dir,project_root,*,allow_html=False):
    root=Path(generated_dir).resolve();files=[];seen=set()
    markers=list(dict.fromkeys(re.findall(r'\[\[AIME_FILE:([^\]\n]+)\]\]',answer)))
    paths=[]
    for raw in markers:
        value=raw.strip()
        if value.startswith('/generated/'):path=root/unquote(urlsplit(value).path.removeprefix('/generated/'))
        else:
            supplied=Path(value).expanduser()
            path=supplied if supplied.is_absolute() else Path(project_root)/supplied
        path=path.resolve()
        if root not in path.parents or path.suffix.lower() not in FILE_SUFFIXES or not path.is_file() or not path.stat().st_size:
            raise ValueError('生成文件不存在、为空或不属于允许的交付目录')
        # HTML is rendered inline for every chart, but it is a downloadable
        # document only when StreamViz produced it.  Other explicit file
        # formats remain valid deliverables for their corresponding skills.
        if path.suffix.lower()=='.html' and not allow_html:
            continue
        paths.append(path)
    # StreamViz HTML is itself the document deliverable.  Accept the resolved
    # report artifact even if an older StreamViz answer omitted AIME_FILE.
    if allow_html and not paths and len(artifacts)==1:
        candidate=artifacts[0].get('path')
        if candidate:
            path=Path(candidate).resolve()
            if root in path.parents and path.suffix.lower()=='.html' and path.is_file() and path.stat().st_size:paths.append(path)
    for path in paths:
        if path in seen:continue
        seen.add(path)
        name=path.name;files.append(dict(name=name,url='/generated/'+quote(name),downloadUrl='/api/artifacts/'+quote(name)+'/download',type=path.suffix[1:].upper(),size=path.stat().st_size))
    clean=re.sub(r'\[\[AIME_FILE:[^\]\n]+\]\]','',answer).strip()
    return files,clean
