"""Image-search adapters and a local gallery; no image downloads or model calls."""
from __future__ import annotations

import html
import ipaddress
import os
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


def public_url(value):
    value=str(value or '').strip()
    try:
        parsed=urlsplit(value);host=(parsed.hostname or '').lower()
        if parsed.scheme not in ('http','https') or not host or parsed.username or parsed.password:return ''
        if host=='localhost' or '.' not in host or host.endswith(('.localhost','.local','.internal')):return ''
        try:
            if not ipaddress.ip_address(host).is_global:return ''
        except ValueError:pass
        return value
    except ValueError:return ''


def normalize_image(item,*,provider,source_url='',source_title=''):
    if isinstance(item,str):item={'url':item}
    if not isinstance(item,dict):return None
    image=public_url(item.get('imageUrl') or item.get('url'))
    if not image:return None
    page=public_url(source_url or item.get('source_url') or item.get('link'))
    def dimension(key):
        value=item.get(key)
        return value if isinstance(value,int) and not isinstance(value,bool) and value>0 else None
    return dict(image_url=image,thumbnail_url=public_url(item.get('thumbnailUrl') or item.get('thumbnail_url')),
        source_url=page,title=str(item.get('title') or source_title or item.get('description') or ''),
        description=str(item.get('description') or ''),width=dimension('imageWidth'),height=dimension('imageHeight'),
        source=(urlsplit(page).hostname or '') if page else '',source_name=item.get('source') if isinstance(item.get('source'),str) else '',provider=provider,license=None,
        availability='not_checked')


def search_images(provider,query,sites,limit,timeout,page,*,request,search_query,normalized_domains,error):
    key=os.getenv('TAVILY_API_KEY' if provider=='tavily' else 'SERPER_API_KEY','').strip()
    if not key:raise error(provider.title()+' is not configured')
    if provider=='tavily':
        if page!=1:raise error('Tavily image results do not support page; use Serper for pagination')
        body=dict(query=query,search_depth='basic',topic='general',max_results=min(limit,20),
            include_images=True,include_image_descriptions=False,include_answer=False,include_raw_content=False)
        if sites:body['include_domains']=normalized_domains(sites)
        raw=request('https://api.tavily.com/search',body=body,headers={'Authorization':'Bearer '+key},timeout=timeout,provider='Tavily')
        rows=[]
        for result in raw.get('results') or []:
            if not isinstance(result,dict):continue
            for image in result.get('images') or []:
                rows.append(normalize_image(image,provider=provider,source_url=result.get('url',''),source_title=result.get('title','')))
        rows.extend(normalize_image(image,provider=provider) for image in raw.get('images') or [])
    else:
        chinese=any('\u3400'<=char<='\u9fff' for char in query)
        raw=request('https://google.serper.dev/images',body=dict(q=search_query(query,sites),num=limit,page=page,
            gl='cn' if chinese else 'us',hl='zh-cn' if chinese else 'en'),
            headers={'X-API-KEY':key},timeout=timeout,provider='Serper')
        rows=[normalize_image(item,provider=provider) for item in raw.get('images') or []]
    images=[];seen=set()
    for row in rows:
        if row and row['image_url'] not in seen:
            images.append(row);seen.add(row['image_url'])
        if len(images)>=limit:break
    if not images:raise error(provider.title()+' returned no usable image URLs')
    return dict(source=provider,model=provider+'-image-search',images=images,articles=[],
        answer=f'找到 {len(images)} 张图片；搜索结果不代表商用授权，图片链接可用性未预检。',
        usage=dict(billable_requests=1,credits=raw.get('credits') if provider=='serper' else 1))


def render_gallery(payload):
    """Render only provider-returned metadata; all remote values are escaped."""
    escape=lambda value:html.escape(str(value or ''),quote=True)
    results=payload.get('results') if isinstance(payload.get('results'),list) else [payload]
    cards=[];seen=set()
    for result in results:
        for image in result.get('images',[]):
            url=public_url(image.get('image_url'));thumb=public_url(image.get('thumbnail_url')) or url
            if not url or url in seen or len(cards)>=6:continue
            seen.add(url)
            source=public_url(image.get('source_url'))
            title=escape(image.get('title') or '图片')
            source_name=image.get('source_name') or image.get('source') or (urlsplit(source).hostname if source else '')
            origin=f'<a href="{escape(source)}" target="_blank" rel="noopener noreferrer">来源：{escape(source_name)}</a>' if source else '<span>来源页未提供</span>'
            description=f'<p class="description">{escape(image.get("description"))}</p>' if len(cards)>=4 and image.get('description') else ''
            kind='image-card' if len(cards)<4 else 'image-card image-result-row'
            displayed=url if len(cards)<4 else thumb
            fallback=thumb if displayed!=thumb else ''
            cards.append(f'<article class="{kind}"><button class="preview" data-original="{escape(url)}" data-source="{escape(source)}" aria-label="放大 {title}"><span class="placeholder">图片载入中</span><img src="{escape(displayed)}" data-fallback="{escape(fallback)}" alt="{title}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button><div class="details"><h2>{title}</h2>{description}<p class="source">{origin}</p></div></article>')
    template=(Path(__file__).parent/'skills/external-search/assets/image-gallery.html').read_text()
    query=payload.get('requested_query') or ' / '.join(payload.get('queries') or [])
    remaining='<section class="list" aria-label="更多图片">'+''.join(cards[4:])+'</section>' if len(cards)>4 else ''
    replacements={'TITLE':escape(query),'QUERY':escape(query),'COUNT':str(len(cards)),'CARDS':''.join(cards[:4]),'LIST':remaining}
    payload['displayed_count']=len(cards)
    return re.sub(r'@@(TITLE|QUERY|COUNT|CARDS|LIST)@@',lambda match:replacements[match[1]],template)


def write_gallery(path,payload):
    output=render_gallery(payload)
    target=Path(path).expanduser().resolve();target.parent.mkdir(parents=True,exist_ok=True);target.write_text(output,encoding='utf-8')
    return str(target)


def upgrade_image_gallery(artifact):
    """Read-only upgrade of first-party older galleries, without fetching again."""
    if 'data-image-search-gallery="3"' in artifact or '<title>图片搜索</title>' not in artifact or 'data-original=' not in artifact or 'class="image-card"' not in artifact:return artifact
    class Parser(HTMLParser):
        def __init__(self):super().__init__();self.images=[];self.image=None;self.query='';self.capture='';self.parts=[];self.href=''
        def handle_starttag(self,tag,attrs):
            attrs=dict(attrs)
            if tag=='article' and 'image-card' in attrs.get('class','').split():self.image={}
            if self.image is not None:
                if tag=='button' and attrs.get('data-original'):
                    self.image['image_url']=attrs['data-original']
                    if attrs.get('data-source'):self.image['source_url']=attrs['data-source']
                if tag=='img':self.image['thumbnail_url']=attrs.get('src','')
            if tag in ('h1','h2','a'):
                self.capture=tag;self.parts=[];self.href=attrs.get('href','')
        def handle_data(self,data):
            if self.capture:self.parts.append(data)
        def handle_endtag(self,tag):
            if tag==self.capture:
                value=''.join(self.parts)
                if tag=='h1':self.query=value
                if self.image is not None:
                    if tag=='h2':self.image['title']=value
                    if tag=='a' and '查看来源' in value:self.image['source_url']=self.href
                    if tag=='a' and value.startswith('来源：'):
                        self.image['source_url']=self.href
                        self.image['source_name']=value.removeprefix('来源：')
                self.capture=''
            if tag=='article' and self.image is not None:self.images.append(self.image);self.image=None
    parser=Parser()
    try:parser.feed(artifact)
    except (ValueError,TypeError):return artifact
    if not parser.images:return artifact
    return render_gallery(dict(requested_query=parser.query,images=parser.images))
