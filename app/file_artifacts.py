"""Only explicitly delivered, verified generated files become download cards."""
import re
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import quote,unquote,urlsplit

FILE_SUFFIXES={'.html','.pdf','.docx','.xlsx','.pptx','.csv','.txt','.md','.json','.png','.jpg','.jpeg','.webp','.svg','.zip','.pine'}

INTERNAL_FILE_NAME=re.compile(r'^(?:streamviz[-_]job|html[-_]render)[-_]|^[0-9a-f]{8}-[0-9a-f-]{27,}',re.I)

class _ReportTitles(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.head=False;self.active=None;self.parts=[];self.titles={}
    def handle_starttag(self,tag,attrs):
        if tag=='head':self.head=True
        if (tag=='title' and self.head or tag in ('h1','h2','h3')) and self.active is None and tag not in self.titles:
            self.active=tag;self.parts=[]
    def handle_data(self,data):
        if self.active:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag==self.active:
            self.titles[tag]=' '.join(''.join(self.parts).split());self.active=None
        if tag=='head':self.head=False

def artifact_file_name(path,preferred=''):
    """Public filename; internal storage identity and URLs stay unchanged."""
    path=Path(path);suffix=path.suffix.lower();title=str(preferred or '').strip()
    if not title and not INTERNAL_FILE_NAME.search(path.name):return path.name
    if not title and suffix=='.html':
        parser=_ReportTitles()
        try:
            with path.open(encoding='utf-8') as handle:parser.feed(handle.read(524288))
            title=next((parser.titles[key] for key in ('title','h1','h2','h3') if parser.titles.get(key) and parser.titles[key].lower() not in ('mentora','streamviz','html report','report')), '')
        except (OSError,UnicodeError):pass
    title=re.sub(r'[\x00-\x1f\x7f<>:"/\\|?*]+',' ',title)
    title=' '.join(title.split()).strip(' .')
    if title.lower().endswith(suffix):title=title[:-len(suffix)].rstrip(' .')
    if not title or INTERNAL_FILE_NAME.search(title):title='HTML 报告' if suffix=='.html' else '生成文件'
    return title[:100].rstrip(' .')+suffix

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
        metadata=next((item for item in artifacts if str(item.get('path') or '')==str(path) or unquote(urlsplit(str(item.get('url') or '')).path).endswith('/'+path.name)),{})
        title=(metadata.get('title') or metadata.get('label') or '') if INTERNAL_FILE_NAME.search(path.name) else ''
        name=artifact_file_name(path,title)
        files.append(dict(name=name,url='/generated/'+quote(path.name),downloadUrl='/api/artifacts/'+quote(path.name)+'/download',type=path.suffix[1:].upper(),size=path.stat().st_size))
    clean=re.sub(r'\[\[AIME_FILE:[^\]\n]+\]\]','',answer).strip()
    return files,clean
