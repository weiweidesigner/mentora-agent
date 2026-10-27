import argparse
import importlib.util
import json
import sys
from pathlib import Path

import pytest
from app.search_images import normalize_image,public_url,search_images,write_gallery

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
