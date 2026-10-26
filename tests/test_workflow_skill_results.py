import json
import pytest
from app.workflow_skill_results import SkillResults

TOOL=dict(id='internal-search',label='资讯搜索',script='app/skills/internal-search/',receiptScripts=['ainvest_news_search.py'])


@pytest.mark.parametrize('phase',['started','failed'])
def test_pending_or_failed_events_do_not_prove_execution(tmp_path,phase):
    result=SkillResults(TOOL,tmp_path)
    result.capture(dict(phase=phase,params=['python3 app/skill_runner.py execute --script ainvest_news_search.py -- --output outputs/news.json']))
    with pytest.raises(RuntimeError,match='真实工具调用回执'):result.result({})


def test_observation_mentions_and_contract_reads_are_not_execution(tmp_path):
    result=SkillResults(TOOL,tmp_path)
    result.capture(dict(phase='completed',params=['cat app/skills/internal-search/SKILL.md'],observation='ainvest_news_search.py 已执行'))
    result.capture(dict(phase='completed',params=['python3 app/skill_runner.py contract --script ainvest_news_search.py']))
    with pytest.raises(RuntimeError):result.result({})


@pytest.mark.parametrize('output',['../secret.json','outputs/bad.json'])
def test_only_valid_current_output_json_can_feed_downstream(tmp_path,output):
    result=SkillResults(TOOL,tmp_path)
    result.capture(dict(phase='completed',params=['python3 app/skill_runner.py execute --script ainvest_news_search.py -- --output '+output]))
    with pytest.raises(RuntimeError,match='有效 JSON'):result.result({},structured=True)


def test_empty_real_results_are_valid_but_failed_receipts_are_not(tmp_path):
    directory=tmp_path/'outputs';directory.mkdir();(directory/'news.json').write_text('[]')
    event=dict(phase='completed',params=['python3 app/skill_runner.py execute --script ainvest_news_search.py -- --output outputs/news.json'])
    result=SkillResults(TOOL,tmp_path);result.capture(event)
    assert result.result({},structured=True)['items']==[]
    result=SkillResults(TOOL,tmp_path);result.capture({**event,'observation':json.dumps(dict(ok=False,script='ainvest_news_search.py',exitCode=1))})
    with pytest.raises(RuntimeError):result.result({},structured=True)


def test_wrapper_verified_artifact_receipt_can_supply_raw_json(tmp_path):
    path=tmp_path/'outputs'/'news.json';path.parent.mkdir();path.write_text('[{"title":"fixture only"}]')
    result=SkillResults(TOOL,tmp_path)
    result.capture(dict(phase='completed',params=[json.dumps(dict(command='python3 app/skill_runner.py execute --script ainvest_news_search.py -- --source category'))],
                        observation=json.dumps(dict(ok=True,exitCode=0,artifacts=[dict(path=str(path),verified=True)]))))
    assert result.result({},structured=True)['items']==[dict(title='fixture only')]
