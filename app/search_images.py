"""Image-search adapters and a local gallery; no image downloads or model calls."""
from __future__ import annotations

import html
import ipaddress
import os
import re
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
        source=(urlsplit(page).hostname or '') if page else '',provider=provider,license=None,
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


def write_gallery(path,payload):
    """Render only provider-returned metadata; all remote values are escaped."""
    escape=lambda value:html.escape(str(value or ''),quote=True)
    results=payload.get('results') if isinstance(payload.get('results'),list) else [payload]
    cards=[]
    for result in results:
        for image in result.get('images',[]):
            url=public_url(image.get('image_url'));thumb=public_url(image.get('thumbnail_url')) or url
            if not url:continue
            source=public_url(image.get('source_url'))
            title=escape(image.get('title') or '图片')
            size=f"{image['width']} × {image['height']}" if image.get('width') and image.get('height') else '尺寸未知'
            origin=f'<a href="{escape(source)}" target="_blank" rel="noopener noreferrer">查看来源</a>' if source else '<span>来源页未提供</span>'
            cards.append(f'<article class="image-card"><button class="preview" data-original="{escape(url)}" aria-label="放大 {title}"><span class="placeholder">图片载入中</span><img src="{escape(thumb)}" alt="{title}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button><div class="details"><h2>{title}</h2><p>{escape(image.get("source"))} · {size}</p><nav>{origin}<a href="{escape(url)}" target="_blank" rel="noopener noreferrer">打开原图</a><button class="copy" data-url="{escape(url)}">复制链接</button></nav></div></article>')
    template=(Path(__file__).parent/'skills/external-search/assets/image-gallery.html').read_text()
    query=payload.get('requested_query') or ' / '.join(payload.get('queries') or [])
    replacements={'TITLE':escape(query),'COUNT':str(len(cards)),'CARDS':''.join(cards)}
    output=re.sub(r'@@(TITLE|COUNT|CARDS)@@',lambda match:replacements[match[1]],template)
    target=Path(path).expanduser().resolve();target.parent.mkdir(parents=True,exist_ok=True);target.write_text(output,encoding='utf-8')
    return str(target)
