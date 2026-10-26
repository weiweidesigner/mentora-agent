import json
import time
import pytest
from app.workflow_news import execute


@pytest.fixture
def root(tmp_path):
    app=tmp_path/'app';app.mkdir()
    # Offline wrapper fixture only: no HTTP, Agent, or financial assertions.
    (app/'skill_runner.py').write_text('''import json,sys,pathlib
args=sys.argv[1:]
assert args[:3]==['execute','--script','ainvest_news_search.py']
path=pathlib.Path(args[args.index('--output')+1]);path.parent.mkdir(parents=True,exist_ok=True)
items=[dict(title='fixture raw title',summary='fixture raw summary',published_at='',content_text='',url='https://example.invalid/fixture')]
path.write_text(json.dumps(items))
print(json.dumps(dict(ok=True,exitCode=0,artifacts=[dict(path=str(path),verified=True)],stderr='[warn] fixture missing publication time',testArgs=args)))
''')
    return tmp_path


def test_defaults_execute_one_registered_skill_and_keep_missing_fields(root):
    result=execute({},root)
    assert result['items'][0]['published_at']=='' and result['items'][0]['content_text']==''
    assert json.loads(result['text'])==result['items'] and result['count']==1
    assert result['outputSource']=='verified-skill-json' and '[warn]' in result['stderr']
    args=result['skillReceipt']['testArgs']
    assert args[args.index('--source')+1]=='homepage'
    assert args[args.index('--limit')+1]=='10'
    assert args[args.index('--max-details')+1]=='10'
    assert not result.get('reportArtifacts') and not result.get('fileArtifacts')


def test_explicit_categories_dates_and_unique_outputs(root):
    params=dict(source='category',categories=['latest','top-news'],limit=2,startDate='2026-10-25',endDate='2026-10-26',workers=2)
    a=execute(params,root);b=execute(params,root)
    assert a['dataHandoffs'][0]['path']!=b['dataHandoffs'][0]['path']
    args=a['skillReceipt']['testArgs']
    assert args.count('--category')==2 and '--start-date' in args and '--end-date' in args
    assert args[args.index('--workers')+1]=='2'


@pytest.mark.parametrize('params',[{'source':'all'},{'source':'external'},{'query':'invented arg'},{'limit':0},{'workers':9},{'timeoutSeconds':0}])
def test_bad_parameters_do_not_start_a_process(tmp_path,params):
    with pytest.raises(ValueError):execute(params,tmp_path)


def test_failed_skill_does_not_return_empty_success_or_retry(root):
    (root/'app/skill_runner.py').write_text('import json;print(json.dumps(dict(ok=False,exitCode=1,stderr="fixture source unavailable")));raise SystemExit(1)')
    with pytest.raises(RuntimeError,match='fixture source unavailable'):execute({},root)


def test_empty_skill_result_is_valid_and_not_replaced(root):
    (root/'app/skill_runner.py').write_text('''import json,sys,pathlib
path=pathlib.Path(sys.argv[sys.argv.index('--output')+1]);path.parent.mkdir(parents=True,exist_ok=True);path.write_text('[]')
print(json.dumps(dict(ok=True,exitCode=0,artifacts=[dict(path=str(path),verified=True)],stderr='[warn] fixture empty source')))
''')
    result=execute({},root)
    assert result['items']==[] and result['count']==0 and json.loads(result['text'])==[]
    assert '[warn]' in result['stderr']


def test_invalid_dates_and_cancellation_do_not_start(root):
    with pytest.raises(ValueError,match='开始日期'):execute(dict(startDate='2026-10-26',endDate='2026-10-25'),root)
    with pytest.raises(InterruptedError):execute({},root,cancelled=lambda:True)


def test_running_process_can_be_cancelled(root):
    (root/'app/skill_runner.py').write_text('import time;time.sleep(20)')
    started=time.monotonic()
    with pytest.raises(InterruptedError):execute({},root,cancelled=lambda:time.monotonic()-started>.4)
    assert time.monotonic()-started<4


def test_timeout_stops_process_without_fallback(root):
    (root/'app/skill_runner.py').write_text('import time;time.sleep(20)')
    started=time.monotonic()
    with pytest.raises(TimeoutError):execute({'timeoutSeconds':1},root)
    assert time.monotonic()-started<9
