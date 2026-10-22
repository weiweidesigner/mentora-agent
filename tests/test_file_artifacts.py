import json
import pytest
from fastapi.testclient import TestClient
from app.file_artifacts import collect_file_artifacts
from app.reasoning_frameworks import LocalAgentFrameworks,ReasoningFrameworkError
from app import presentation


def test_verified_html_deliverable_has_preview_and_download_metadata(tmp_path):
    generated=tmp_path/'outputs/generated';generated.mkdir(parents=True)
    file=generated/'完整报告.html';file.write_text('<html><body>Verified report</body></html>')
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=generated)
    result=client._artifact_payload('deepseek','写一个html报告',f'报告\n[[AIME_CHART:{file}]]\n[[AIME_FILE:{file}]]\n[[AIME_SKILLS:streamviz]]','run','session')
    assert len(result['reportArtifacts'])==len(result['fileArtifacts'])==1
    assert result['fileArtifacts'][0]['name']=='完整报告.html'
    assert result['fileArtifacts'][0]['downloadUrl'].endswith('/download')
    assert 'AIME_CHART' in result['interpretation'] and 'AIME_FILE' not in result['interpretation']


def test_downloads_are_not_inferred_for_normal_charts_or_intermediate_inventory(tmp_path):
    f=tmp_path/'report.html';f.write_text('<html>report</html>')
    files,_=collect_file_artifacts('展示走势图','done',[{'path':str(f)}],tmp_path,tmp_path)
    assert files==[]
    files,_=collect_file_artifacts('写html报告','done',[{'path':str(f)},{'path':str(f)}],tmp_path,tmp_path)
    assert files==[]
    files,_=collect_file_artifacts('写html报告','done',[{'path':str(f)}],tmp_path,tmp_path)
    assert files==[]
    files,_=collect_file_artifacts('写html报告','done',[{'path':str(f)}],tmp_path,tmp_path,allow_html=True)
    assert files[0]['type']=='HTML'


def test_explicit_html_file_is_ignored_without_streamviz_provenance(tmp_path):
    root=tmp_path/'generated';root.mkdir();file=root/'chart.html';file.write_text('<html>chart</html>')
    files,text=collect_file_artifacts('给我一个图',f'图表\n[[AIME_FILE:{file}]]',[],root,tmp_path)
    assert files==[] and text=='图表'


def test_business_chart_html_marker_is_not_a_file_deliverable(tmp_path):
    generated=tmp_path/'outputs/generated';generated.mkdir(parents=True)
    file=generated/'spy-5m.html';file.write_text('<html><body>chart</body></html>')
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=generated)
    result=client._artifact_payload(
        'deepseek','给我一个 SPY 五分钟行情图',
        f'行情如下\n[[AIME_CHART:{file}]]\n[[AIME_FILE:{file}]]\n[[AIME_SKILLS:business-chart-recall]]',
        'run','session',
    )
    assert len(result['reportArtifacts'])==1
    assert result['fileArtifacts']==[]
    assert 'AIME_FILE' not in result['interpretation']


def test_explicit_binary_file_is_supported_but_missing_and_external_paths_fail(tmp_path):
    root=tmp_path/'generated';root.mkdir();(root/'data.csv').write_text('a,b\n1,2')
    files,text=collect_file_artifacts('导出数据','[[AIME_FILE:/generated/data.csv]]',[],root,tmp_path)
    assert files[0]['name']=='data.csv' and text==''
    with pytest.raises(ValueError):collect_file_artifacts('导出','[[AIME_FILE:/etc/passwd]]',[],root,tmp_path)
    with pytest.raises(ValueError):collect_file_artifacts('导出','[[AIME_FILE:/generated/missing.pdf]]',[],root,tmp_path)


def test_download_endpoint_returns_attachment_and_host_theme_without_switches(monkeypatch,tmp_path):
    monkeypatch.setattr(presentation,'GENERATED_DIR',tmp_path)
    (tmp_path/'report.html').write_text('<html><head></head><body><button id="theme-toggle">浅色</button><main>Report</main></body></html>')
    (tmp_path/'data.csv').write_text('a,b\n1,2')
    client=TestClient(presentation.app)
    result=client.get('/api/artifacts/report.html/download?theme=dark')
    assert result.status_code==200 and result.headers['content-disposition'].startswith('attachment;')
    assert 'data-artifact-host-theme="dark"' in result.text
    assert 'Embedded reports inherit the host palette' in result.text
    assert client.get('/api/artifacts/data.csv/download').text=='a,b\n1,2'
    assert client.get('/api/artifacts/secret.env/download').status_code==400
