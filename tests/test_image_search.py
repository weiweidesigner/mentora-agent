import argparse
import importlib.util
import json
import sys
from pathlib import Path

import pytest
from app.search_images import normalize_image,public_url,search_images,write_gallery,render_gallery,upgrade_image_gallery

ROOT=Path(__file__).resolve().parents[1]

def module():
    spec=importlib.util.spec_from_file_location('image_search_cli',ROOT/'app/skills/external-search/scripts/external_info_search.py')
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

@pytest.mark.parametrize('url',['javascript:alert(1)','data:image/png,x','http://127.0.0.1/a','https://localhost/a','https://10.0.0.1/a','https://user:secret@example.com/a'])
def test_unsafe_urls_rejected(url):
    assert public_url(url)==''

def test_tavily_source_linked_images_deduplicate_and_keep_unknowns(monkeypatch):
    cli=module();monkeypatch.setenv('TAVILY_API_KEY','fixture')
    calls=[]
    def request(url,**kwargs):
        calls.append((url,kwargs))
        return dict(results=[dict(url='https://example.com/story',title='A photo',images=['https://cdn.example.com/photo.jpg'])],
            images=[dict(url='https://cdn.example.com/photo.jpg'),dict(url='https://example.com/other.jpg')])
    result=search_images('tavily','photo',[],12,10,1,request=request,search_query=cli.search_query,normalized_domains=cli.normalized_domains,error=cli.SearchProviderError)
    assert len(calls)==1 and calls[0][1]['body']['include_images'] is True
    assert calls[0][1]['body']['include_answer'] is False
    assert len(result['images'])==2
    first,second=result['images']
    assert first['source_url']=='https://example.com/story'
    assert second['source_url']=='' and second['width'] is None and second['license'] is None

def test_serper_uses_images_endpoint_and_preserves_metadata(monkeypatch):
    cli=module();monkeypatch.setenv('SERPER_API_KEY','fixture');calls=[]
    def request(url,**kwargs):
        calls.append((url,kwargs['body']))
        return dict(images=[dict(imageUrl='https://example.com/p.jpg',thumbnailUrl='https://example.com/t.jpg',
            link='https://example.com/page',title='Photo',imageWidth=800,imageHeight=600)],credits=1)
    result=search_images('serper','苹果园',['example.com'],20,10,2,request=request,search_query=cli.search_query,normalized_domains=cli.normalized_domains,error=cli.SearchProviderError)
    assert calls==[('https://google.serper.dev/images',dict(q='苹果园 site:example.com',num=20,page=2,gl='cn',hl='zh-cn'))]
    assert result['images'][0]['width']==800 and result['images'][0]['thumbnail_url'].endswith('/t.jpg')

def test_cli_falls_back_on_empty_images_and_writes_gallery(monkeypatch,tmp_path):
    cli=module();monkeypatch.setenv('TAVILY_API_KEY','fixture');monkeypatch.setenv('SERPER_API_KEY','fixture')
    calls=[];monkeypatch.setattr(cli,'record_search',lambda *_:None)
    def request(url,**kwargs):
        calls.append(url)
        return dict(images=[] if 'tavily' in url else [dict(imageUrl='https://example.com/p.jpg',link='https://example.com/page',title='<script>alert(1)</script>')])
    monkeypatch.setattr(cli,'request_json',request)
    output=tmp_path/'gallery.html';payload=tmp_path/'data.json'
    monkeypatch.setattr(sys,'argv',['search','--mode','images','--query','photo','--limit','23','--output',str(output),'--payload-output',str(payload)])
    assert cli.main()==0
    value=json.loads(payload.read_text());assert value['source']=='serper' and value['image_count']==1
    assert [x['status'] for x in value['fallback_attempts']]==['failed','success']
    document=output.read_text();assert '&lt;script&gt;' in document and '<script>alert(1)</script>' not in document
    assert 'https://example.com/page' in document and 'data-original=' in document

def test_page_skips_tavily_network_and_explicit_provider_does_not_fallback(monkeypatch,tmp_path):
    cli=module();monkeypatch.setenv('TAVILY_API_KEY','fixture');monkeypatch.setattr(cli,'record_search',lambda *_:None)
    monkeypatch.setattr(cli,'request_json',lambda *_a,**_k:pytest.fail('unsupported page must not send request'))
    monkeypatch.setattr(sys,'argv',['search','--mode','images','--source','tavily','--page','2','--query','photo','--output',str(tmp_path/'data.json')])
    assert cli.main()==1
    assert not (tmp_path/'data.json').exists()

def test_kimi_image_mode_rejected_before_request(monkeypatch,tmp_path):
    cli=module();monkeypatch.setattr(cli,'request_json',lambda *_a,**_k:pytest.fail('no request expected'))
    monkeypatch.setattr(sys,'argv',['search','--mode','images','--source','kimi','--query','photo','--output',str(tmp_path/'data.json')])
    assert cli.main()==2

def test_legacy_argument_builder_preserves_image_mode_without_model_rewrite():
    # Test this helper in isolation: importing main starts unrelated services.
    import ast
    tree=ast.parse((ROOT/'app/main.py').read_text())
    function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='build_external_info_search_args')
    scope=dict(Any=object,sanitize_cli_args=lambda x:x,remove_cli_option=lambda args,keys:args,
        value_after_option=lambda a,k:a[a.index(k)+1] if k in a else '',has_cli_option=lambda a,k:k in a)
    exec(compile(ast.Module(body=[function],type_ignores=[]),'<helper>','exec'),scope)
    args=['--mode','images','--query','Apple Park photo','--source','serper','--limit','12','--page','2']
    assert scope['build_external_info_search_args'](args,'搜图')==args


def test_gallery_caps_deduplicates_and_uses_four_grid_two_list_without_losing_candidates():
    from bs4 import BeautifulSoup
    rows=[dict(image_url=f'https://images.example.com/{n}.jpg',thumbnail_url=f'https://images.example.com/thumb-{n}.jpg',title=f'照片{n}',source_url='https://example.com/story',source_name='来源名') for n in range(12)]
    payload=dict(requested_query='照片',image_count=12,images=[rows[0],*rows])
    soup=BeautifulSoup(render_gallery(payload),'html.parser')
    assert len(soup.select('.grid>.image-card'))==4
    assert len(soup.select('.list>.image-result-row'))==2
    assert len(soup.select('.preview'))==6
    assert soup.select_one('.grid img')['src']=='https://images.example.com/0.jpg'
    assert soup.select_one('.list img')['src']=='https://images.example.com/thumb-4.jpg'
    assert soup.select_one('.source').text=='来源：来源名'
    assert not soup.select('.refine, .suggestions, footer, [data-refinement]')
    assert payload['image_count']==12 and len(payload['images'])==13 and payload['displayed_count']==6


def test_legacy_gallery_upgrade_is_read_only_and_does_not_touch_other_artifacts():
    from bs4 import BeautifulSoup
    old='<html><head><title>图片搜索</title></head><body><header><h1>旧照片</h1></header>'
    old+=''.join(f'<article class="image-card"><button class="preview" data-original="https://example.com/{n}.jpg"><img src="https://example.com/t{n}.jpg"></button><h2>照片{n}</h2><a href="https://source.example.com/page">查看来源</a></article>' for n in range(10))
    old+='</body></html>'
    upgraded=upgrade_image_gallery(old);soup=BeautifulSoup(upgraded,'html.parser')
    assert len(soup.select('.image-card'))==6 and soup.h1.text=='旧照片'
    assert soup.select_one('.source a')['href']=='https://source.example.com/page'
    assert upgrade_image_gallery(upgraded)==upgraded
    other='<html><title>图片搜索</title><div>用户自己的图表</div></html>'
    assert upgrade_image_gallery(other)==other


def test_served_legacy_gallery_upgrades_without_rewriting_stored_file(tmp_path,monkeypatch):
    from app import presentation
    monkeypatch.setattr(presentation,'GENERATED_DIR',tmp_path)
    old='<html><head><title>图片搜索</title></head><body><h1>旧图集</h1><article class="image-card"><button data-original="https://example.com/p.jpg"><img src="https://example.com/t.jpg"></button><h2>原始标题</h2><a href="https://source.example.com/page">查看来源</a></article></body></html>'
    path=tmp_path/'old-gallery.html';path.write_text(old)
    page=presentation.share_streamviz_artifact(path.name,theme='dark').body.decode()
    assert 'data-image-search-gallery="5"' in page and 'data-theme="dark"' in page
    assert '原始标题' in page and 'https://source.example.com/page' in page
    assert path.read_text()==old


def test_v2_gallery_upgrade_removes_footer_preserving_photos_and_sources():
    from bs4 import BeautifulSoup
    old='<html><head><title>图片搜索</title></head><body><main data-image-search-gallery="2"><h1>照片</h1>'
    old+=''.join(f'<article class="image-card"><button class="preview" data-original="https://example.com/{n}.jpg" data-source="https://source.example.com/{n}"><img src="https://example.com/t{n}.jpg"></button><h2>照片{n}</h2><p class="source"><a href="https://source.example.com/{n}">来源：原始来源{n}</a></p></article>' for n in range(6))
    old+='<section class="refine"><p>想找哪一类？</p><button data-refinement="高清">高清大图</button></section><footer>图片来自外部网站，不代表商用授权。</footer></main></body></html>'
    upgraded=upgrade_image_gallery(old)
    soup=BeautifulSoup(upgraded,'html.parser')
    assert len(soup.select('.image-card'))==6
    assert not soup.select('.refine, footer, [data-refinement]')
    assert soup.select('.source a')[5]['href']=='https://source.example.com/5'
    assert soup.select('.source a')[5].text=='来源：原始来源5'
    assert soup.select('.preview')[5]['data-original']=='https://example.com/5.jpg'
    assert upgrade_image_gallery(upgraded)==upgraded


def test_v3_upgrade_preserves_separate_thumbnail_for_original_load_failures():
    from bs4 import BeautifulSoup
    old='<html><head><title>图片搜索</title></head><body><main data-image-search-gallery="3"><h1>旧图集</h1><article class="image-card"><button class="preview" data-original="https://example.com/full.jpg" data-source="https://source.example.com/story"><span>载入中</span><img src="https://example.com/full.jpg" data-fallback="https://example.com/thumb.jpg"></button><h2>原始标题</h2><a href="https://source.example.com/story">来源：原始来源</a></article></main></body></html>'
    page=upgrade_image_gallery(old);soup=BeautifulSoup(page,'html.parser')
    assert soup.select_one('main')['data-image-search-gallery']=='5'
    assert soup.select_one('.preview')['data-thumbnail']=='https://example.com/thumb.jpg'
    assert soup.select_one('.preview')['data-original']=='https://example.com/full.jpg'
    assert soup.select_one('.preview')['data-source-name']=='原始来源'
    assert '@@VIEWER_' not in page
    assert not soup.select('script[src],link[rel="stylesheet"]')  # standalone stays self-contained
    assert upgrade_image_gallery(page)==page


def test_gallery_artifact_metadata_identifies_images_without_filename_guessing(tmp_path):
    from app.reasoning_frameworks import LocalAgentFrameworks
    path=tmp_path/'opaque-id.html'
    write_gallery(path,dict(requested_query='照片',images=[dict(image_url='https://example.com/p.jpg')]))
    client=LocalAgentFrameworks(project_root=ROOT,generated_dir=tmp_path)
    payload=client._artifact_payload('deepseek','找照片',f'[[AIME_CHART:{path}]]','fixture','fixture')
    assert payload['reportArtifacts'][0]['contentKind']=='image-gallery'
    assert payload['reportArtifacts'][0]['renderMode']=='iframe'
