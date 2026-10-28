from urllib.parse import unquote
from app.file_artifacts import artifact_file_name,collect_file_artifacts

def test_internal_html_uses_generated_heading_without_changing_storage(tmp_path):
    p=tmp_path/'streamviz-job-1234.html';p.write_text('<html><head><title>StreamViz</title></head><body><h2>杭州房价：<b>二手房仍在磨底</b>，新房相对企稳</h2></body></html>')
    expected='杭州房价：二手房仍在磨底，新房相对企稳.html'
    assert artifact_file_name(p)==expected
    files,_=collect_file_artifacts('',f'[[AIME_FILE:{p}]]',[{'path':str(p)}],tmp_path,tmp_path,allow_html=True)
    assert files[0]['name']==expected
    assert unquote(files[0]['url']).endswith(p.name) and p.exists()

def test_generated_metadata_and_safe_download_names(tmp_path):
    p=tmp_path/'streamviz-job-1234.html';p.write_text('<h1>HTML 标题</h1>')
    files,_=collect_file_artifacts('',f'[[AIME_FILE:{p}]]',[{'path':str(p),'label':'模型生成的报告标题'}],tmp_path,tmp_path,allow_html=True)
    assert files[0]['name']=='模型生成的报告标题.html'
    assert artifact_file_name(p,'../evil\r\n:name.html')=='evil name.html'
    assert artifact_file_name(p,'报告.html')=='报告.html'
    normal=tmp_path/'用户指定名称.csv';normal.write_text('a,b')
    assert artifact_file_name(normal)==normal.name
