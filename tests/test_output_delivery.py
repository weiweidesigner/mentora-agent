"""Verify explicit data handoffs, source boundaries and non-destructive staging."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote

import pytest

from app.file_artifacts import collect_file_artifacts


def deliver(project, path, **kwargs):
    root=project/'outputs/generated'
    return collect_file_artifacts('导出明细',f'已有分析\n[[AIME_FILE:{path}]]',[],root,project,**kwargs)


def test_explicit_outputs_csv_becomes_a_verified_download_without_moving_source(tmp_path):
    source=tmp_path/'outputs/data/财报.csv';source.parent.mkdir(parents=True)
    source.write_bytes(b'\xef\xbb\xbfdate,symbol\n2026-11-02,MAR\n')
    files,text=deliver(tmp_path,source)
    assert text=='已有分析' and len(files)==1 and files[0]['name']=='财报.csv'
    delivered=tmp_path/'outputs/generated'/unquote(files[0]['url'].removeprefix('/generated/'))
    assert delivered.read_bytes()==source.read_bytes()
    assert files[0]['size']==source.stat().st_size and files[0]['downloadUrl'].endswith('/download')


def test_internal_files_are_not_exported_without_explicit_marker(tmp_path):
    source=tmp_path/'outputs/data.json';source.parent.mkdir();source.write_text('{"n":669}')
    files,text=collect_file_artifacts('分析','done',[{'path':str(source)}],tmp_path/'outputs/generated',tmp_path)
    assert not files and text=='done' and not (tmp_path/'outputs/generated').exists()


def test_deliveries_with_same_name_different_contents_do_not_overwrite(tmp_path):
    first=tmp_path/'outputs/a/report.csv';second=tmp_path/'outputs/b/report.csv'
    for path,text in [(first,'one'),(second,'two')]:
        path.parent.mkdir(parents=True);path.write_text(text)
    a,_=deliver(tmp_path,first);b,_=deliver(tmp_path,second)
    assert a[0]['url']!=b[0]['url']
    assert a[0]['name']==b[0]['name']=='report.csv'
    assert len(list((tmp_path/'outputs/generated').glob('*.csv')))==2


def test_concurrent_repeated_delivery_is_atomic_and_idempotent(tmp_path):
    source=tmp_path/'outputs/report.csv';source.parent.mkdir();source.write_bytes(b'calendar,'*5000)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(lambda _:deliver(tmp_path,source),range(8)))
    assert len({result[0][0]['url'] for result in results})==1
    targets=list((tmp_path/'outputs/generated').glob('*.csv'))
    assert len(targets)==1 and targets[0].read_bytes()==source.read_bytes()
    assert not list((tmp_path/'outputs/generated').glob('.delivery-*'))


@pytest.mark.parametrize('kind',['missing','empty','outside','symlink','unsupported','html'])
def test_invalid_paths_still_fail_without_promoting_files(tmp_path,kind):
    outputs=tmp_path/'outputs';outputs.mkdir()
    source=outputs/'report.csv'
    if kind=='empty':source.touch()
    elif kind=='outside':source=tmp_path/'private.csv';source.write_text('private')
    elif kind=='symlink':
        outside=tmp_path/'private.csv';outside.write_text('private');source.symlink_to(outside)
    elif kind in ('unsupported','html'):
        source=outputs/('secret.env' if kind=='unsupported' else 'intermediate.html');source.write_text('content')
    with pytest.raises(ValueError):deliver(tmp_path,source,allow_html=True)
    assert not (outputs/'generated').exists()
